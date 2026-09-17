/**
 * SynAI — Pattern Matcher.
 * Matches a query against intent triggers in priority order:
 *   1. exact example match      (score 1.0)
 *   2. phrase match             (score 0.95 × weight)
 *   3. regex rule match         (score 0.9)
 *   4. keyword hits             (score 0.5–0.85 scaled by hit count)
 *   5. fuzzy example match      (Levenshtein similarity, capped 0.8)
 */
import { Intent, Candidate } from '../types.js';
import { normalize, similarity, tokenize } from './textUtils.js';

export class PatternMatcher {
  private intents: Intent[];
  private compiledRegex: Map<string, RegExp[]>;

  constructor(intents: Intent[]) {
    this.intents = intents;
    this.compiledRegex = new Map();
    // Pre-compile regex rules once at boot (fail-safe: bad regex is skipped, never crashes)
    for (const intent of intents) {
      const rules = intent.regex || [];
      const compiled: RegExp[] = [];
      for (const r of rules) {
        try {
          compiled.push(new RegExp(r, 'i'));
        } catch {
          // invalid regex in knowledge base — skip it, never crash the engine
        }
      }
      if (compiled.length) this.compiledRegex.set(intent.name, compiled);
    }
  }

  /** Return scored candidates from all pattern strategies */
  match(query: string): Candidate[] {
    const q = normalize(query);
    const tokens = tokenize(query);
    const qSet = new Set(tokens);
    const out: Candidate[] = [];

    for (const intent of this.intents) {
      let best = 0;
      const weight = intent.weight ?? 1;

      // 1) Exact example match
      for (const ex of intent.examples) {
        if (normalize(ex) === q) {
          best = Math.max(best, 1.0);
          break;
        }
      }

      // 2) Phrase match (substring against normalized query)
      if (best < 1) {
        for (const ph of intent.phrases || []) {
          const p = normalize(ph);
          if (p && q.includes(p)) {
            // longer phrases score higher
            const lenBonus = Math.min(0.15, p.length / Math.max(q.length, 1) * 0.3);
            best = Math.max(best, Math.min(0.95, (0.8 + lenBonus) * weight));
            break;
          }
        }
      }

      // 3) Regex rules
      if (best < 0.9) {
        const rules = this.compiledRegex.get(intent.name);
        if (rules && rules.some((r) => r.test(query))) {
          best = Math.max(best, 0.9);
        }
      }

      // 4) Keyword hits (word-boundary, scaled)
      if (best < 0.85) {
        const kws = intent.keywords || [];
        let hits = 0;
        for (const kw of kws) {
          if (qSet.has(kw.toLowerCase())) hits++;
        }
        if (hits > 0) {
          // 1 kw = 0.55, 2 = 0.7, 3+ = 0.85 — scaled by intent weight
          const kwScore = Math.min(0.85, 0.4 + hits * 0.15);
          best = Math.max(best, kwScore * weight);
        }
      }

      // 5) Fuzzy example match (only for short queries — avoids slow O(n·m) on long input)
      if (best === 0 && q.length > 0 && q.length <= 32) {
        for (const ex of intent.examples) {
          const exN = normalize(ex);
          if (Math.abs(exN.length - q.length) > 6) continue; // cheap length pre-filter
          const sim = similarity(q, exN);
          if (sim >= 0.82) {
            best = Math.max(best, Math.min(0.8, sim * 0.95));
            break;
          }
        }
      }

      if (best > 0) out.push({ intent: intent.name, score: best });
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }
}