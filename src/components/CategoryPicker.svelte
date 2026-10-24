<script lang="ts">
  import type { CategoryCatalog, CategoryNode } from '../types/catalog';
  import { searchCatalog } from '../services/categoryCatalog';
  import CategoryBranch from './CategoryBranch.svelte';
  import CategoryLeaf from './CategoryLeaf.svelte';
  let {catalog,selectedIds,limit,onToggle}: {catalog:CategoryCatalog;selectedIds:string[];limit:number;onToggle:(id:string)=>void}=$props();
  let query=$state('');
  let search=$state('');
  let visibleCount=$state(40);
  $effect(()=>{
    const value=query;
    const debounce=setTimeout(()=>{search=value;visibleCount=40;},180);
    return ()=>clearTimeout(debounce);
  });
  const byId=$derived(new Map(catalog.nodes.map(node=>[node.id,node])));
  const childrenByParent=$derived.by(()=>{
    const children=new Map<string,CategoryNode[]>();
    for(const node of catalog.nodes)if(node.parentId)children.set(node.parentId,[...(children.get(node.parentId) ?? []),node]);
    return children;
  });
  const results=$derived(searchCatalog(catalog,search));
  const selected=$derived(catalog.nodes.filter(node=>node.kind==='topic' && node.isPlayable && selectedIds.includes(node.id)));
</script>
<div class="catalog-picker">
  {#if !catalog.roots.length}<p class="catalog-empty" role="status">لا توجد تصنيفات حاليًا. أضف التصنيفات الرئيسية والفرعية إلى فهرس التصنيفات لتظهر هنا.</p>{:else}
  <label class="catalog-search">البحث في التصنيفات<input type="search" bind:value={query} placeholder="ابحث عن تصنيف" autocomplete="off"/></label>
  <p class="muted">وسّع الأقسام لاستكشاف التصنيفات، أو ابحث عن تصنيفك المفضل.</p>
  {#if selected.length}
    <div class="selected-categories" aria-label="التصنيفات المحددة">
      {#each selected as node (node.id)}<button type="button" class="secondary" aria-label={`إزالة ${node.name}`} onclick={()=>onToggle(node.id)}><bdi dir="auto">{node.name}</bdi> ×</button>{/each}
    </div>
  {/if}
  {#if search.trim()}
    <p role="status">نتائج البحث: <bdi>{results.length}</bdi></p>
    <div class="catalog-results category-options">
      {#each results.slice(0,visibleCount) as result (result.node.id)}
        <div class="catalog-search-result"><p class="catalog-breadcrumb">{#each result.path as label}<bdi dir="auto">{label}</bdi><span aria-hidden="true"> / </span>{/each}</p><CategoryLeaf node={result.node} {selectedIds} {limit} {onToggle}/></div>
      {/each}
    </div>
    {#if !results.length}<p>لا توجد تصنيفات مطابقة.</p>{/if}
    {#if results.length>visibleCount}<button type="button" class="secondary" onclick={()=>visibleCount+=40}>عرض المزيد</button>{/if}
  {:else}
    {#each catalog.roots as id (id)}
      {@const node=byId.get(id)}
      {#if node}<CategoryBranch {node} {childrenByParent} {selectedIds} {limit} {onToggle}/>{/if}
    {/each}
  {/if}
  {/if}
</div>
