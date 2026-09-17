/**
 * SynAI — Knowledge Search Engine (Phase 2).
 *
 * Lightweight inverted-index search over all knowledge sources:
 *   - built-in intents (examples + templates)
 *   - taught Q&A
 *   - scraped/learned facts (knowledge packs)
 *
 * Supports: keyword lookup, boolean AND/OR, fuzzy terms (Levenshtein),
 * top-N ranking by TF relevance. Pure TypeScript, zero dependencies.
 * Used when no intent clears the confidence threshold — before falling back
 * to "I don't know", SynAI searches here.
 */
import { normalize, tokenize, similarity } from '../engine/textUtils.js';

/** One searchable document in the knowledge index */
export type SearchDoc = {
  id: string;
  /** Document type */
  kind: 'intent' | 'taught' | 'fact';
  /** Searchable text (question + answer) */
  text: string;
  /** The answer to return if this doc wins */
  answer: string;
  /** Optional confidence boost (taught=1.0, fact=score, intent=0.8) */
  boost: number;
};

export type SearchResult = {
  doc: SearchDoc;
  /** Relevance 0..1 */
  score: number;
};

export class KnowledgeSearch {
  /** term → set of doc ids containing it */
  private index: Map<string, Set<string>> = new Map();
  /** id → doc */
  private docs: Map<string, SearchDoc> = new Map();
  /** id → token count (for length normalization) */
  private docLen: Map<string, number> = new Map();

  /** Add or replace a document in the index */
  add(doc: SearchDoc): void {
    // remove old tokens if replacing
    const old = this.docs.get(doc.id);
    if (old) {
      for (const t of tokenize(old.text)) {
        const set = this.index.get(t);
        if (set) {
          set.delete(doc.id);
          if (!set.size) this.index.delete(t);
        }
      }
    }
    this.docs.set(doc.id, doc);
    const tokens = tokenize(doc.text);
    this.docLen.set(doc.id, tokens.length || 1);
    for (const t of tokens) {
      let set = this.index.get(t);
      if (!set) {
        set = new Set();
        this.index.set(t, set);
      }
      set.add(doc.id);
    }
  }

  /** Remove a document */
  remove(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    for (const t of tokenize(doc.text)) {
      const set = this.index.get(t);
      if (set) {
        set.delete(id);
        if (!set.size) this.index.delete(t);
      }
    }
    this.docs.delete(id);
    this.docLen.delete(id);
  }

  get size(): number {
    return this.docs.size;
  }

  /**
   * Search. Query syntax:
   *   plain terms        → OR of terms (ranked)
   *   "a b" quoted       → phrase must appear
   *   a AND b            → both terms required
   *   a NOT b            → exclude docs with b
   * Fuzzy: single mistyped terms auto-match near neighbors.
   */
  search(query: string, limit = 3): SearchResult[] {
    const q = query.trim();
    if (!q) return [];

    // Parse NOT terms
    const notTerms: string[] = [];
    let working = q.replace(/\bNOT\s+(\w+)/gi, (_m, term: string) => {
      notTerms.push(term.toLowerCase());
      return ' ';
    });

    // Parse quoted phrases
    const phrases: string[] = [];
    working = working.replace(/"([^"]+)"/g, (_m, phrase: string) => {
      phrases.push(phrase.toLowerCase());
      return ' ';
    });

    // Parse AND / OR
    const isAnd = /\bAND\b/i.test(working);
    const terms = tokenize(working.replace(/\bAND\b|\bOR\b/gi, ' '));

    // Candidate sets
    let candidates: Set<string> | null = null;

    if (terms.length) {
      const sets: Set<string>[] = [];
      for (const t of terms) {
        let set = this.index.get(t);
        // fuzzy fallback for likely typos (only if exact miss)
        if (!set && t.length >= 4) {
          let bestTerm: string | null = null;
          let bestSim = 0;
          for (const known of this.index.keys()) {
            if (Math.abs(known.length - t.length) > 2) continue;
            const s = similarity(t, known);
            if (s > bestSim) {
              bestSim = s;
              bestTerm = known;
            }
          }
          if (bestTerm && bestSim >= 0.8) set = this.index.get(bestTerm);
        }
        sets.push(set || new Set());
      }
      if (isAnd) {
        // intersect
        candidates = sets.reduce((acc, s) => {
          if (!acc) return new Set(s);
          const out = new Set<string>();
          for (const id of acc) if (s.has(id)) out.add(id);
          return out;
        });
      } else {
        // union
        candidates = new Set();
        for (const s of sets) for (const id of s) candidates.add(id);
      }
    }

    // Phrase filter
    if (phrases.length) {
      const base = candidates || new Set(this.docs.keys());
      candidates = new Set();
      for (const id of base) {
        const doc = this.docs.get(id);
        if (!doc) continue;
        const normText = normalize(doc.text);
        if (phrases.every((p) => normText.includes(normalize(p)))) candidates.add(id);
      }
    }

    if (!candidates) candidates = new Set(this.docs.keys());

    // NOT filter
    for (const nt of notTerms) {
      const exclude = this.index.get(nt);
      if (exclude) {
        for (const id of exclude) candidates.delete(id);
      }
    }

    // Rank: term coverage + phrase bonus + boost, normalized by doc length
    const qTokens = new Set(tokenize(q));
    const results: SearchResult[] = [];
    for (const id of candidates) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      const docTokens = tokenize(doc.text);
      const docSet = new Set(docTokens);
      let overlap = 0;
      for (const t of qTokens) if (docSet.has(t)) overlap++;
      let score = overlap / Math.max(qTokens.size, 1);
      // phrase bonus
      const normText = normalize(doc.text);
      for (const p of phrases) {
        if (normText.includes(normalize(p))) score += 0.25;
      }
      // length normalization (short docs that match are stronger)
      score *= 1 / (1 + Math.log10(Math.max(docTokens.length, 1)));
      // source boost
      score *= doc.boost;
      if (score > 0.05) results.push({ doc, score: Math.min(1, score) });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Best result above a minimum score, or null */
  best(query: string, minScore = 0.35): SearchResult | null {
    const r = this.search(query, 1);
    if (r.length && r[0].score >= minScore) return r[0];
    return null;
  }
}