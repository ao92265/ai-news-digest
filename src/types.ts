export type Category = 'news' | 'blog' | 'research' | 'video' | 'community' | 'code';

export type Item = {
  id: string;
  title: string;
  url: string;
  source: string;
  category: Category;
  publishedAt: string;
  summary?: string;
  weight: number;
  score?: number;
  trending?: boolean;
};
