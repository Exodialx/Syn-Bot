/**
 * SynAI — TF-IDF Intent Classifier.
 * Builds a TF-IDF vector space from intent examples at boot, classifies queries
 * via cosine similarity. Pure math, zero dependencies, O(vocabulary) per query.
 */
import { Intent, Candidate } from '../types.js';
import { normalize, stem, tokenize, expandSynonyms } from './textUtils.js';

/** Stopwords that carry no intent signal */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'about', 'as', 'by',
  'and', 'or', 'but', 'so', 'if', 'then', 'than', 'too', 'very',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall',
  'this', 'that', 'these', 'those', 'there', 'here', 'what', 'whats', 'which', 'who', 'whom', 'whose',
  'how', 'when', 'where', 'why',
  'please', 'just', 'tell', 'know', 'think',
]);

export class IntentClassifier {
  private vocabulary: string[] = [];
  private vocabIndex: Map<string, number> = new Map();
  private idf: number[] = [];
  /** One TF-IDF vector per intent (aggregated from all its examples) */
  private intentVectors: number[][] = [];
  private intentNames: string[];

  constructor(intents: Intent[], synonyms: Record<string, string[]>) {
    this.intentNames = intents.map((i) => i.name);

    // 1) Build documents: one per intent = all examples joined
    const docs: string[][] = intents.map((intent) => {
      const words: string[] = [];
      for (const ex of intent.examples || []) {
        words.push(...this.preprocess(ex, synonyms));
      }
      return words;
    });

    // 2) Vocabulary
    const vocabSet = new Set<string>();
    for (const doc of docs) for (const w of doc) vocabSet.add(w);
    this.vocabulary = [...vocabSet];
    this.vocabulary = this.vocabulary.sort(); // deterministic
    this.vocabulary.forEach((w, i) => this.vocabIndex.set(w, i));

    // 3) IDF: smooth log idf
    const N = docs.length || 1;
    const df = new Array<number>(this.vocabulary.length).fill(0);
    for (const doc of docs) {
      const seen = new Set(doc);
      for (const w of seen) {
        const idx = this.vocabIndex.get(w);
        if (idx !== undefined) df[idx]++;
      }
    }
    this.idf = df.map((d) => Math.log((N + 1) / (d + 1)) + 1);

    // 4) Intent TF-IDF vectors (L2-normalized)
    this.intentVectors = docs.map((doc) => this.vectorize(doc));
  }

  private preprocess(text: string, synonyms: Record<string, string[]>): string[] {
    const raw = tokenize(text);
    const expanded = expandSynonyms(raw, synonyms);
    return expanded
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map(stem);
  }

  private vectorize(tokens: string[]): number[] {
    const vec = new Array<number>(this.vocabulary.length).fill(0);
    if (!tokens.length) return vec;
    const tf = new Map<number, number>();
    for (const t of tokens) {
      const idx = this.vocabIndex.get(t);
      if (idx !== undefined) tf.set(idx, (tf.get(idx) || 0) + 1);
    }
    for (const [idx, count] of tf) {
      vec[idx] = (count / tokens.length) * this.idf[idx];
    }
    // L2 normalize
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
  }

  /** Classify a query; returns cosine-similarity candidates (only > 0.05) */
  classify(query: string, synonyms: Record<string, string[]>): Candidate[] {
    const tokens = this.preprocess(query, synonyms);
    if (!tokens.length) return [];
    const qVec = this.vectorize(tokens);
    const out: Candidate[] = [];
    for (let i = 0; i < this.intentVectors.length; i++) {
      const iVec = this.intentVectors[i];
      let dot = 0;
      for (let j = 0; j < qVec.length; j++) {
        dot += qVec[j] * iVec[j];
      }
      // both vectors are L2-normalized → dot = cosine similarity
      if (dot > 0.05) out.push({ intent: this.intentNames[i], score: dot });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Number of intents currently modeled (for diagnostics) */
  get size(): number {
    return this.intentNames.length;
  }
}