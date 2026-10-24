<script lang="ts">
  import type { CategoryNode } from '../types/catalog';
  let {node,selectedIds,limit,onToggle}: {node:CategoryNode;selectedIds:string[];limit:number;onToggle:(id:string)=>void}=$props();
  const categoryId=$derived(node.id);
  const selected=$derived(selectedIds.includes(categoryId));
  const playable=$derived(node.kind==='topic' && node.isPlayable);
</script>
<button type="button" class="category-leaf" class:selected class:planned={!playable}
  aria-pressed={selected} disabled={!playable || (!selected && selectedIds.length>=limit)}
  onclick={()=>onToggle(categoryId)}>
  <bdi dir="auto">{node.name}</bdi>{#if selected}<span aria-hidden="true"> ✓</span>{/if}
  {#if !playable}<small>{'غير متاح'}</small>{/if}
</button>
