<script lang="ts">
  import type { CategoryNode } from '../types/catalog';
  let {node,selectedIds,remainingQuestionsById,limit,onToggle}: {node:CategoryNode;selectedIds:string[];remainingQuestionsById:Map<string,number>;limit:number;onToggle:(id:string)=>void}=$props();
  const categoryId=$derived(node.id);
  const selected=$derived(selectedIds.includes(categoryId));
  const playable=$derived(node.kind==='topic' && node.isPlayable);
  const remaining=$derived(remainingQuestionsById.get(categoryId));
</script>
<button type="button" class="category-leaf" class:selected class:planned={!playable}
  aria-label={playable && remaining!==undefined ? `${node.name}، ${remaining} سؤالًا متبقيًا` : node.name}
  aria-pressed={selected} disabled={!playable || (!selected && selectedIds.length>=limit)}
  onclick={()=>onToggle(categoryId)}>
  <span class="category-leaf-label"><bdi dir="auto">{node.name}</bdi>{#if remaining!==undefined}<bdi class="question-count" dir="ltr" aria-hidden="true">({remaining})</bdi>{/if}</span>{#if selected}<span aria-hidden="true"> ✓</span>{/if}
  {#if !playable}<small>{'غير متاح'}</small>{/if}
</button>

<style>
  .category-leaf-label { display: inline-flex; align-items: center; gap: .55rem; }
  .question-count { flex: none; color: #cbd5e1; font-variant-numeric: tabular-nums; }
</style>
