import type { Category } from './types.js';

export type Source =
  | { name: string; kind: 'rss'; url: string; category: Category; weight: number }
  | { name: string; kind: 'hn'; category: Category; weight: number }
  | { name: string; kind: 'arxiv'; category: Category; weight: number }
  | { name: string; kind: 'github-trending'; topics: string[]; category: Category; weight: number }
  | { name: string; kind: 'reddit'; subs: string[]; minScore: number; category: Category; weight: number };

// Weights: 1.0 = baseline. >1 = dev/Claude Code signal (prioritize).
// Dropped: broad Google News AI query, Medium tags (low signal, SEO spam, market noise).
export const sources: Source[] = [
  // Claude / Anthropic — top priority
  { name: 'Claude Code Releases', kind: 'rss', url: 'https://github.com/anthropics/claude-code/releases.atom', category: 'code', weight: 2.0 },
  { name: 'Anthropic Cookbook', kind: 'rss', url: 'https://github.com/anthropics/anthropic-cookbook/commits/main.atom', category: 'code', weight: 1.3 },
  { name: 'Awesome Claude Code', kind: 'rss', url: 'https://github.com/hesreallyhim/awesome-claude-code/commits/main.atom', category: 'code', weight: 1.4 },
  { name: 'Awesome MCP Servers', kind: 'rss', url: 'https://github.com/punkpeye/awesome-mcp-servers/commits/main.atom', category: 'code', weight: 1.3 },

  // Official AI lab feeds
  { name: 'OpenAI News', kind: 'rss', url: 'https://openai.com/news/rss.xml', category: 'news', weight: 1.4 },
  { name: 'Google DeepMind', kind: 'rss', url: 'https://www.deepmind.com/blog/rss.xml', category: 'news', weight: 1.2 },
  { name: 'Hugging Face Blog', kind: 'rss', url: 'https://huggingface.co/blog/feed.xml', category: 'blog', weight: 1.2 },

  // High-signal dev blogs / newsletters
  { name: 'Simon Willison', kind: 'rss', url: 'https://simonwillison.net/atom/everything/', category: 'blog', weight: 1.5 },
  { name: 'Latent Space', kind: 'rss', url: 'https://www.latent.space/feed', category: 'blog', weight: 1.3 },
  { name: 'Import AI (Jack Clark)', kind: 'rss', url: 'https://jack-clark.net/feed/', category: 'blog', weight: 1.3 },
  { name: 'The Gradient', kind: 'rss', url: 'https://thegradient.pub/rss/', category: 'blog', weight: 1.1 },
  { name: 'GitHub Engineering', kind: 'rss', url: 'https://github.blog/engineering/feed/', category: 'blog', weight: 1.1 },
  { name: 'KDnuggets', kind: 'rss', url: 'https://www.kdnuggets.com/feed', category: 'blog', weight: 1.1 },

  // Medium AI-focused publications (mixed quality — Skip filter drops noise)
  { name: 'Medium: Towards Data Science', kind: 'rss', url: 'https://medium.com/feed/towards-data-science', category: 'blog', weight: 1.3 },
  { name: 'Medium: Towards AI', kind: 'rss', url: 'https://medium.com/feed/towards-artificial-intelligence', category: 'blog', weight: 1.3 },
  { name: 'Medium: The Generator', kind: 'rss', url: 'https://medium.com/feed/the-generator', category: 'blog', weight: 1.3 },

  // Joe Njenga (AI tools creator). Substack feed dead (302 → profile, account moved or stopped publishing).
  { name: 'Joe Njenga (Medium)', kind: 'rss', url: 'https://medium.com/feed/@joe.njenga', category: 'blog', weight: 1.2 },

  // Community — Reddit disabled: 403 from datacenter IPs (GitHub Actions) and
  // public RSSHub instances. Re-enable when OAuth credentials available.
  // { name: 'Reddit: Claude / Coding', kind: 'reddit', subs: ['ClaudeAI', 'ChatGPTCoding', 'cursor'], minScore: 50, category: 'community', weight: 1.6 },
  // { name: 'Reddit: Local + ML', kind: 'reddit', subs: ['LocalLLaMA', 'MachineLearning'], minScore: 80, category: 'community', weight: 1.4 },
  // { name: 'Reddit: AI general', kind: 'reddit', subs: ['singularity', 'artificial', 'OpenAI'], minScore: 200, category: 'community', weight: 1.3 },

  // Community — HN + scrape-friendly alternatives
  { name: 'Hacker News AI', kind: 'hn', category: 'community', weight: 1.6 },
  { name: 'Lobsters AI', kind: 'rss', url: 'https://lobste.rs/t/ai.rss', category: 'community', weight: 1.3 },
  { name: 'dev.to AI', kind: 'rss', url: 'https://dev.to/feed/tag/ai', category: 'community', weight: 1.3 },
  { name: 'dev.to LLM', kind: 'rss', url: 'https://dev.to/feed/tag/llm', category: 'community', weight: 1.3 },
  { name: 'dev.to Claude', kind: 'rss', url: 'https://dev.to/feed/tag/claude', category: 'community', weight: 1.3 },

  // Code / repos
  { name: 'GitHub Trending AI', kind: 'github-trending', topics: ['llm', 'agents', 'artificial-intelligence', 'mcp'], category: 'code', weight: 1.1 },

  // Targeted news queries — model/tool releases only, not generic AI
  { name: 'Model Releases', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22GPT-5.5%22+OR+%22GPT-5%22+OR+%22Claude+Opus%22+OR+%22Claude+Sonnet%22+OR+%22Gemini+3%22+OR+%22Llama+4%22+OR+%22DeepSeek%22+when:3d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 0.9 },
  { name: 'Dev Tool Releases', kind: 'rss', url: 'https://news.google.com/rss/search?q=%22claude+code%22+OR+%22cursor%22+OR+%22github+copilot%22+OR+%22cline%22+OR+%22aider%22+OR+%22coding+agent%22+OR+%22MCP%22+when:3d&hl=en-US&gl=US&ceid=US:en', category: 'news', weight: 0.9 },

  // Tech-press AI — kept for context, low weight so market/policy doesn't dominate
  { name: 'TechCrunch AI', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'news', weight: 0.6 },
  { name: 'The Verge AI', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'news', weight: 0.6 },
  { name: 'Ars Technica AI', kind: 'rss', url: 'https://arstechnica.com/ai/feed/', category: 'news', weight: 0.7 },
  { name: 'MIT Tech Review AI', kind: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'news', weight: 0.6 },

  // Research / video
  { name: 'arXiv cs.AI', kind: 'arxiv', category: 'research', weight: 0.6 },
  { name: 'Two Minute Papers', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', category: 'video', weight: 0.5 },
  { name: 'AI Explained', kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw', category: 'video', weight: 0.7 },
];
