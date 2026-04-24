import { createHash } from 'node:crypto';

export const sha256 = (s: string) =>
  createHash('sha256').update(s).digest('hex').slice(0, 16);

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
