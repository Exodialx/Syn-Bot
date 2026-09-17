/**
 * SynAI — Confidence Scorer.
 * Fuses pattern-match + TF-IDF candidates into one final confidence score and
 * decides whether we know the answer (above threshold) or should fall back.
 */

export type FusedCandidate = {
  intent: string;
  /** Final confidence 0..1 */
  confidence: number;
  /** Raw pattern score (for diagnostics) */
  patternScore: number;
  /** Raw TF-IDF score (for diagnostics) */
  tfidfScore: number;
};

/** Confidence above which we answer directly */
export const CONFIDENCE_THRESHOLD = 0.45;

export class ConfidenceScorer {
  /**
   * Fuse both classifier outputs.
   * - Pattern matches are trusted more (explicit triggers).
   * - TF-IDF provides semantic backup for paraphrases.
   * - Agreement bonus: both classifiers picking the same intent boosts it.
   */
  fuse(patternCands: { intent: string; score: number }[], tfidfCands: { intent: string; score: number }[]): FusedCandidate[] {
    const map = new Map<string, FusedCandidate>();

    const ensure = (intent: string): FusedCandidate => {
      let c = map.get(intent);
      if (!c) {
        c = { intent, confidence: 0, patternScore: 0, tfidfScore: 0 };
        map.set(intent, c);
      }
      return c;
    };

    for (const p of patternCands) {
      const c = ensure(p.intent);
      c.patternScore = p.score;
    }
    for (const t of tfidfCands) {
      const c = ensure(t.intent);
      c.tfidfScore = t.score;
    }

    for (const c of map.values()) {
      // Weights: pattern 60%, tfidf 40% — pattern triggers are explicit
      let score = c.patternScore * 0.6 + c.tfidfScore * 1.4 * 0.4;
      // Agreement bonus
      if (c.patternScore > 0 && c.tfidfScore > 0.05) score *= 1.15;
      // Exact pattern match is decisive
      if (c.patternScore >= 1.0) score = 1.0;
      // Cap
      c.confidence = Math.min(1, score);
    }

    const out = [...map.values()];
    out.sort((a, b) => b.confidence - a.confidence);
    return out;
  }

  /** Best candidate if it clears the threshold, else null */
  best(cands: FusedCandidate[]): FusedCandidate | null {
    if (!cands.length) return null;
    const top = cands[0];
    if (top.confidence < CONFIDENCE_THRESHOLD) return null;
    return top;
  }
}