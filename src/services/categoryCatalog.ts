import type { CategoryCatalog, CategoryNode } from '../types/catalog';
import type { Category } from '../types/game';
import { parseCategoryTree, questionFile } from './contentSchema.mjs';

/** Convert the two-level source tree into the selection UI's internal nodes. */
export function parseCatalog(value: unknown): CategoryCatalog {
  const categories = parseCategoryTree(value);
  const nodes: CategoryNode[] = [];
  for (const category of categories) {
    nodes.push({id:category.id,name:category.name,parentId:null,kind:'group',isPlayable:false,questionFile:null});
    for (const subcategory of category.subcategories) nodes.push({
      id:`${category.id}/${subcategory.id}`,name:subcategory.name,parentId:category.id,
      kind:'topic',isPlayable:true,questionFile:questionFile(category.id,subcategory.id),questionCount:subcategory.questionCount
    });
  }
  return {roots:categories.map(category=>category.id),nodes};
}
function categoryFromNode(node: CategoryNode): Category {
  return {id:node.id,name:node.name,isPlayable:node.isPlayable,...(node.questionFile?{questionFile:node.questionFile}:{})};
}
export function playableCategories(catalog: CategoryCatalog): Category[] {
  return catalog.nodes.filter(node=>node.kind==='topic' && node.isPlayable).map(categoryFromNode);
}
export function searchCatalog(catalog: CategoryCatalog, query: string): {node:CategoryNode;path:string[]}[] {
  const normalize=(text:string)=>text.normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').trim();
  const term=normalize(query);
  if (!term) return [];
  const parents=new Map(catalog.nodes.filter(node=>node.kind==='group').map(node=>[node.id,node.name]));
  return catalog.nodes.filter(node=>node.kind==='topic').flatMap(node=>{
    const path=node.parentId ? [parents.get(node.parentId)!] : [];
    return normalize([...path,node.name].join(' ')).includes(term) ? [{node,path}] : [];
  });
}
