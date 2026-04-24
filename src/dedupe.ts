import fs from 'node:fs/promises';

const SEEN_PATH = './data/seen.json';
const RETAIN_DAYS = 30;

type Seen = { ids: Record<string, string> };

async function readSeen(): Promise<Seen> {
  try {
    const raw = await fs.readFile(SEEN_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Seen;
    return { ids: parsed.ids || {} };
  } catch {
    return { ids: {} };
  }
}

export async function loadSeen(): Promise<Set<string>> {
  const { ids } = await readSeen();
  const cutoff = Date.now() - RETAIN_DAYS * 86400000;
  return new Set(Object.entries(ids).filter(([, ts]) => new Date(ts).getTime() > cutoff).map(([id]) => id));
}

export async function saveSeen(newIds: string[]): Promise<void> {
  const existing = await readSeen();
  const cutoff = Date.now() - RETAIN_DAYS * 86400000;
  const kept: Record<string, string> = {};
  for (const [id, ts] of Object.entries(existing.ids)) {
    if (new Date(ts).getTime() > cutoff) kept[id] = ts;
  }
  const now = new Date().toISOString();
  for (const id of newIds) if (!kept[id]) kept[id] = now;
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(SEEN_PATH, JSON.stringify({ ids: kept }, null, 2) + '\n');
}
