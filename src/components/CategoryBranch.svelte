<script lang="ts">
  import CategoryBranch from './CategoryBranch.svelte';
  import CategoryLeaf from './CategoryLeaf.svelte';
  import type { CategoryNode } from '../types/catalog';
  let {node,childrenByParent,selectedIds,remainingQuestionsById,limit,onToggle}: {
    node:CategoryNode; childrenByParent:Map<string,CategoryNode[]>; selectedIds:string[];remainingQuestionsById:Map<string,number>;limit:number;onToggle:(id:string)=>void;
  }=$props();
  let expanded=$state(false);
  const children=$derived(childrenByParent.get(node.id) ?? []);
</script>
{#if node.kind==='group'}
  <section class="catalog-group">
    <button type="button" class="catalog-toggle" aria-label={`${expanded?'طي':'توسيع'} ${node.name}`}
      aria-expanded={expanded} aria-describedby={`count-${node.id}`} aria-controls={`catalog-${node.id}`} onclick={()=>expanded=!expanded}>
      <svg aria-hidden="true" class="catalog-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d={expanded?'m6 9 6 6 6-6':'m15 6-6 6 6 6'}/>
      </svg><bdi dir="auto">{node.name}</bdi><bdi id={`count-${node.id}`} class="subcategory-count" dir="ltr">({children.length})</bdi>
    </button>
    <div id={`catalog-${node.id}`} hidden={!expanded}>
      {#if expanded}
        <div class="catalog-children" class:category-options={children.every(child=>child.kind!=='group')}>
          {#each children as child (child.id)}<CategoryBranch node={child} {childrenByParent} {selectedIds} {remainingQuestionsById} {limit} {onToggle}/>{/each}
        </div>
      {/if}
    </div>
  </section>
{:else}
  <CategoryLeaf {node} {selectedIds} {remainingQuestionsById} {limit} {onToggle}/>
{/if}

<style>
  .subcategory-count { flex: none; color: #cbd5e1; font-variant-numeric: tabular-nums; }
</style>
