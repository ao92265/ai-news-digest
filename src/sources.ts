import type { Category } from './types.js';

export type Source =
  | { name: string; kind: 'rss'; url: string; category: Category; weight: number }
  | { name: string; kind: 'hn'; category: Category; weight: number }
  | { name: string; kind: 'arxiv'; category: Category; weight: number }
  | { name: string; kind: 'github-trending'; topics: string[]; category: Category; weight: number };

// Weight scale: 1.0 = baseline. >1 = dev/Claude Code signal (prioritize).
// <1 = general AI news (keep for context, push to bottom).
export const sources: Source[] = [
  // Claude / Anthropic — top priority
  { name: 'Claude Code Releases', kind: 'rss', url: 'https://github.com/anthropics/claude-code/releases.atom', category: 'code', weight: 1.8 },
  { name: 'Anthropic Cookbook', kind: 'rss', url: 'https://github.com/anthropics/anthropic-cookbook/commits/main.atom', category: 'code', weight: 1.2 },

  // Engineering-leaning blogs — high signal for a Claude Code user
  { name: 'Simon Willison', kind: 'rss', url: 'https://simonwillison.net/atom/everything/', category: 'blog', weight: 1.4 },
  { name: 'Latent Space', kind: 'rss', url: 'https://www.latent.space/feed', category: 'blog', weight: 1.3 },
  { name: 'GitHub Engineering', kind: 'rss', url: 'https://github.blog/engineering/feed/', category: 'blog', weight: 1.1 },

  // Community — kept high (HN surfaces Claude Code / agent discussion organically)
  { name: 'Hacker News AI', kind: 'hn', category: 'community', weight: 1.2 },

  // Code — GitHub Trending in AI topics
  { name: 'GitHub Trending AI', kind: 'github-trending', topics: ['llm', 'agents', 'artificial-intelligence', 'mcp'], category: 'code', weight: 1.1 },

  // News — lower weight; only bubble up if clustered across sources
  { name: 'TechCrunch AI', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'news', weight: 0.8 },
  { name: 'The Verge AI', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'news', weight: 0.8 },
  { name: 'Ars Technica AI', kind: 'rss', url: 'https://arstechnica.com/ai/feed/', category: 'news', weight: 0.9 },
  { name: 'MIT Tech Review AI', kind: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'news', weight: 0.8 },
  { name: 'Google News AI', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+when:1d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 0.5 },
  { name: 'Google News LLM Tools', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22claude+code%22+OR+%22cursor+ai%22+OR+%22github+copilot%22+OR+%22coding+agent%22+when:2d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 1.2 },

  // Research / video — keep but lower weight
  { name: 'arXiv cs.AI', kind: 'arxiv', category: 'research', weight: 0.7 },
  { name: 'Two Minute Papers', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', category: 'video', weight: 0.6 },
  { name: 'AI Explained', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw', category: 'video', weight: 0.7 },

  // Medium — low signal
  { name: 'Medium AI', kind: 'rss', url: 'https://medium.com/feed/tag/artificial-intelligence', category: 'blog', weight: 0.4 },
  { name: 'Medium LLM', kind: 'rss', url: 'https://medium.com/feed/tag/large-language-models', category: 'blog', weight: 0.5 },
];
