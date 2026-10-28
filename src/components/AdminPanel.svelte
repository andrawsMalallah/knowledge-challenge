<script lang="ts">
  import { untrack } from 'svelte';
  import { bankFilenames, guideFilename, loadBank, publishBank, readGuideReplacement, readReplacement, validateBank } from '../services/admin';
  import type { BankTable, Snapshot } from '../services/admin';
  import type { AdminBank } from '../types/admin';
  let { token, initialSnapshot, onlogout }: {token:string;initialSnapshot:Snapshot;onlogout:()=>void}=$props();
  let snapshot=$state.raw<Snapshot>(untrack(()=>initialSnapshot));
  let replacements=$state.raw<Partial<Record<BankTable,unknown[]>>>({});
  let guideReplacement=$state<string>();
  let busy=$state(false);let error=$state('');let notice=$state('');let published=$state(false);
  let dialog=$state<HTMLDialogElement>();let cancelButton=$state<HTMLButtonElement>();
  const tables:{key:BankTable;label:string}[]=[{key:'categories',label:'التصنيفات الرئيسية'},{key:'subcategories',label:'التصنيفات الفرعية'},{key:'questions',label:'الأسئلة'}];
  const selectedTables=$derived(tables.filter(table=>replacements[table.key]!==undefined));
  function downloadGuide() {
    if(snapshot.guide===null)return;
    const url=URL.createObjectURL(new Blob([snapshot.guide],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=guideFilename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function selectGuide(event:Event) {
    const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];if(!file)return;
    error='';notice='';guideReplacement=undefined;
    try {guideReplacement=await readGuideReplacement(file);notice=`تم اختيار ${guideFilename}.`;}
    catch(cause){error=cause instanceof Error?cause.message:'تعذر قراءة الملف.';}
    finally{input.value='';}
  }
  function download(table:BankTable) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot.bank[table],null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=bankFilenames[table];link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function selectFile(event:Event, table:BankTable) {
    const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];if(!file)return;
    error='';notice='';removeSelection(table);
    try {const rows=await readReplacement(file,table);replacements={...replacements,[table]:rows};notice=`تم اختيار ${bankFilenames[table]} (${rows.length} صف).`}
    catch(cause){error=cause instanceof Error?cause.message:'تعذر قراءة الملف.';}
    finally{input.value='';}
  }
  function removeSelection(table:BankTable) {const next={...replacements};delete next[table];replacements=next;}
  function combinedBank():AdminBank {
    return {categories:(replacements.categories??snapshot.bank.categories) as AdminBank['categories'],subcategories:(replacements.subcategories??snapshot.bank.subcategories) as AdminBank['subcategories'],questions:(replacements.questions??snapshot.bank.questions) as AdminBank['questions']};
  }
  function confirmPublish() {
    try {validateBank(combinedBank());error='';dialog?.showModal();cancelButton?.focus();}
    catch(cause){error=cause instanceof Error?cause.message:'البيانات غير صالحة.';}
  }
  async function publish() {
    dialog?.close();busy=true;error='';notice='';
    try {
      const sha=await publishBank(token,snapshot,combinedBank(),guideReplacement ?? snapshot.guide);
      replacements={};guideReplacement=undefined;published=true;notice=`تم النشر (${sha.slice(0,7)}). ستظهر الملفات الجديدة بعد اكتمال نشر اللعبة.`;
      try {snapshot=await loadBank(token);published=false;} catch {notice+=' تعذر تحديث الملفات المعروضة؛ اخرج وادخل مرة أخرى قبل إجراء تغييرات جديدة.';}
    } catch(cause){error=cause instanceof Error?cause.message:'تعذر نشر الملفات.';}
    finally{busy=false;}
  }
  function leave() {if((!selectedTables.length && guideReplacement===undefined) || window.confirm('ستفقد الملفات المحددة غير المنشورة. هل تريد الخروج؟'))onlogout();}
</script>
<main class="container admin-page">
  <header><strong class="brand">✦ تحدي المعرفة</strong><button type="button" class="secondary" onclick={leave} disabled={busy}>خروج إلى اللعبة</button></header>
  <h1>إدارة ملفات البنك</h1><p class="muted">نزّل الملفات الحالية أو اختر ملفات جديدة لاستبدالها.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="admin-notice" role="status">{notice}</p>{/if}
  <section class="card admin-section" aria-labelledby="download-title"><h2 id="download-title">تنزيل الملفات الحالية</h2>
    {#each tables as table}<div class="file-row"><div><strong>{table.label}</strong><small dir="ltr">{bankFilenames[table.key]}</small></div><button type="button" class="secondary" onclick={()=>download(table.key)} disabled={busy || published}>تنزيل</button></div>{/each}
  </section>
  <section class="card admin-section" aria-labelledby="upload-title"><h2 id="upload-title">رفع ملفات جديدة</h2><p>اختر ملفاً واحداً أو أكثر. يجب أن يطابق اسم كل ملف الاسم الأصلي تماماً.</p>
    {#each tables as table}<div class="file-row"><div><label for={`file-${table.key}`}><strong>{table.label}</strong></label><small dir="ltr">{bankFilenames[table.key]}</small>{#if replacements[table.key]}<span>تم اختيار الملف ({replacements[table.key]?.length} صف)</span>{/if}</div><div class="file-actions"><input id={`file-${table.key}`} type="file" accept=".json,application/json" onchange={event=>selectFile(event,table.key)} disabled={busy || published}/>{#if replacements[table.key]}<button type="button" class="secondary" onclick={()=>removeSelection(table.key)} disabled={busy}>إلغاء الاختيار</button>{/if}</div></div>{/each}
    <p class="muted">الملفات غير المحددة ستبقى كما هي. ستُفحص الملفات الثلاثة معاً قبل النشر.</p>
  </section>
  <section class="card admin-section" aria-labelledby="guide-title"><h2 id="guide-title">دليل بنك الأسئلة</h2><p>نزّل الدليل مع ملف الأسئلة، ثم ارفع النسخة المحدّثة بعد تعديلهما.</p>{#if snapshot.guide===null}<p role="status">الدليل غير موجود في المستودع بعد. اختر ملف QUESTION_BANK_GUIDE.md ثم انشره لإضافته.</p>{/if}
    <div class="file-row"><div><strong>الدليل الحالي</strong><small dir="ltr">{guideFilename}</small></div><button type="button" class="secondary" onclick={downloadGuide} disabled={busy || published || snapshot.guide===null}>تنزيل الدليل</button></div>
    <div class="file-row"><div><label for="file-guide"><strong>رفع دليل جديد</strong></label><small dir="ltr">{guideFilename}</small>{#if guideReplacement!==undefined}<span>تم اختيار الملف</span>{/if}</div><div class="file-actions"><input id="file-guide" type="file" accept=".md,text/markdown,text/plain" onchange={selectGuide} disabled={busy || published}/>{#if guideReplacement!==undefined}<button type="button" class="secondary" onclick={()=>guideReplacement=undefined} disabled={busy}>إلغاء الاختيار</button>{/if}</div></div>
    <p class="muted">تحقق من أن محتوى الدليل يطابق ملف الأسئلة؛ لا يفحص التطبيق تطابقهما تلقائياً.</p>
  </section>
  <button type="button" onclick={confirmPublish} disabled={busy || published || (!selectedTables.length && guideReplacement===undefined)}>مراجعة ونشر</button>
  <dialog bind:this={dialog} class="confirmation-modal" aria-labelledby="publish-title" aria-describedby="publish-description"><h2 id="publish-title">استبدال الملفات؟</h2><p id="publish-description">سيتم استبدال الملفات التالية مباشرة في المستودع: {[...selectedTables.map(table=>bankFilenames[table.key]),...(guideReplacement===undefined?[]:[guideFilename])].join('، ')}. لا يمكن التراجع من هذه الصفحة. تأكد من تنزيل نسخة احتياطية قبل المتابعة.</p><div class="confirmation-actions"><button type="button" onclick={publish}>نعم، انشر</button><button type="button" class="secondary" bind:this={cancelButton} onclick={()=>dialog?.close()}>إلغاء</button></div></dialog>
</main>
<style>
  .admin-page header{gap:1rem;flex-wrap:wrap}.admin-section{margin-block:1rem}.admin-section h2{margin-top:0}.file-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1rem 0;border-bottom:1px solid #52525b}.file-row>div:first-child{display:grid;gap:.2rem}.file-row small{color:#b0b0bb;text-align:right}.file-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;max-width:100%}.file-actions input{max-width:100%;font:inherit}.admin-notice{padding:1rem;background:#223c2d;border-radius:.75rem}
</style>
