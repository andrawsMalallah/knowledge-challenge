<script lang="ts">
  import type { Team, TeamId } from '../types/game';
  import type { TimerState } from '../engine/timer';
  import { opposite } from '../engine/rules';
  let {teams,owner,firstResponder=owner,timer,showAnswerTurn=false,ownerLabel='السؤال من اختيار'}: {
    teams:Record<TeamId,Team>;owner:TeamId;firstResponder?:TeamId;timer?:TimerState;showAnswerTurn?:boolean;ownerLabel?:string;
  }=$props();
  const responder=$derived(timer?.phase==='steal'?opposite(firstResponder):firstResponder);
</script>

<div class="question-teams">
  <div class="question-team-badge" style:--team-color={teams[owner].color}>
    <span>{ownerLabel}</span><strong>{teams[owner].name}</strong>
  </div>
  {#if showAnswerTurn}
    <div class="question-team-badge answer-turn" style:--team-color={teams[responder].color} role="status">
      {#if timer?.phase==='finished'}<strong>انتهى وقت الإجابة</strong>
      {:else}<span>فرصة الإجابة{timer?.phase==='steal'?' · 15 ثانية':''}</span><strong>{teams[responder].name}</strong>{/if}
    </div>
  {/if}
</div>
