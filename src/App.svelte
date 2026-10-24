<script lang="ts">
  import { tick } from 'svelte';
  import { deferredUpdateVersion, deferUpdate } from './services/appUpdates';
  import type { AppUpdate } from './services/appUpdates';
  import ActionButton from './components/ActionButton.svelte';
  import BackupIconButton from './components/BackupIconButton.svelte';
  import PreferenceToggle from './components/PreferenceToggle.svelte';
  import NumberRadioSetting from './components/NumberRadioSetting.svelte';
  import TimerRing from './components/TimerRing.svelte';
  import AnswerReveal from './components/AnswerReveal.svelte';
  import QuestionTeams from './components/QuestionTeams.svelte';
  import ShootoutScoreboard from './components/ShootoutScoreboard.svelte';
  import ConfirmationModal from './components/ConfirmationModal.svelte';
  import type { ConfirmationHandle, ConfirmationOptions } from './types/confirmation';
  import CategoryPicker from './components/CategoryPicker.svelte';
  import type { CategoryCatalog } from './types/catalog';
  import { playableCategories } from './services/categoryCatalog';
  import { acquireGameControl, requestGameControl, releaseGameControl, hasGameControl, observeGameControl, onTransferRequest } from './services/tabControl';
  import QuestionMedia from './components/QuestionMedia.svelte';
  import { assignBalanced, selectTiebreakers } from './engine/assignment';
  import { opposite } from './engine/rules';
  import { available, togglePower, selectOwnTile, cancelSelection, POWER_LABELS } from './engine/lifelines';
  import type { Power } from './types/game';
  import { openSelectedQuestion, showAnswer } from './engine/lifecycle';
  import { confirmScoring, beginCorrection, cancelCorrection, setCorrectionOutcome, confirmCorrection } from './engine/correction';
  import { tickTimer } from './engine/timer';
  import { withTimerCheckpoint, pauseQuestionTimer, restorePausedSession } from './engine/timerSession';
  import { createTieState, tieStarter, tieQuestion, beginTie, openTieQuestion, returnToTiePreparation, revealTieAnswer, confirmTieAnswer, resumeEarlyDraw, beginTieCorrection, setTieCorrection, cancelTieCorrection, confirmTieCorrection } from './engine/tiebreaker';
  import { readSession, saveSession, installImportedSession, pruneUnusedMedia, readPreparation, savePreparation, clearPreparation, deleteSavedGames } from './services/storage';
  import { exportBackup, parseBackup } from './services/backup';
  import { prepareGameAssets } from './services/preparation';
  import { validateImageBlob } from './services/imageValidation';
  import { loadSetupPreferences, saveSetupPreferences } from './services/settings';
  import type { Category, Outcome, Session, TeamId } from './types/game';
  import { loadCategoryCatalog, loadSelectedQuestions, loadTiebreakerQuestions } from './services/questionBank';
  let categories: Category[] = $state.raw([]);
  let catalog = $state.raw<CategoryCatalog>();
  let selectedCategoryIds: string[] = $state([]);
  let categoryCount: 4 | 6 | 8 = $state(6);
  let categoriesLoading = $state(false);
  let tiebreakerCount = $state(0);
  let draftStarter = $state<TeamId>('A');
  const draftTurn = $derived(selectedCategoryIds.length % 2 === 0 ? draftStarter : opposite(draftStarter));
  async function newSetup() {
    if (busy || pendingSave || confirmationPending || !hasGameControl()) return;
    busy=true; error='';
    try {
      await deleteSavedGames();
      clearGameState();
      aName='فريق التحدي'; bName='فريق المعرفة';
      aColor=palette[0]; bColor=palette[1];
      timerEnabled=true; tieLimit=5; categoryCount=6; selectedCategoryIds=[];
      draftStarter=Math.random()<0.5?'A':'B'; screen='setup';
      await refreshCategories();
    } catch { error='تعذر بدء لعبة جديدة. أعد المحاولة.'; }
    finally { busy=false; }
  }
  function clearGameState() {
    game=null; pendingSave=null; savedSummary=''; preparationAvailable=false;
    selectedOutcome=undefined; lastTick=0;
  }
  async function refreshCategories() {
    categoriesLoading = true;
    try {
      const [loadedCatalog,ties] = await Promise.all([loadCategoryCatalog(),loadTiebreakerQuestions()]);
      catalog = loadedCatalog;
      tiebreakerCount = ties.length;
      categories = playableCategories(catalog);
      selectedCategoryIds = selectedCategoryIds.filter(id => categories.some(c => c.id === id)).slice(0, categoryCount);
    } catch (e) { error = e instanceof Error ? e.message : 'تعذر تحميل التصنيفات'; }
    finally { categoriesLoading = false; }
  }
  function selectCategory(id: string) {
    if(!categories.some(category=>category.id===id))return;
    if (selectedCategoryIds.includes(id)) selectedCategoryIds = selectedCategoryIds.filter(categoryId => categoryId !== id);
    else if (selectedCategoryIds.length < categoryCount) selectedCategoryIds = [...selectedCategoryIds, id];
  }
  function setCategoryCount(count: 4 | 6 | 8) {
    categoryCount = count;
    selectedCategoryIds = selectedCategoryIds.slice(0, count);
  }
  // Engine transitions replace immutable snapshots. Deep Svelte proxies cannot
  // cross structuredClone or IndexedDB transaction boundaries.
  let game: Session | null = $state.raw(null);
  let pendingSave: Session | null = $state.raw(null);
  let screen: 'home'|'setup'|'board'|'prequestion'|'question'|'scoring'|'correction'|'tie-intro'|'tie-ready'|'tie-question'|'tie-scoring'|'tie-correction'|'result' = $state('home');
  let aName=$state('فريق التحدي'); let bName=$state('فريق المعرفة');
  let timerEnabled=$state(true); let tieLimit=$state(5);
  let confirmationModal=$state<ConfirmationHandle>();
  let confirmationPending=$state(false);
  let confirmationFinished:Promise<void>=Promise.resolve();
  async function requestConfirmation(options:ConfirmationOptions,onAccept?:()=>void):Promise<boolean> {
    if(confirmationPending || pendingSave || !hasGameControl() || !confirmationModal)return false;
    confirmationPending=true;
    let finish!:()=>void;
    confirmationFinished=new Promise<void>(resolve=>{finish=resolve;});
    try {
      if(game?.timer && !game.timer.paused){
        const checkpoint=pauseQuestionTimer(game);
        game=checkpoint;lastTick=0;
        if(!await persist(checkpoint))return false;
      }
      const accepted=await confirmationModal.ask(options);
      if(!accepted || !hasGameControl())return false;
      onAccept?.();
      return true;
    } finally {confirmationPending=false;finish();}
  }
  let aColor=$state('#2563EB'); let bColor=$state('#DC2626');
  const palette=['#2563EB','#DC2626','#16A34A','#FACC15','#9333EA'];
  // LocalStorage holds only setup preferences, never the authoritative score or game.
  const restoredSetup = loadSetupPreferences();
  if (restoredSetup) {
    aName = restoredSetup.teamAName; bName = restoredSetup.teamBName;
    const restoredAColor = palette.includes(restoredSetup.teamAColor) ? restoredSetup.teamAColor : palette[0];
    aColor = restoredAColor;
    bColor = palette.includes(restoredSetup.teamBColor) && restoredSetup.teamBColor !== restoredAColor
      ? restoredSetup.teamBColor : palette.find(color=>color!==restoredAColor)!;
    timerEnabled = restoredSetup.timerEnabled; tieLimit = restoredSetup.tieLimit;
    categoryCount = restoredSetup.categoryCount; selectedCategoryIds = restoredSetup.categoryIds;
  }
  $effect(() => {
    saveSetupPreferences({ teamAName: aName, teamBName: bName, teamAColor: aColor,
      teamBColor: bColor, timerEnabled, tieLimit: Number(tieLimit), categoryCount,
      categoryIds: selectedCategoryIds });
  });
  let waitingUpdate=$state.raw<AppUpdate>();
  let dismissedUpdate=$state(deferredUpdateVersion());
  let promptedUpdate=$state('');
  $effect(() => {
    const handler=(event:Event)=>{waitingUpdate=(event as CustomEvent<AppUpdate>).detail;};
    window.addEventListener('trivia-update',handler);
    return ()=>window.removeEventListener('trivia-update',handler);
  });
  $effect(()=>{
    const update=waitingUpdate;
    if(!update || update.version===dismissedUpdate || update.version===promptedUpdate ||
      screen!=='home' || controlState!=='owner' || busy || pendingSave || confirmationPending || !confirmationModal)return;
    promptedUpdate=update.version;
    void applyUpdate(update);
  });
  async function applyUpdate(update:AppUpdate) {
    if(!await requestConfirmation({title:'تحديث جديد متاح',message:'يتوفر إصدار جديد من التطبيق. سيتم حفظ تقدمك ثم إعادة تحميل التطبيق.',confirmLabel:'تحديث الآن',cancelLabel:'لاحقًا'})){
      if(hasGameControl() && screen==='home' && !pendingSave){dismissedUpdate=update.version;deferUpdate(update.version);}
      else promptedUpdate='';
      return;
    }
    if(waitingUpdate?.worker!==update.worker || update.worker.state!=='installed')return;
    if(game && !await persist(pauseQuestionTimer(game))){promptedUpdate='';return;}
    navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
    update.worker.postMessage({type:'ACTIVATE_UPDATE'});
  }
  async function handleMedia(open:boolean) {
    if(open && game?.timer && !game.timer.paused) await updateTimer(true);
  }
  let selectedOutcome: Outcome | undefined = $state(undefined);
  let lastTick = 0;
  let savingTimer = false;
  let lastCheckpoint = 0;
  let paused=$derived.by(() => game?.timer?.paused ?? true);
  let timerRunning=$derived.by(() => (screen==='question'||screen==='tie-question') && !!game?.timerEnabled && !!game?.timer && !game.timer.paused && !busy && !pendingSave && !confirmationPending);
  let controlState: 'checking'|'owner'|'read-only'|'unsupported' = $state('checking');
  let takingControl = $state(false);
  let error=$state(''); let busy=$state(false);
  let preparationMessage=$state('');
  let preparationAvailable=$state(false);
  let preparationAbort = $state.raw<AbortController>();
  async function completePreparation(next: Session) {
    preparationAbort=new AbortController();
    busy=true;
    try {
      if (import.meta.env.PROD) {
        if (!('serviceWorker' in navigator)) throw new Error('هذا المتصفح لا يدعم تجهيز اللعب دون اتصال');
        let timeout: ReturnType<typeof setTimeout>;
        try {
          await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_resolve,reject)=>{
            timeout=setTimeout(()=>reject(new Error('تعذر تجهيز التطبيق دون اتصال. أعد المحاولة.')),15000);
          })]);
        } finally { clearTimeout(timeout!); }
      }
      await prepareGameAssets(next.tiles.map(tile=>tile.question),next.tie!.questions,progress=>{
        preparationMessage=`${progress.label}: ${progress.completed} / ${progress.total}`;
      },next.categories,preparationAbort.signal);
      await confirmationFinished;
      preparationAbort.signal.throwIfAborted();
      if(await persist(next)) {
        screen='board';
        await clearPreparation().catch(()=>undefined); preparationAvailable=false;
        void pruneUnusedMedia().catch(()=>undefined);
      }
    } finally { busy=false;preparationMessage='';preparationAbort=undefined; }
  }
  async function continuePreparation() {
    if(busy)return;
    try {
      const next=await readPreparation();
      if(!next)return;
      const current=await readSession();
      if(current && !await requestConfirmation({title:'استكمال التحضير',message:'هل تريد استبدال اللعبة المحفوظة بعد إكمال التحضير؟',confirmLabel:'استكمال واستبدال'}))return;
      await completePreparation(next);
    } catch(cause) {error=cause instanceof DOMException && cause.name==='AbortError'?'':cause instanceof Error?cause.message:'تعذر متابعة التحضير';}
  }
  async function cancelPreparation() {
    if(!await requestConfirmation({title:'إلغاء التحضير',message:'إلغاء التحضير مع الاحتفاظ باللعبة السابقة؟',confirmLabel:'إلغاء التحضير',cancelLabel:'متابعة التحضير'},()=>preparationAbort?.abort()))return;
    preparationAbort?.abort();
    await clearPreparation(); preparationAvailable=false;
    preparationMessage=''; screen='home';
  }
  let active=$derived.by(() => game?.tiles.find(t=>t.question.id===game?.activeId));
  let activeTeam=$derived.by(() => game?.teams[game.turn]);
  let savedSummary=$state('');
  async function deleteSavedGame() {
    if(screen!=='home' || busy || !await requestConfirmation({title:'حذف اللعبة المحفوظة',message:'هل تريد حذف اللعبة المحفوظة وأي تحضير غير مكتمل؟ لا يمكن التراجع عن الحذف. ستبقى أسماء الفرق والإعدادات محفوظة.',confirmLabel:'حذف اللعبة'}))return;
    busy=true; error='';
    try {
      await deleteSavedGames();
      game=null; savedSummary=''; preparationAvailable=false; selectedOutcome=undefined;
    } catch { error='تعذر حذف اللعبة المحفوظة. أعد المحاولة.'; }
    finally { busy=false; }
  }
  $effect(() => {
    if(screen!=='home' || controlState!=='owner')return;
    void readSession().then(saved=>{
      savedSummary=saved?`${saved.teams.A.name} × ${saved.teams.B.name} · ${western(saved.tiles.filter(tile=>tile.completed).length)} / ${western(saved.tiles.length)}`:'';
    }).catch(()=>{error='تعذر قراءة اللعبة المحفوظة؛ لن يتم حذفها. استخدم إعادة المحاولة أو استورد نسخة احتياطية.';});
  });
  function western(value:number):string { return new Intl.NumberFormat('en-US').format(value); }
  async function takeControl() {
    takingControl = true; error = '';
    try {
      if (!await requestGameControl()) { error = 'تعذر التحقق من التحكم باللعبة. أعد المحاولة.'; return; }
      const saved = await readSession();
      if (saved) {
        const recovered = restorePausedSession(saved);
        await saveSession(recovered);
        game = recovered;
        screen = recovered.phase as typeof screen;
      } else { game = null; screen = 'home'; }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'تعذر استعادة التحكم'; }
    finally { takingControl = false; }
  }
  $effect(() => {
    const unsubscribe = observeGameControl(value => { controlState = value;
      if(value!=='owner')confirmationModal?.dismiss();
      if(value==='owner') void readPreparation().then(draft=>{preparationAvailable=!!draft;}).catch(()=>{error='تعذر قراءة تحضير اللعبة';});
    });
    const unregister = onTransferRequest(async () => {
      if (!hasGameControl()) return;
      if (busy || pendingSave || savingTimer || confirmationPending) throw new Error('انتظر اكتمال الحفظ أو التأكيد قبل نقل التحكم');
      busy = true;
      try {
      if (game) {
        const checkpoint = pauseQuestionTimer(game);
        await saveSession(checkpoint);
        game = checkpoint;
      }
      releaseGameControl();
      } finally { busy = false; }
    });
    void acquireGameControl();
    return () => { unsubscribe(); unregister(); releaseGameControl(); };
  });
  async function persist(next:Session) { busy=true; error=''; try { await saveSession(next); game=next; pendingSave=null; return true; } catch { pendingSave=pauseQuestionTimer(next); error='تعذر حفظ التقدم. الرجاء إعادة المحاولة قبل المتابعة.'; return false; } finally {busy=false;} }
  async function retrySave() {
    if (!pendingSave) return;
    if (await persist(pendingSave)) screen=game!.phase as typeof screen;
  }
  let importInput = $state<HTMLInputElement>();
  async function downloadBackup() {
    if (busy) return;
    busy = true; error = '';
    try {
      let saved: Session | undefined;
      if (game) {
        const pausedGame = pauseQuestionTimer(game);
        await saveSession(pausedGame);
        game = pausedGame;
        saved = pausedGame;
      } else saved = await readSession();
      if (!saved) throw new Error('لا توجد لعبة محفوظة للتصدير');
      const blob = await exportBackup(saved);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'trivia-game-backup.zip'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'تعذر تصدير النسخة الاحتياطية'; }
    finally { busy = false; }
  }
  async function uploadBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy || screen !== 'home') return;
    busy = true; error = '';
    try {
      const imported = parseBackup(await file.arrayBuffer());
      for (const item of imported.media) await validateImageBlob(item.blob,item.source);
      let oldLabel = 'لا توجد لعبة';
      try {
        const existing = await readSession();
        if (existing) oldLabel = `${existing.teams.A.name} × ${existing.teams.B.name}`;
      } catch { oldLabel = 'الحفظ الحالي غير قابل للقراءة وسيتم استبداله فقط بموافقتك'; }
      const newLabel = `${imported.session.teams.A.name} × ${imported.session.teams.B.name}`;
      if (!await requestConfirmation({title:'استيراد نسخة احتياطية',message:`اللعبة الحالية: ${oldLabel}\nالنسخة المستوردة: ${newLabel}\nهل تريد استبدال اللعبة الحالية؟`,confirmLabel:'استيراد واستبدال'})) return;
      const restored = restorePausedSession(imported.session);
      await installImportedSession(restored, imported.media);
      // Cleanup happens only after replacement is durable. A cleanup error
      // must never turn a successful import into an apparent failed import.
      void pruneUnusedMedia().catch(() => undefined);
      game = restored;
      screen = 'home';
    } catch (cause) { error = cause instanceof Error ? cause.message : 'تعذر استيراد النسخة الاحتياطية'; }
    finally { busy = false; input.value = ''; }
  }
  async function start() {
    if (categoriesLoading || tiebreakerCount < tieLimit * 2) {
      error='بنك الأسئلة الفاصلة غير كافٍ لعدد المحاولات المحدد.';
      return;
    }
    if (selectedCategoryIds.length !== categoryCount) {
      error = `اختر ${western(categoryCount)} تصنيفات قبل بدء اللعبة`;
      return;
    }
    if(aColor===bColor){error='يجب أن يكون لكل فريق لون مختلف';return;}
    error = '';
    const chosen = categories.filter(c => selectedCategoryIds.includes(c.id));
    let tiles: ReturnType<typeof assignBalanced>;
    try {
      busy = true;
      preparationMessage = 'تحميل أسئلة التصنيفات والتحقق من صعوبتها';
      const [questionBank, pool] = await Promise.all([loadSelectedQuestions(chosen), loadTiebreakerQuestions()]);
      tiles = assignBalanced(chosen, questionBank);
      if (pool.length < tieLimit * 2) throw new Error('أسئلة الجولة الفاصلة غير كافية');
      const selectedTies = selectTiebreakers(pool, tieLimit * 2);
      const first = draftStarter;
      const next:Session={version:1,teams:{ A:{id:'A',name:aName.trim()||'فريق التحدي',color:aColor,score:0,used:[]},B:{id:'B',name:bName.trim()||'فريق المعرفة',color:bColor,score:0,used:[]} },categories:chosen,tiles,turn:first,timerEnabled,tieLimit,phase:'board',tie:createTieState(selectedTies,tieLimit,first)};
      await savePreparation(next); preparationAvailable=true;
      await completePreparation(next);
    } catch (e) { error=e instanceof DOMException && e.name==='AbortError'?'':e instanceof Error?e.message:'تعذر تجهيز اللعبة'; }
    finally {busy=false;preparationMessage='';}
  }
  async function choose(id:string) {
    if(!game||busy) return;
    try { if(await persist(selectOwnTile({...game,boardScrollY:window.scrollY},id))) screen='prequestion'; }
    catch(e) { error=e instanceof Error?e.message:'تعذر اختيار السؤال'; }
  }
  async function usePower(power: Power, actor: TeamId) {
    if(!game||busy) return;
    try { await persist(togglePower(game,power,actor)); }
    catch(e) { error=e instanceof Error?e.message:'تعذر تفعيل القوة'; }
  }
  async function backToBoard() {
    if(!game||busy) return;
    try { if(await persist(cancelSelection(game))) screen='board'; }
    catch(e) { error=e instanceof Error?e.message:'تعذر العودة'; }
  }
  async function openQuestion() {
    if (!game || busy) return;
    try { if (await persist(openSelectedQuestion(game))) screen='question'; }
    catch { error='تعذر فتح السؤال.'; }
  }
  async function updateTimer(pause: boolean) {
    if (!game || !game.timer || !game.timerEnabled || busy) return;
    if (await persist(withTimerCheckpoint(game, { ...game.timer, paused: pause }))) lastTick=0;
  }
  async function reveal() {
    if (!game || busy) return;
    try { if (await persist(showAnswer(game))) { screen='scoring'; selectedOutcome=undefined; } }
    catch { error='لم يسمح بعد بعرض الإجابة.'; }
  }
  async function confirm() {
    if (!game || !active || !selectedOutcome || busy) return;
    try {
      const next = confirmScoring(game, selectedOutcome);
      if (await persist(next)) {
        // The domain engine is the sole authority for progression and results.
        // Use the committed result to choose the next screen.
        screen = next.phase as typeof screen;
        selectedOutcome = undefined;
      }
    }
    catch { error='تعذر تأكيد النتيجة.'; }
  }
  async function endGameEarly() {
    if (!game || busy || !await requestConfirmation({title:'إنهاء اللعبة',message:'إنهاء اللعبة وحذف تقدمها المحفوظ؟ ستعود إلى الصفحة الرئيسية ولا يمكن متابعة هذه اللعبة.',confirmLabel:'إنهاء اللعبة'})) return;
    busy=true; error='';
    try {
      await deleteSavedGames();
      clearGameState(); screen='home';
    } catch { error='تعذر إنهاء اللعبة. أعد المحاولة.'; }
    finally { busy=false; }
  }
  async function undo() {
    if (!game || busy || !await requestConfirmation({title:'تصحيح النتيجة',message:'هل تريد التراجع عن آخر نتيجة لتصحيحها؟',confirmLabel:'فتح التصحيح'})) return;
    try { if (await persist(beginCorrection(game))) screen='correction'; }
    catch(e) { error=e instanceof Error?e.message:'تعذر التراجع'; }
  }
  async function updateCorrection(outcome: Outcome) {
    if (!game || busy) return;
    try { await persist(setCorrectionOutcome(game, outcome)); }
    catch(e) { error=e instanceof Error?e.message:'تعذر تغيير الإجابة'; }
  }
  async function finishCorrection(save: boolean) {
    if (!game || busy) return;
    try { const next=save?confirmCorrection(game):cancelCorrection(game); if(await persist(next))screen=next.phase as typeof screen; }
    catch(e) { error=e instanceof Error?e.message:'تعذر إتمام التصحيح'; }
  }
  /** Restore both timer copies from their persisted checkpoint, never from elapsed wall time. */
  async function resume() {
    error = '';
    try {
      const saved = await readSession();
      if (!saved) return;
      const restored = restorePausedSession(saved);
      // Persist paused restoration before exposing the recovered game to the host.
      if (!await persist(restored)) return;
      screen = restored.phase as typeof screen;
    } catch {
      error = 'تعذر قراءة اللعبة المحفوظة؛ لن يتم حذفها.';
    }
  }
  async function goHome() {
    if (!game) { screen='home'; return; }
    if (game.timer && !game.timer.paused) {
      const next = pauseQuestionTimer(game);
      if (!await persist(next)) return;
    }
    screen='home';
  }
  $effect(() => {
    if (screen !== 'board' || !game) return;
    const position = game.boardScrollY ?? 0;
    void tick().then(() => window.scrollTo(0,position));
  });
  $effect(() => {
    let checkpointTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(checkpointTimer);
      checkpointTimer = setTimeout(() => {
        if(screen!=='board' || !game || busy || pendingSave || confirmationPending || !hasGameControl())return;
        if(Math.abs((game.boardScrollY ?? 0)-window.scrollY)<1)return;
        game={...game,boardScrollY:window.scrollY};
        void saveSession(game).catch(()=>{pendingSave=game;error='تعذر حفظ موضع اللوحة. أعد المحاولة.';});
      },250);
    };
    window.addEventListener('scroll',handler,{passive:true});
    return () => {clearTimeout(checkpointTimer);window.removeEventListener('scroll',handler);};
  });
  async function pendingBoard() {
    if (!game || busy) return;
    if (await persist(pauseQuestionTimer(game))) screen='board';
  }
  async function tieAction(change:(g:Session)=>Session) {
    if(!game||busy)return;
    try { const next=change(game); if(await persist(next)) screen=next.phase as typeof screen; }
    catch(e) {error=e instanceof Error?e.message:'تعذر تحديث الجولة الفاصلة';}
  }
  async function tieExit() { if(await requestConfirmation({title:'العودة للاستعداد',message:'العودة إلى استعداد الجولة الفاصلة مع حفظ الوقت؟',confirmLabel:'العودة للاستعداد'})) await tieAction(returnToTiePreparation); }
  async function tieEnd() { await endGameEarly(); }
  async function tieUndo() { if(await requestConfirmation({title:'تصحيح السؤال الفاصل',message:'التراجع عن آخر نتيجة فاصلة؟',confirmLabel:'فتح التصحيح'})) await tieAction(beginTieCorrection); }
  // One stable interval; changes to reactive game state must not restart the clock.
  // The elapsed clock is reset explicitly whenever a timer starts or is paused.
  $effect(() => {
    const interval = setInterval(() => {
      if (!hasGameControl() || !timerRunning || !game?.timer) {
        lastTick = 0;
        return;
      }
      const now = performance.now();
      if (!lastTick) { lastTick = now; return; }
      const elapsed = Math.max(0, now - lastTick);
      lastTick = now;
      const snapshot = game;
      const nextTimer = tickTimer(snapshot.timer!, elapsed, !(screen === 'tie-question' && snapshot.tie?.format === 'shootout'));
      if (nextTimer === snapshot.timer) return;
      const updated = withTimerCheckpoint(snapshot, nextTimer);
      game = updated;
      if (updated.phase !== snapshot.phase) {
        screen = updated.phase as typeof screen;
        selectedOutcome = undefined;
      }
      const phaseChanged = nextTimer.phase !== snapshot.timer!.phase;
      if (!savingTimer && (phaseChanged || nextTimer.paused || now - lastCheckpoint >= 1000)) {
        savingTimer = true;
        lastCheckpoint = now;
        void saveSession(updated).catch(() => {
          // Never keep counting down after a failed authoritative checkpoint.
          if (!game || game.phase !== updated.phase) return;
          game = pauseQuestionTimer(game);
          pendingSave = game;
          error = 'تعذر حفظ المؤقت. أعد المحاولة قبل المتابعة.';
        }).finally(() => { savingTimer = false; });
      }
    }, 200);
    return () => clearInterval(interval);
  });
  $effect(() => {
    const handler = () => {
      if (!hasGameControl() || !document.hidden || !game?.timer || game.timer.paused) return;
      const checkpoint = pauseQuestionTimer(game);
      game = checkpoint;
      lastTick = 0;
      void saveSession(checkpoint).catch(() => {
        pendingSave = checkpoint;
        error = 'تعذر حفظ المؤقت بعد إخفاء التطبيق.';
      });
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  });
</script>
<svelte:head><title>تحدي المعرفة</title></svelte:head>
<ConfirmationModal bind:this={confirmationModal}/>
{#if controlState !== 'owner'}
  <div class="control-overlay" role="alertdialog" tabindex="-1" aria-modal="true" aria-label="التحكم باللعبة">
    <div class="card control-notice">
      <h2>اللعبة مفتوحة في تبويب آخر</h2>
      <p>{controlState === 'unsupported' ? 'هذا المتصفح لا يدعم تنسيق التبويبات الآمن؛ لا يمكن تعديل اللعبة.' : controlState === 'checking' ? 'جارٍ التحقق من التبويب المتحكم…' : 'هذا التبويب للقراءة فقط حتى يتم التحقق من ملكية التحكم.'}</p>
      {#if controlState === 'read-only'}
        <button type="button" disabled={takingControl} onclick={takeControl}>{takingControl ? 'جارٍ التحقق…' : 'استلام التحكم / إعادة المحاولة'}</button>
      {/if}
    </div>
  </div>
{/if}
<div inert={controlState !== 'owner'} aria-hidden={controlState !== 'owner'}>
<main class="container">
  <header class="app-navbar">
    <strong class="brand">✦ تحدي المعرفة</strong>
    <nav class="navbar-actions" aria-label="أدوات التطبيق">
      <BackupIconButton icon="import" label="استيراد نسخة احتياطية" hint={screen==='home'?'استيراد نسخة احتياطية':'استيراد نسخة احتياطية — من الرئيسية فقط'} onclick={()=>importInput?.click()} disabled={screen!=='home' || busy || !!pendingSave || confirmationPending}/>
      <BackupIconButton icon="export" label="تصدير نسخة احتياطية" onclick={downloadBackup} disabled={busy || !!pendingSave || confirmationPending}/>
    </nav>
    <input bind:this={importInput} type="file" accept=".zip,application/zip" onchange={uploadBackup} hidden aria-label="اختر ملف نسخة احتياطية"/>
  </header>
  {#if error}<div class="error" role="alert">{error}</div>{/if}
  {#if pendingSave}<div class="error" role="alert"><p>الحفظ متوقف. أعد المحاولة قبل المتابعة.</p><ActionButton label="إعادة المحاولة" onclick={retrySave} disabled={busy}/></div>{/if}
  {#if preparationAbort}<ActionButton label="إلغاء التحضير" secondary onclick={cancelPreparation}/>{/if}
  <div inert={busy || !!pendingSave}>
  {#if preparationMessage}<div class="card" role="status">{preparationMessage}</div>{/if}
  {#if preparationAvailable && screen==='home'}<div class="actions"><ActionButton label="متابعة التحضير" onclick={continuePreparation} disabled={busy}/><ActionButton label="إلغاء التحضير" secondary onclick={cancelPreparation} disabled={busy}/></div>{/if}
  {#if screen==='home'}
    {#if savedSummary}<section class="card saved-game-summary" aria-label="اللعبة المحفوظة"><h2>اللعبة المحفوظة</h2><p>{savedSummary}</p><div class="saved-game-delete"><ActionButton label="حذف اللعبة المحفوظة" secondary onclick={deleteSavedGame} disabled={busy || confirmationPending}/></div></section>{/if}
    <section class="hero card"><span class="eyebrow">لعبة معلومات لفريقين</span><h1>تحدي المعرفة</h1><p>تحدّوا معلوماتكم في منافسة بين فريقين، واستخدموا القوى الخاصة لقلب النتيجة وحسم الفوز.</p><div class="actions"><ActionButton label="لعبة جديدة" onclick={newSetup}/>{#if savedSummary}<ActionButton label="متابعة اللعبة المحفوظة" secondary onclick={resume}/>{/if}</div></section>
  {:else if screen==='setup'}
    <section class="card"><h1>إعداد اللعبة</h1><div class="form-grid"><label>اسم الفريق الأول<input bind:value={aName} maxlength="35"/></label><label>اسم الفريق الثاني<input bind:value={bName} maxlength="35"/></label></div><NumberRadioSetting title="حد الجولة الفاصلة" description="اختر عدد المحاولات لكل فريق في الجولة الفاصلة. إجابة صحيحة تساوي نقطة فاصلة، والتساوي بعد جميع المحاولات يعني التعادل." options={[1,2,3,4,5]} bind:value={tieLimit}/>
      <PreferenceToggle title="مؤقت الإجابة" description="دقيقة واحدة (60 ثانية) للإجابة، ثم 15 ثانية لفرصة الفريق الآخر. عند الإيقاف تُلعب الأسئلة دون مؤقت." bind:checked={timerEnabled}/>
      <div class="team-color-setup"><fieldset><legend>لون الفريق الأول</legend><div class="color-swatches">{#each palette as color}<button type="button" class:color-selected={aColor===color} class:light-team={color==='#FACC15'} style:--swatch={color} disabled={bColor===color} onclick={()=>aColor=color} aria-label={`لون الفريق الأول ${color}`} aria-pressed={aColor===color}></button>{/each}</div></fieldset><fieldset><legend>لون الفريق الثاني</legend><div class="color-swatches">{#each palette as color}<button type="button" class:color-selected={bColor===color} class:light-team={color==='#FACC15'} style:--swatch={color} disabled={aColor===color} onclick={()=>bColor=color} aria-label={`لون الفريق الثاني ${color}`} aria-pressed={bColor===color}></button>{/each}</div></fieldset></div><p class="muted">دور اختيار التصنيف: {draftTurn === 'A' ? aName : bName}</p><p class="muted">اختر تصنيفاتكم المفضلة، ثم ابدأوا التحدي.</p><div class="category-picker"><h2>عدد التصنيفات</h2><div class="choices category-count-options">{#each [4,6,8] as count}<button class:selected={categoryCount===count} aria-pressed={categoryCount===count} onclick={()=>setCategoryCount(count as 4|6|8)}>{western(count)}</button>{/each}</div><h2>اختر {western(categoryCount)} تصنيفات ({western(selectedCategoryIds.length)} محددة)</h2>{#if categoriesLoading}<p>تحميل التصنيفات…</p>{:else}{#if catalog}<CategoryPicker {catalog} selectedIds={selectedCategoryIds} limit={categoryCount} onToggle={selectCategory}/>{/if}{/if}</div>{#if !categoriesLoading && tiebreakerCount < tieLimit * 2}<p class="muted" role="status">لا يمكن إنشاء لعبة بعد: يلزم {western(tieLimit * 2)} سؤالًا فاصلًا على الأقل لعدد المحاولات المحدد.</p>{/if}<div class="actions"><ActionButton label="إنشاء اللعبة" onclick={start} disabled={busy || categoriesLoading || selectedCategoryIds.length!==categoryCount || tiebreakerCount < tieLimit * 2}/><ActionButton label="الرئيسية" onclick={goHome} secondary/></div></section>
  {:else if screen==='board' && game}
    {#if game.activeId}<div class="pending-question"><ActionButton label="متابعة السؤال" onclick={()=>screen=game!.phase as typeof screen}/></div>{/if}
    <div class="scoreboard"><div style:--team-color={game.teams.A.color} class="team"><span>{game.teams.A.name}</span><strong>{western(game.teams.A.score)}</strong></div><div style:--team-color={game.teams.B.color} class="team"><span>{game.teams.B.name}</span><strong>{western(game.teams.B.score)}</strong></div></div>
    <div class="turn card">دور الاختيار: <strong style:color={activeTeam?.color}>{activeTeam?.name}</strong></div>
    <details class="card powers"><summary>القوى الخاصة</summary><div class="power-grid">
      {#each ['risk','gift'] as power}
        {@const code = power as Power}
        <button class:power-active={game.activePower===code} class="power-button" disabled={!available(game,code,game.turn)&&!(game.activePower===code&&game.activePowerTeam===game.turn)} onclick={()=>usePower(code,game!.turn)}>{POWER_LABELS[code]} {game.teams[game.turn].used.includes(code)?'✓ مستخدمة':game.activePower===code?'— إلغاء':''}</button>
      {/each}
    </div>{#if game.activePower==='gift'}<p class="power-notice">تم منح الفريق الآخر 200 نقطة مؤقتًا. اختر سؤالًا بقيمة 600 فقط.</p>{/if}</details>
    <div class="board">{#each game.categories as cat}<section class="category card"><div class="category-banner" style:background-image={cat.image?`linear-gradient(#12131688,#121316cc),url('${cat.image}')`:undefined}><h2>{cat.name}</h2></div><div class="tile-labels"><span>{game.teams.A.name}</span><span>{game.teams.B.name}</span></div><div class="tiles">{#each [200,400,600] as p}{#each ['A','B'] as owner}{@const tile=game.tiles.find(t=>t.question.categoryId===cat.id && t.question.points===p && t.owner===owner)}<button class:completed={tile?.completed} class:current={game.turn===owner} class="tile" class:light-team={game.teams[owner as TeamId].color==='#FACC15'} style:--tile-color={game.teams[owner as TeamId].color} disabled={busy||!!game.activeId||!tile||tile.completed||owner!==game.turn||(game.activePower==='gift' && p!==600)} onclick={()=>tile&&choose(tile.question.id)}>{tile?.completed?'✓':western(p)}</button>{/each}{/each}</div></section>{/each}</div>
    <div class="actions">{#if game.lastRecord}<ActionButton label="تراجع عن آخر نتيجة" secondary onclick={undo} disabled={busy}/>{/if}<ActionButton label="إنهاء اللعبة" secondary onclick={endGameEarly}/><ActionButton label="الرئيسية" secondary onclick={goHome}/></div>
  {:else if screen==='prequestion' && game && active}
    <section class="card question"><span class="eyebrow">قبل عرض السؤال</span><h1>{game.categories.find(c=>c.id===active?.question.categoryId)?.name} · {western(active.question.points)}</h1><p>سيتم كشف السؤال عند الضغط على الزر التالي.</p>
      <div class="power-notice">{game.activePower?`القوة النشطة: ${POWER_LABELS[game.activePower]}`:'لا توجد قوة نشطة'}</div>
      <div class="power-grid"><button class="power-button" class:power-active={game.activePower==='steal'} disabled={!available(game,'steal',opposite(game.turn)) && game.activePower!=='steal'} onclick={()=>usePower('steal',opposite(game!.turn))}>خطف السؤال — {game.teams[opposite(game.turn)].name} {game.activePower==='steal'?'(إلغاء)':''}</button></div>
      {#if game.activePower==='steal'}<p class="muted">تم قفل السؤال. الفريق الخاطف يجيب أولًا.</p>{/if}
      <div class="actions"><ActionButton label="العودة للوحة" secondary onclick={pendingBoard}/><ActionButton label="إنهاء اللعبة" secondary onclick={endGameEarly}/><ActionButton label="عرض السؤال" onclick={openQuestion} disabled={busy}/><ActionButton label="إلغاء الاختيار" secondary onclick={backToBoard} disabled={busy || game.activePower==='steal'}/><ActionButton label="الرئيسية" secondary onclick={goHome}/></div></section>
  {:else if screen==='question' && game && active}
    <section class="card question"><QuestionTeams teams={game.teams} owner={active.owner} firstResponder={game.activePower==='steal'?game.activePowerTeam??active.owner:active.owner} timer={game.timerEnabled?game.timer:undefined} showAnswerTurn/><span class="eyebrow">{game.categories.find(c=>c.id===active?.question.categoryId)?.name} · {western(active.question.points)}</span><h1>{active.question.question}</h1>{#if active.question.image}<QuestionMedia path={active.question.image} alt={active.question.imageAlt} onOpenChange={handleMedia}/>{/if}{#if game.activePower}<div class="power-notice">{POWER_LABELS[game.activePower]} · {game.teams[game.activePowerTeam!].name}</div>{/if}{#if game.timerEnabled && game.timer}<TimerRing timer={game.timer} onToggle={()=>updateTimer(!paused)} disabled={busy} primaryLabel={game.activePower==='steal'?'وقت الفريق الخاطف':'وقت الإجابة الأساسي'}/>{/if}<div class="actions"><ActionButton label="إظهار الإجابة" onclick={reveal} disabled={busy}/><ActionButton label="الرئيسية" secondary onclick={goHome}/></div></section>
  {:else if screen==='scoring' && game && active}
    <section class="card question"><QuestionTeams teams={game.teams} owner={active.owner}/><span class="eyebrow">تأكيد الإجابة</span><h1>{active.question.question}</h1>{#if active.question.image}<QuestionMedia path={active.question.image} alt={active.question.imageAlt} onOpenChange={handleMedia}/>{/if}<AnswerReveal answer={active.question.answer}/>{#if game.activePower}<div class="power-notice">{POWER_LABELS[game.activePower]}{game.activePower==='risk'?' — مضاعفة النقاط عند النجاح، وخصم قيمة السؤال عند عدم النجاح':game.activePower==='gift'?' — 200 نقطة مُنحت مسبقًا، والمكافأة تعتمد على الإجابة':' — الفريق الخاطف أجاب أولًا'}</div>{/if}<h2>من أجاب بشكل صحيح؟</h2><div class="choices">{#each [{id:'A' as Outcome,text:game.teams.A.name},{id:'B' as Outcome,text:game.teams.B.name},{id:'neither' as Outcome,text:'لا أحد'}] as option}<button class:selected={selectedOutcome===option.id} aria-pressed={selectedOutcome===option.id} onclick={()=>selectedOutcome=option.id}>{option.text}</button>{/each}</div><div class="confirm-score-action"><ActionButton label="تأكيد النتيجة" onclick={confirm} disabled={!selectedOutcome||busy}/></div></section>
  {:else if screen==='tie-intro' && game?.tie}
    <section class="card question"><span class="eyebrow">الجولة الفاصلة</span><h1>تعادل الفريقان</h1><p>{#if game.tie.format==='shootout'}لكل فريق {western(game.tieLimit)} محاولات بالتناوب. يجيب صاحب المحاولة فقط خلال 60 ثانية عند تفعيل المؤقت. تحسم الجولة عندما يستحيل اللحاق بالمتصدر، والتساوي بعد جميع المحاولات يعني التعادل. يتم اختيار الفريق الأول عشوائيًا عند البدء.{:else}أول إجابة صحيحة تحسم الجولة المحفوظة القديمة.{/if} لا تتغير النقاط الأصلية.</p><div class="actions"><ActionButton label="بدء الجولة الفاصلة" onclick={()=>tieAction(beginTie)}/><ActionButton label="إنهاء بالتعادل" secondary onclick={tieEnd}/>{#if game.lastRecord}<ActionButton label="تصحيح آخر سؤال عادي" secondary onclick={undo}/>{/if}</div></section>
  {:else if screen==='tie-ready' && game?.tie}
    <section class="card question"><span class="eyebrow">الجولة الفاصلة</span><h1>السؤال {western(game.tie.confirmed.length+1)} من {western(game.tie.questions.length)}</h1><ShootoutScoreboard {game}/><p>الفريق الذي يبدأ: <strong style:color={game.teams[tieStarter(game.tie)].color}>{game.teams[tieStarter(game.tie)].name}</strong></p><div class="actions"><ActionButton label={game.tie.pending?'متابعة السؤال':'السؤال التالي'} onclick={()=>tieAction(openTieQuestion)}/>{#if !game.tie.pending && game.tie.correctionEligible !== false && game.tie.confirmed.length>0}<ActionButton label="تصحيح آخر سؤال فاصل" secondary onclick={tieUndo}/>{/if}<ActionButton label="إنهاء بالتعادل" secondary onclick={tieEnd}/><ActionButton label="الرئيسية" secondary onclick={goHome}/>{#if game.lastRecord}<ActionButton label="تصحيح آخر سؤال عادي" secondary onclick={undo}/>{/if}</div></section>
  {:else if screen==='tie-question' && game?.tie}
    <section class="card question"><span class="eyebrow">السؤال الفاصل {western(game.tie.confirmed.length+1)} من {western(game.tie.questions.length)}</span><h1>{tieQuestion(game.tie)?.question}</h1>{#if tieQuestion(game.tie)?.image}<QuestionMedia path={tieQuestion(game.tie)!.image!} alt={tieQuestion(game.tie)?.imageAlt} onOpenChange={handleMedia}/>{/if}<QuestionTeams teams={game.teams} owner={tieStarter(game.tie)} ownerLabel="صاحب المحاولة" timer={game.timerEnabled?game.timer:undefined} showAnswerTurn/>{#if game.timerEnabled && game.timer}<TimerRing timer={game.timer} onToggle={()=>updateTimer(!paused)} disabled={busy} primaryLabel={game.activePower==='steal'?'وقت الفريق الخاطف':'وقت الإجابة الأساسي'}/>{/if}<div class="actions"><ActionButton label="إظهار الإجابة" disabled={busy} onclick={()=>tieAction(revealTieAnswer)}/><ActionButton label="العودة للاستعداد" secondary onclick={tieExit}/><ActionButton label="إنهاء بالتعادل" secondary onclick={tieEnd}/>{#if game.lastRecord}<ActionButton label="تصحيح آخر سؤال عادي" secondary onclick={undo}/>{/if}</div></section>
  {:else if screen==='tie-scoring' && game?.tie}
    <section class="card question"><span class="eyebrow">حسم السؤال الفاصل</span><h1>{tieQuestion(game.tie)?.question}</h1>{#if tieQuestion(game.tie)?.image}<QuestionMedia path={tieQuestion(game.tie)!.image!} alt={tieQuestion(game.tie)?.imageAlt} onOpenChange={handleMedia}/>{/if}<AnswerReveal answer={tieQuestion(game.tie)?.answer ?? ''}/><p class="muted">{game.tie.format==='shootout'?'يجيب صاحب المحاولة فقط. ':''}لا تتغير النقاط الأصلية.</p><div class="choices">{#each (game.tie.format==='shootout'?[{id:tieStarter(game.tie) as Outcome,text:'إجابة صحيحة'},{id:'neither' as Outcome,text:'إجابة خاطئة'}]:[{id:'A' as Outcome,text:game.teams.A.name},{id:'B' as Outcome,text:game.teams.B.name},{id:'neither' as Outcome,text:'لا أحد'}]) as option}<button class:selected={selectedOutcome===option.id} aria-pressed={selectedOutcome===option.id} onclick={()=>selectedOutcome=option.id}>{option.text}</button>{/each}</div><div class="actions"><ActionButton label="تأكيد النتيجة" disabled={!selectedOutcome||busy} onclick={()=>{if(selectedOutcome)void tieAction(g=>confirmTieAnswer(g,selectedOutcome!)).then(()=>{selectedOutcome=undefined;});}}/><ActionButton label="إنهاء بالتعادل" secondary onclick={tieEnd}/></div></section>
  {:else if screen==='tie-correction' && game?.tie?.correction}
    <section class="card question"><span class="eyebrow">تصحيح آخر نتيجة فاصلة</span><h1>{game.tie.questions[game.tie.confirmed.length-1]?.question}</h1><AnswerReveal answer={game.tie.questions[game.tie.confirmed.length-1]?.answer ?? ''}/><QuestionTeams teams={game.teams} owner={game.tie.confirmed.length % 2 === 1 ? game.tie.first : opposite(game.tie.first)} ownerLabel="صاحب المحاولة"/><div class="choices">{#each (game.tie.format==='shootout'?[{id:(game.tie.confirmed.length % 2 === 1 ? game.tie.first : opposite(game.tie.first)) as Outcome,text:'إجابة صحيحة'},{id:'neither' as Outcome,text:'إجابة خاطئة'}]:[{id:'A' as Outcome,text:game.teams.A.name},{id:'B' as Outcome,text:game.teams.B.name},{id:'neither' as Outcome,text:'لا أحد'}]) as option}<button class:selected={game.tie.correction.selected===option.id} aria-pressed={game.tie.correction.selected===option.id} onclick={()=>tieAction(g=>setTieCorrection(g,option.id))}>{option.text}</button>{/each}</div><div class="actions"><ActionButton label="تأكيد التصحيح" disabled={!game.tie.correction.selected||busy} onclick={()=>tieAction(confirmTieCorrection)}/><ActionButton label="إلغاء التصحيح" secondary onclick={()=>tieAction(cancelTieCorrection)}/></div></section>
  {:else if screen==='result' && game}
    <section class="card question final-result"><span class="eyebrow">النتيجة النهائية</span><h1>{#if game.result==='neither'}تعادل{:else}الفائز: <span style:color={game.teams[game.result??'A'].color}>{game.teams[game.result??'A'].name}</span>{/if}</h1><div class="scoreboard result-scoreboard" aria-label="النتيجة النهائية للفريقين">
      {#each ['A','B'] as teamId}
        {@const team=game.teams[teamId as TeamId]}
        <div class="result-team-card" class:winner={game.result===team.id} style:--team-color={team.color}>
          <span class="result-team-status">{game.result===team.id?'الفائز':game.result==='neither'?'تعادل':'النتيجة'}</span>
          <span class="result-team-name">{team.name}</span>
          <strong class="result-team-score"><bdi>{western(team.score)}</bdi></strong>
          <span class="result-points-label">نقطة</span>
        </div>
      {/each}
    </div><ShootoutScoreboard {game}/><div class="actions result-actions"><ActionButton label="لعبة جديدة" onclick={newSetup}/>{#if game.tie?.earlyDraw}<ActionButton label="متابعة الجولة الفاصلة" onclick={()=>tieAction(resumeEarlyDraw)}/>{/if}{#if game.tie && game.tie.confirmed.length && game.tie.correctionEligible !== false && !game.tie.earlyDraw}<ActionButton label="تصحيح آخر سؤال فاصل" secondary onclick={tieUndo}/>{/if}{#if game.lastRecord}<ActionButton label="تصحيح آخر سؤال عادي" secondary onclick={undo}/>{/if}<ActionButton label="الرئيسية" secondary onclick={goHome}/></div></section>
  {:else if screen==='correction' && game?.correction && game.lastRecord}
    {@const correctedQuestion = game.tiles.find(tile=>tile.question.id===game?.lastRecord?.questionId)?.question}
    <section class="card question">
      <span class="eyebrow">تصحيح آخر نتيجة</span>
      <h1>تعديل نتيجة السؤال الأخير</h1>
      <p class="muted">{game.tiles.find(t=>t.question.id===game?.lastRecord?.questionId)?.question.question}</p>
      <AnswerReveal answer={correctedQuestion?.answer ?? ''}/>
      <div class="choices">
        {#each [{id:'A' as Outcome,text:game.teams.A.name},{id:'B' as Outcome,text:game.teams.B.name},{id:'neither' as Outcome,text:'لا أحد'}] as option}
          <button class:selected={game.correction.selected===option.id} aria-pressed={game.correction.selected===option.id} disabled={busy} onclick={()=>updateCorrection(option.id)}>{option.text}</button>
        {/each}
      </div>
      <div class="actions"><ActionButton label="تأكيد التصحيح" disabled={busy || !game.correction.selected} onclick={()=>finishCorrection(true)}/><ActionButton label="إلغاء التصحيح" secondary disabled={busy} onclick={()=>finishCorrection(false)}/></div>
    </section>
  {/if}
  </div>
  <footer>تحدي المعرفة · كل سؤال فرصة للفوز</footer>
</main>
</div>
