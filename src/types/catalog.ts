export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  kind: 'group' | 'topic';
  isPlayable: boolean;
  questionFile: string | null;
}
export interface CategoryCatalog {
  roots: string[];
  nodes: CategoryNode[];
}
