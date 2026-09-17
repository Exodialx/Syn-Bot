/**
 * SynAI — Gap Filler (Phase 2).
 *
 * Tracks every question SynAI couldn't answer, then learns them from the web:
 *  1. Engine logs unknown queries here (deduped, capped).
 *  2. processGaps() (hourly or on .learn gaps) researches the top unknowns.
 *  3. Learned answers flow into the WebLearner store → search index.
 *
 * SynAI literally learns from its own failures.
 */
import fs from 'fs';
import path from 'path';
import { WebLearner } from './webLearner.js';

const GAPS_PATH = path.join(process.cwd(), 'data', 'synai_gaps.json');
const MAX_GAPS = 2_000;
const MIN_ASK_COUNT = 1; // research a gap after this many hits

export type GapEntry = {
  q: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
};

export class GapFiller {
  private gaps: Map<string, GapEntry> = new Map();
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private learner: WebLearner;

  constructor(learner: WebLearner) {
    this.learner = learner;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(GAPS_PATH)) {
        const raw = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8'));
        for (const [k, v] of Object.entries(raw.gaps || {})) {
          this.gaps.set(k, v as GapEntry);
        }
      }
    } catch {
      // corrupted — start fresh
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(GAPS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = GAPS_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ gaps: Object.fromEntries(this.gaps) }));
      fs.renameSync(tmp, GAPS_PATH);
      this.dirty = false;
    } catch {
      // best-effort
    }
  }

  flush(): void {
    this.save();
  }

  private static key(q: string): string {
    return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  /** Record an unanswered question (called by the engine on fallback) */
  recordGap(question: string): void {
    const key = GapFiller.key(question);
    if (!key) return;
    const existing = this.gaps.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
    } else {
      if (this.gaps.size >= MAX_GAPS) {
        // evict resolved / oldest single-hit gaps
        for (const [k, v] of this.gaps) {
          if (v.resolved || v.count <= 1) {
            this.gaps.delete(k);
            if (this.gaps.size < MAX_GAPS) break;
          }
        }
      }
      this.gaps.set(key, { q: key, count: 1, firstSeen: Date.now(), lastSeen: Date.now(), resolved: false });
    }
    this.dirty = true;
  }

  /**
   * Research the top unresolved gaps via the web learner.
   * Returns a summary of what was learned.
   */
  async processGaps(max = 5): Promise<string> {
    const pending = [...this.gaps.values()]
      .filter((g) => !g.resolved && g.count >= MIN_ASK_COUNT)
      .sort((a, b) => b.count - a.count)
      .slice(0, max);

    if (!pending.length) return '✅ No knowledge gaps to fill right now.';

    let learned = 0;
    const lines: string[] = [];
    for (const gap of pending) {
      const res = await this.learner.learnQuery(gap.q, 'gap');
      if (res.startsWith('📚')) {
        gap.resolved = true;
        learned++;
        lines.push(`✅ ${gap.q}`);
      } else {
        lines.push(`❌ ${gap.q}`);
      }
    }
    this.dirty = true;
    this.save();
    return `🔧 *GAP FILL*\n${lines.join('\n')}\n\n${learned}/${pending.length} resolved.`;
  }

  /** Top unresolved gaps (admin view) */
  topGaps(n = 10): string {
    const pending = [...this.gaps.values()]
      .filter((g) => !g.resolved)
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
    if (!pending.length) return '🧠 No gaps — every question got an answer.';
    const lines = pending.map((g, i) => `${i + 1}. ${g.q} (asked ${g.count}×)`);
    return `🕳️ *KNOWLEDGE GAPS*\n${lines.join('\n')}\n\nFill them: .learn gaps`;
  }

  /** Start hourly gap processing */
  startAutoFill(intervalMs = 60 * 60 * 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processGaps(5).catch(() => {});
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stopAutoFill(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get size(): number {
    return this.gaps.size;
  }
}