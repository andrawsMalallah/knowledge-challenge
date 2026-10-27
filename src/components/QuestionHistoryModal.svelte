<script lang="ts">
  import { tick } from 'svelte';

  let {count,onReset,disabled=false}: {
    count:number;onReset:()=>Promise<void>;disabled?:boolean;
  }=$props();
  let dialog=$state<HTMLDialogElement>();
  let closeButton=$state<HTMLButtonElement>();
  const id=$props.id();

  export async function show():Promise<void> {
    await tick();
    if(!dialog || dialog.open)return;
    dialog.showModal();
    closeButton?.focus();
  }

  export function dismiss():void {
    if(dialog?.open)dialog.close();
  }

  function trapFocus(event:KeyboardEvent):void {
    if(event.key!=='Tab' || !dialog)return;
    const controls=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first=controls[0];const last=controls.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }

  function western(value:number):string {
    return new Intl.NumberFormat('en-US').format(value);
  }
</script>

<dialog bind:this={dialog} class="confirmation-modal question-history-modal" aria-labelledby={`${id}-title`} aria-describedby={`${id}-count ${id}-description`}
  onkeydown={trapFocus} oncancel={event=>{event.preventDefault();dismiss();}}>
  <h2 id={`${id}-title`}>سجل الأسئلة المستخدمة</h2>
  <p id={`${id}-count`} class="question-history-count">تم استخدام <strong><bdi>{western(count)}</bdi></strong> سؤالًا.</p>
  <p id={`${id}-description`}>يمنع هذا السجل تكرار الأسئلة التي ظهرت بالفعل في الألعاب الجديدة حتى تنفد مجموعة التصنيف، ثم تصبح أسئلة تلك المجموعة متاحة من جديد.</p>
  <div class="confirmation-actions">
    <button type="button" class="secondary question-history-reset" disabled={disabled || count===0} onclick={onReset}>إعادة تعيين سجل الأسئلة</button>
    <button type="button" bind:this={closeButton} onclick={dismiss}>إغلاق</button>
  </div>
</dialog>
