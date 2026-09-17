/**
 * SynAI — Entity Extractor.
 * Pulls numbers, mentions, known entities and the active topic from a query.
 */
import { EntityHit } from '../types.js';
import { tokenize } from './textUtils.js';

/** Parse 5000 / 5,000 / 50k / 1.5m / 2b into a number (mirrors the bot's parseMoney) */
export function parseMoney(raw: string): number | null {
  const s = String(raw || '').trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = m[2];
  if (suf === 'k') n *= 1_000;
  else if (suf === 'm') n *= 1_000_000;
  else if (suf === 'b') n *= 1_000_000_000;
  return Number.isFinite(n) ? Math.floor(n) : null;
}

export class EntityExtractor {
  private knownEntities: Set<string>;

  constructor(entityData: { entities: Record<string, string[]> }) {
    this.knownEntities = new Set();
    const groups = entityData?.entities || {};
    for (const list of Object.values(groups)) {
      for (const e of list) this.knownEntities.add(String(e).toLowerCase());
    }
  }

  extract(query: string): EntityHit {
    const tokens = tokenize(query);
    const numbers: number[] = [];
    const mentions: string[] = [];
    const entities: string[] = [];

    for (const t of tokens) {
      // @mentions
      if (t.startsWith('@') && t.length > 1) {
        mentions.push(t.slice(1));
        continue;
      }
      // numbers (incl. 50k / 1.5m style)
      const n = parseMoney(t);
      if (n !== null) {
        numbers.push(n);
        continue;
      }
      // known entities
      if (this.knownEntities.has(t) && !entities.includes(t)) {
        entities.push(t);
      }
    }

    return {
      numbers,
      mentions,
      entities,
      topic: entities.length ? entities[0] : null,
    };
  }
}