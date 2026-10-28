export interface AdminCategory { id: number; slug: string; name: string }
export interface AdminSubcategory { id: number; category_id: number; slug: string; name: string }
export interface AdminQuestion {
  id: number;
  subcategory_id: number | null;
  type: 'normal' | 'tiebreaker';
  points: number;
  difficultyLevel: number;
  question: string;
  answer: string;
  format: 'text';
  image_path: null;
  audio_path: null;
  image_alt?: null;
}
export interface AdminBank {
  categories: AdminCategory[];
  subcategories: AdminSubcategory[];
  questions: AdminQuestion[];
}
