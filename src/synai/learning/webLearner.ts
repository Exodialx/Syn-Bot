/**
 * SynAI — Web Learner (Phase 2).
 *
 * Learns new knowledge from free web sources:
 *  - .learn <topic>  → on-demand learning (admin)
 *  - learnRandom()   → periodic background learning (hourly timer)
 *  - learnQuery()    → learn a specific question (used by gapFiller)
 *
 * Everything learned is persisted to data/synai_facts.json (gzip-free JSON,
 * atomic writes) and injected into the KnowledgeSearch index + taught layer.
 * Network failures never crash the bot — learning is best-effort.
 */
import fs from 'fs';
import path from 'path';
import { bestAnswer, researchQuestion, ScrapedFact } from '../knowledge/webScraper.js';

const FACTS_PATH = path.join(process.cwd(), 'data', 'synai_facts.json');
const LOG_PATH = path.join(process.cwd(), 'data', 'synai_learn_log.json');
const MAX_FACTS = 20_000;
const MIN_CONFIDENCE = 0.6; // only keep medium+ sources

export type LearnedFact = {
  q: string;
  a: string;
  source: string;
  score: number;
  learnedAt: number;
  learnedFrom: 'manual' | 'auto' | 'gap';
};

/** Seed topics for random background learning */
const SEED_TOPICS = [
  'artificial intelligence', 'black holes', 'roman empire', 'great wall of china',
  'electric cars', 'quantum computing', 'amazon rainforest', 'mariana trench',
  'leonardo da vinci', 'nikola tesla', 'mount everest', 'sahara desert',
  'world war 2', 'internet history', 'bitcoin', 'space exploration',
  'human brain', 'sharks', 'volcanoes', 'antarctica', 'pyramids of giza',
  'chess', 'olympic games', 'coffee history', 'chocolate history',
];

export class WebLearner {
  private facts: Map<string, LearnedFact> = new Map();
  private log: string[] = [];
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(FACTS_PATH)) {
        const raw = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf8'));
        for (const [k, v] of Object.entries(raw.facts || {})) {
          this.facts.set(k, v as LearnedFact);
        }
      }
      if (fs.existsSync(LOG_PATH)) {
        const raw = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
        if (Array.isArray(raw.log)) this.log = raw.log;
      }
    } catch {
      // corrupted — start fresh
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(FACTS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = FACTS_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ facts: Object.fromEntries(this.facts) }));
      fs.renameSync(tmp, FACTS_PATH);
      const tmpLog = LOG_PATH + '.tmp';
      fs.writeFileSync(tmpLog, JSON.stringify({ log: this.log.slice(-200) }));
      fs.renameSync(tmpLog, LOG_PATH);
      this.dirty = false;
    } catch {
      // best-effort
    }
  }

  flush(): void {
    this.save();
  }

  private static key(q: string): string {
    return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Store a scraped fact if it passes the confidence threshold */
  private store(f: ScrapedFact, from: LearnedFact['learnedFrom']): boolean {
    if (f.score < MIN_CONFIDENCE) return false;
    const key = WebLearner.key(f.question);
    if (!key) return false;
    if (this.facts.has(key) && this.facts.get(key)!.score >= f.score) return false; // keep better
    if (!this.facts.has(key) && this.facts.size >= MAX_FACTS) return false;

    this.facts.set(key, {
      q: key,
      a: f.answer,
      source: f.source,
      score: f.score,
      learnedAt: Date.now(),
      learnedFrom: from,
    });
    this.dirty = true;
    return true;
  }

  /**
   * Learn a specific question now (used by .learn and gapFiller).
   * Returns a human-readable result message.
   */
  async learnQuery(question: string, from: LearnedFact['learnedFrom'] = 'manual'): Promise<string> {
    const q = question.trim();
    if (!q) return '❌ Give me a topic: .learn <topic>';
    if (q.length > 120) return '❌ Topic too long (max 120 chars).';

    const best = await bestAnswer(q);
    if (best && this.store(best, from)) {
      this.log.push(`[${new Date().toISOString()}] learned "${q}" from ${best.source} (${best.confidence})`);
      this.save();
      return `📚 *Learned!*\nQ: ${q}\nSource: ${best.source} (${best.confidence})\n\n${best.answer.slice(0, 300)}`;
    }
    // try broader research before giving up
    const facts = await researchQuestion(q);
    let stored = 0;
    for (const f of facts) {
      if (this.store(f, from)) stored++;
    }
    if (stored) {
      this.log.push(`[${new Date().toISOString()}] learned ${stored} facts for "${q}"`);
      this.save();
      return `📚 Learned ${stored} fact${stored === 1 ? '' : 's'} about "${q}".`;
    }
    this.log.push(`[${new Date().toISOString()}] FAILED to learn "${q}"`);
    this.save();
    return `🤷 Couldn't find reliable info on "${q}". The web sources came back empty.`;
  }

  /** Learn a random seed topic (background job) */
  async learnRandom(): Promise<string | null> {
    const topic = SEED_TOPICS[Math.floor(Math.random() * SEED_TOPICS.length)];
    const res = await this.learnQuery(`what is ${topic}`, 'auto');
    return res;
  }

  /** Start the hourly background learner */
  startAutoLearn(intervalMs = 60 * 60 * 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.learnRandom().catch(() => {});
    }, intervalMs);
    // don't hold the process open
    if (this.timer.unref) this.timer.unref();
  }

  stopAutoLearn(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** All facts (for injecting into the search index) */
  all(): LearnedFact[] {
    return [...this.facts.values()];
  }

  /** Lookup exact learned fact */
  lookup(question: string): LearnedFact | null {
    return this.facts.get(WebLearner.key(question)) || null;
  }

  get size(): number {
    return this.facts.size;
  }

  /** Recent learning log (admin view) */
  recentLog(n = 10): string {
    if (!this.log.length) return '📜 Nothing learned yet. Use .learn <topic>';
    const lines = this.log.slice(-n).reverse();
    return `📜 *LEARN LOG*\n${lines.join('\n')}`;
  }
}