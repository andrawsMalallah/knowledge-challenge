<script lang="ts">
  import type { Session, TeamId } from '../types/game';
  import { opposite } from '../engine/rules';
  let { game }: { game: Session } = $props();
</script>
{#if game.tie?.format === 'shootout' && (game.phase.startsWith('tie-') || game.tie.status === 'finished')}
  <section class="shootout-scoreboard" aria-label="نتيجة الجولة الفاصلة" aria-live="polite">
    {#each ['A','B'] as teamId}
      {@const team = teamId as TeamId}
      {@const results = game.tie.confirmed.filter((_,index)=>(index % 2 === 0 ? game.tie!.first : opposite(game.tie!.first)) === team)}
      <div class="shootout-team" style:--team-color={game.teams[team].color}>
        <strong>{game.teams[team].name}: <bdi>{results.filter(answer=>answer===team).length}</bdi></strong>
        <div class="shootout-attempts">
          {#each Array(game.tieLimit) as _,index}
            <span class:scored={results[index]===team} class:missed={results[index]==='neither'} aria-label={`المحاولة ${index+1}: ${results[index]===team?'صحيحة':results[index]==='neither'?'خاطئة':'لم تلعب'}`}>{results[index]===team?'✓':results[index]==='neither'?'✕':'○'}</span>
          {/each}
        </div>
      </div>
    {/each}
  </section>
{/if}
<style>
  .shootout-scoreboard{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-block:20px;text-align:start}
  .shootout-team{min-width:0;background:#292a2d;border-top:4px solid var(--team-color);border-radius:12px;padding:14px}
  .shootout-attempts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;direction:ltr}
  .shootout-attempts span{display:grid;place-items:center;width:30px;height:30px;border:1px solid #94a3b8;border-radius:50%;color:#cbd5e1}
  .shootout-attempts .scored{color:#86efac;border-color:#86efac}.shootout-attempts .missed{color:#fca5a5;border-color:#fca5a5}
</style>
