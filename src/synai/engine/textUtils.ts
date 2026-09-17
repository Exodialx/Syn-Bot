/**
 * SynAI — text normalization & tokenization utilities.
 * Pure string ops, zero dependencies.
 */

/** Normalize text: lowercase, strip punctuation (keep . @ digits letters spaces), collapse whitespace */
export function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s.@+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize normalized text into words (drops the leading '.' of commands) */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .map((t) => t.replace(/^\.+/, '').trim())
    .filter((t) => t.length > 0);
}

/** Expand synonyms in a token list using the synonym map (canonical word replaces variants) */
export function expandSynonyms(tokens: string[], synonyms: Record<string, string[]>): string[] {
  if (!synonyms || typeof synonyms !== 'object') return tokens;
  const lookup: Map<string, string> = new Map();
  for (const [canonical, variants] of Object.entries(synonyms)) {
    if (!Array.isArray(variants)) continue;
    for (const v of variants) lookup.set(String(v).toLowerCase(), canonical);
  }
  return tokens.map((t) => lookup.get(t) || t);
}

/** Simple stemmer: strips common suffixes so "running"/"runs"/"runner" ~ "run" */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('ly')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  return w;
}

/** Levenshtein edit distance (iterative, two-row, fast) */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity 0..1 based on Levenshtein */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Stable pseudo-random pick from an array based on a seed string (no Math.random for consistency tests) */
export function pickSeeded<T>(arr: T[], seed: string): T {
  if (!arr.length) throw new Error('pickSeeded: empty array');
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/** True random pick (used for jokes/facts variety) */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}