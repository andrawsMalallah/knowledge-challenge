<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { ConfirmationOptions } from '../types/confirmation';
  let dialog=$state<HTMLDialogElement>();
  let cancelButton=$state<HTMLButtonElement>();
  let options=$state<ConfirmationOptions>();
  let resolveDecision: ((accepted:boolean)=>void)|undefined;
  let opener: HTMLElement|null=null;
  const id=$props.id();
  export async function ask(next: ConfirmationOptions): Promise<boolean> {
    if(resolveDecision)return false;
    opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    options=next;
    const decision=new Promise<boolean>(resolve=>{resolveDecision=resolve;});
    await tick();
    if(!resolveDecision)return false;
    try { dialog!.showModal();cancelButton?.focus(); }
    catch { dismiss(); }
    return decision;
  }
  function settle(accepted:boolean):void {
    const resolve=resolveDecision;
    resolveDecision=undefined;
    if(dialog?.open)dialog.close();
    if(opener?.isConnected)opener.focus();
    opener=null;
    resolve?.(accepted);
  }
  export function dismiss():void {settle(false);}
  function trapFocus(event:KeyboardEvent):void {
    if(event.key!=='Tab' || !dialog)return;
    const controls=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first=controls[0];const last=controls.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
  onDestroy(dismiss);
</script>
<dialog bind:this={dialog} class="confirmation-modal" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
  onkeydown={trapFocus}
  oncancel={event=>{event.preventDefault();dismiss();}} onclose={()=>{if(!dialog?.open)dismiss();}}>
  {#if options}
    <h2 id={`${id}-title`}>{options.title}</h2>
    <p id={`${id}-message`}>{options.message}</p>
    <div class="confirmation-actions">
      <button type="button" class="confirmation-confirm" onclick={()=>settle(true)}>{options.confirmLabel ?? 'تأكيد'}</button>
      <button type="button" class="secondary confirmation-cancel" bind:this={cancelButton} onclick={dismiss}>{options.cancelLabel ?? 'إلغاء'}</button>
    </div>
  {/if}
</dialog>
