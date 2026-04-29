import fs from 'node:fs/promises';
import path from 'node:path';
import type { Source } from './sources.js';
import type { Item } from './types.js';
import type { Cluster } from './cluster.js';

const STATS_PATH = path.resolve('./data/source-stats.json');
const TRENDS_PATH = path.resolve('./data/topic-trends.json');
const ROLLING_DAYS = 30;
const TREND_DAYS = 14;
const TOP_TOPICS = 200;
const TRENDING_BOOST = 0.25;
const CROSS_CATEGORY_BOOST = 0.3;

type SourceStat = { kept: number; skipped: number; updatedAt: string };
type SourceStats = Record<string, SourceStat>;
type TrendCounts = Record<string, number[]>;
type TrendsFile = { dates: string[]; topics: TrendCounts };

const STOP = new Set([
  'the','a','an','and','or','of','to','in','on','for','with','at','by','from','as','is','are','was','were','be','been','being','it','its','this','that','these','those','i','you','he','she','they','we','my','your','their','our','his','her','what','how','why','when','where','who','which','will','just','can','could','would','should','may','might','do','does','did','have','has','had','not','no','if','but','so','than','then','about','vs','using','use','new','old','using','via','over','more','less','most','any','some','all','one','two','three','make','made','get','got','let','says','said','say','first','last','next','still','now','today','yesterday','week','day','daily','update','updated','released','release','releases','version','build','built','released','launches','launched','launch','introducing','introduces','adds','adding','added','use','using','used',
]);

async function readJsonSafe<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

export async function applySourceTuning(sources: Source[]): Promise<Source[]> {
  const stats = await readJsonSafe<SourceStats>(STATS_PATH, {});
  return sources.map(src => {
    const s = stats[src.name];
    if (!s) return src;
    const total = s.kept + s.skipped;
    if (total < 5) return src;
    const skipRate = s.skipped / total;
    let mult = 1.0;
    if (skipRate > 0.8) mult = 0.7;
    else if (skipRate < 0.3) mult = 1.2;
    if (mult === 1.0) return src;
    const tuned = { ...src, weight: Math.max(0.2, Math.min(3.0, src.weight * mult)) };
    console.log(`  tuning ${src.name}: ${src.weight.toFixed(2)} → ${tuned.weight.toFixed(2)} (skip rate ${(skipRate * 100).toFixed(0)}%)`);
    return tuned;
  });
}

export async function recordRun(summarized: Cluster[]): Promise<void> {
  const stats = await readJsonSafe<SourceStats>(STATS_PATH, {});
  const today = new Date().toISOString().slice(0, 10);
  for (const c of summarized) {
    const src = c.primary.source;
    const skipped = /^skip\b/i.test((c.primary.llmWhy || '').trim());
    if (!stats[src]) stats[src] = { kept: 0, skipped: 0, updatedAt: today };
    if (skipped) stats[src].skipped += 1;
    else stats[src].kept += 1;
    stats[src].updatedAt = today;
  }
  // Decay: every entry loses 1/ROLLING_DAYS of its mass per day since update.
  // Simple approximation — keeps stats responsive without per-day buckets.
  const todayMs = Date.parse(today);
  for (const [name, s] of Object.entries(stats)) {
    const daysOld = Math.max(0, (todayMs - Date.parse(s.updatedAt)) / 86400000);
    if (daysOld > ROLLING_DAYS) {
      delete stats[name];
      continue;
    }
    const decay = Math.max(0, 1 - daysOld / ROLLING_DAYS);
    s.kept = Math.round(s.kept * decay * 100) / 100;
    s.skipped = Math.round(s.skipped * decay * 100) / 100;
  }
  await writeJson(STATS_PATH, stats);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && w.length < 30 && !STOP.has(w) && !/^\d+$/.test(w));
}

export function extractTopics(items: Item[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) {
    const tokens = tokenize(it.title);
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      counts[bigram] = (counts[bigram] || 0) + 1;
    }
    for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

export async function updateTrends(items: Item[]): Promise<TrendsFile> {
  const trends = await readJsonSafe<TrendsFile>(TRENDS_PATH, { dates: [], topics: {} });
  const today = new Date().toISOString().slice(0, 10);
  const todayCounts = extractTopics(items);
  // Keep only top-N today to bound storage.
  const top = Object.entries(todayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TOPICS);
  const todayMap = new Map(top);

  // Replace today's slot if it exists, else append.
  const idx = trends.dates.indexOf(today);
  if (idx === -1) {
    trends.dates.push(today);
    for (const arr of Object.values(trends.topics)) arr.push(0);
  }
  const targetIdx = trends.dates.indexOf(today);

  // Add today's counts
  for (const [topic, count] of todayMap) {
    if (!trends.topics[topic]) trends.topics[topic] = new Array(trends.dates.length).fill(0);
    while (trends.topics[topic].length < trends.dates.length) trends.topics[topic].push(0);
    trends.topics[topic][targetIdx] = count;
  }

  // Trim history
  while (trends.dates.length > TREND_DAYS) {
    trends.dates.shift();
    for (const arr of Object.values(trends.topics)) arr.shift();
  }
  // Drop topics with zero recent activity
  for (const [topic, arr] of Object.entries(trends.topics)) {
    if (arr.every(v => v === 0)) delete trends.topics[topic];
  }
  await writeJson(TRENDS_PATH, trends);
  return trends;
}

export function getTrendingTopics(trends: TrendsFile, n = 10): Set<string> {
  const trending: Array<[string, number]> = [];
  if (trends.dates.length < 2) return new Set();
  const lastIdx = trends.dates.length - 1;
  for (const [topic, arr] of Object.entries(trends.topics)) {
    const today = arr[lastIdx] ?? 0;
    if (today < 2) continue;
    const past = arr.slice(0, lastIdx);
    const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
    const surge = avg < 0.5 ? today : today / avg;
    if (surge > 1.5) trending.push([topic, surge]);
  }
  return new Set(trending.sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t));
}

export function trendingBoost(title: string, trending: Set<string>): number {
  if (trending.size === 0) return 1.0;
  const lower = title.toLowerCase();
  let hits = 0;
  for (const t of trending) if (lower.includes(t)) hits += 1;
  return 1 + Math.min(hits, 3) * TRENDING_BOOST;
}

export function crossCategoryBoost(items: Item[]): number {
  const cats = new Set(items.map(i => i.category));
  return cats.size >= 2 ? 1 + CROSS_CATEGORY_BOOST : 1.0;
}
