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
  llmHeadline?: string;
  llmSummary?: string;
  llmWhy?: string;
  score?: number;
  adopt?: boolean;
};
