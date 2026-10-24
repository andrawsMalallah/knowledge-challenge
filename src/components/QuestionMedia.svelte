<script lang="ts">
  import { onMount } from 'svelte';
  import { readMedia } from '../services/storage';

  let { path, alt = 'صورة السؤال', onOpenChange }: { path: string; alt?: string; onOpenChange?: (open: boolean) => void } = $props();
  let source = $state('');
  let failure = $state('');
  let open = $state(false);
  let zoom = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  const touches = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; originalX: number; originalY: number } | null = null;
  let pinchStart: { distance: number; zoom: number } | null = null;
  const limitZoom = (value: number) => Math.min(4, Math.max(1, value));
  function distance() {
    const [a,b] = [...touches.values()];
    return a && b ? Math.hypot(a.x-b.x,a.y-b.y) : 0;
  }
  function resetGestures() { touches.clear(); dragStart=null; pinchStart=null; }
  function pointerDown(event: PointerEvent) {
    touches.set(event.pointerId,{ x:event.clientX,y:event.clientY });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (touches.size >= 2) { pinchStart={distance:distance(),zoom}; dragStart=null; }
    else if (zoom>1) dragStart={x:event.clientX,y:event.clientY,originalX:offsetX,originalY:offsetY};
  }
  function pointerMove(event: PointerEvent) {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (touches.size>=2 && pinchStart && pinchStart.distance>0) {
      zoom=limitZoom(pinchStart.zoom * distance()/pinchStart.distance);
      if (zoom===1) { offsetX=0; offsetY=0; }
    } else if (dragStart && zoom>1) {
      offsetX=dragStart.originalX+event.clientX-dragStart.x;
      offsetY=dragStart.originalY+event.clientY-dragStart.y;
    }
  }
  function pointerEnd(event: PointerEvent) {
    touches.delete(event.pointerId); pinchStart=null; dragStart=null;
    if (touches.size===1 && zoom>1) {
      const remaining=[...touches.values()][0];
      dragStart={x:remaining.x,y:remaining.y,originalX:offsetX,originalY:offsetY};
    }
  }
  let overlay = $state<HTMLDialogElement>();

  onMount(() => {
    let disposed = false;
    let objectUrl = '';
    void (async () => {
      try {
        const media = await readMedia(path);
        if (!media) throw new Error('الصورة غير متاحة في النسخة المحفوظة');
        objectUrl = URL.createObjectURL(media);
        if (disposed) URL.revokeObjectURL(objectUrl);
        else source = objectUrl;
      } catch (error) { if (!disposed) failure = error instanceof Error ? error.message : 'تعذر تحميل الصورة'; }
    })();
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (open) onOpenChange?.(false);
    };
  });
  function show() { if (!source) return; resetGestures(); open = true; zoom = 1; offsetX = 0; offsetY = 0; onOpenChange?.(true); requestAnimationFrame(() => overlay?.showModal()); }
  function close() { if(!open)return;overlay?.close();open = false; resetGestures(); onOpenChange?.(false); }
  function keepFocusInside(event:KeyboardEvent) {
    if(event.key!=='Tab'||!overlay)return;
    const controls=overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first=controls[0];const last=controls[controls.length-1];
    if(!first)return;
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
  function adjust(delta: number) { zoom = Math.max(1, Math.min(4, Math.round((zoom + delta) * 10) / 10)); if (zoom === 1) { offsetX = 0; offsetY = 0; } }

</script>

{#if failure}<p class="media-error" role="alert">{failure}</p>{:else if source}
  <button type="button" class="media-preview" onclick={show} aria-label="تكبير صورة السؤال"><img src={source} alt={alt}/><span>تكبير الصورة ⤢</span></button>
{:else}<p class="muted" role="status">جاري تحميل صورة السؤال…</p>{/if}

{#if open}
  <dialog class="media-overlay" aria-label="معاينة صورة السؤال" bind:this={overlay} onkeydown={keepFocusInside} oncancel={event=>{event.preventDefault();close();}} onclose={close}>
    <div class="media-toolbar">
      <button type="button" onclick={() => adjust(.5)} aria-label="تكبير">＋</button>
      <button type="button" onclick={() => adjust(-.5)} aria-label="تصغير">−</button>
      <button type="button" onclick={() => {zoom=1;offsetX=0;offsetY=0;}}>إعادة الضبط</button>
      <button type="button" class="media-close" onclick={close}>إغلاق ✕</button>
    </div>
    <div class="media-stage" role="img" aria-label="صورة قابلة للتكبير والسحب" onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerEnd} onpointercancel={pointerEnd}>
      <img src={source} alt={alt} draggable="false" style:transform={`translate(${offsetX}px, ${offsetY}px) scale(${zoom})`}/>
    </div>
  </dialog>
{/if}
