import type { Category } from './types.js';

export type Source =
  | { name: string; kind: 'rss'; url: string; category: Category; weight: number }
  | { name: string; kind: 'hn'; category: Category; weight: number }
  | { name: string; kind: 'arxiv'; category: Category; weight: number }
  | { name: string; kind: 'github-trending'; topics: string[]; category: Category; weight: number };

export const sources: Source[] = [
  { name: 'TechCrunch AI', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'news', weight: 1.0 },
  { name: 'The Verge AI', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'news', weight: 1.0 },
  { name: 'Ars Technica AI', kind: 'rss', url: 'https://arstechnica.com/ai/feed/', category: 'news', weight: 1.0 },
  { name: 'MIT Tech Review AI', kind: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'news', weight: 1.0 },

  { name: 'Google News AI', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+when:1d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 0.85 },
  { name: 'Google News LLM', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22large+language+model%22+OR+%22generative+AI%22+when:1d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 0.85 },

  { name: 'Medium AI', kind: 'rss', url: 'https://medium.com/feed/tag/artificial-intelligence', category: 'blog', weight: 0.6 },
  { name: 'Medium LLM', kind: 'rss', url: 'https://medium.com/feed/tag/large-language-models', category: 'blog', weight: 0.7 },

  { name: 'arXiv cs.AI', kind: 'arxiv', category: 'research', weight: 0.8 },
  { name: 'Hacker News AI', kind: 'hn', category: 'community', weight: 0.95 },

  { name: 'GitHub Trending AI', kind: 'github-trending', topics: ['artificial-intelligence', 'llm', 'agents', 'machine-learning'], category: 'code', weight: 0.85 },

  { name: 'Two Minute Papers', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', category: 'video', weight: 0.7 },
  { name: 'AI Explained', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw', category: 'video', weight: 0.8 },
];
