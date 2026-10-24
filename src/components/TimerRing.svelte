<script lang="ts">
  import type { TimerState } from '../engine/timer';
  import { timerLabel } from '../engine/timer';
  import ActionButton from './ActionButton.svelte';
  let { timer, onToggle, disabled = false, primaryLabel = 'وقت الإجابة الأساسي' }: {
    timer: TimerState; onToggle: () => void; disabled?: boolean; primaryLabel?: string;
  } = $props();
  const progress = $derived(timer.remainingMs / (timer.phase === 'primary' ? 60000 : 15000));
</script>
<div class="timer-ring" class:steal={timer.phase==='steal'} class:paused={timer.paused} class:warning={timer.remainingMs<=10000}>
  <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="timer-track" cx="60" cy="60" r="54"/><circle class="timer-progress" cx="60" cy="60" r="54" pathLength="1" stroke-dasharray="1" stroke-dashoffset={1-progress}/></svg>
  <bdi>{timerLabel(timer.remainingMs)}</bdi>
</div>
{#if timer.phase!=='finished'}<ActionButton label={timer.paused?'▶ متابعة الوقت':'Ⅱ إيقاف مؤقت'} secondary={!timer.paused} onclick={onToggle} {disabled}/>{/if}
<p class="timer-phase" role="status">{timer.phase==='primary'?primaryLabel:timer.phase==='steal'?'فرصة الفريق الآخر — 15 ثانية':'انتهى وقت الإجابة'}{timer.paused?' · متوقف مؤقتًا':''}</p>
