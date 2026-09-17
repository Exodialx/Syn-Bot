/**
 * SynAI — Feedback Loop.
 * Tracks 👍/👎-style feedback per intent and nudges intent weights over time.
 * Persisted to data/synai_feedback.json.
 *
 * The bot calls recordFeedback() after ".ai good"/".ai bad".
 * Intent weight adjustments are picked up by the engine on next rebuild.
 */
import fs from 'fs';
import path from 'path';

const FEEDBACK_PATH = path.join(process.cwd(), 'data', 'synai_feedback.json');
const MAX_LOG = 1_000;

export type FeedbackStats = Record<string, { good: number; bad: number }>;

export class FeedbackLoop {
  private stats: FeedbackStats = {};
  private recent: { intent: string; good: boolean; userId: string; ts: number }[] = [];
  private dirty = false;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(FEEDBACK_PATH)) {
        const raw = JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8'));
        if (raw.stats) this.stats = raw.stats;
        if (Array.isArray(raw.recent)) this.recent = raw.recent;
      }
    } catch {
      // corrupted file — start fresh
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(FEEDBACK_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = FEEDBACK_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ stats: this.stats, recent: this.recent }));
      fs.renameSync(tmp, FEEDBACK_PATH);
      this.dirty = false;
    } catch {
      // best-effort
    }
  }

  flush(): void {
    this.save();
  }

  /** Record user feedback for the last answered intent */
  recordFeedback(intent: string, good: boolean, userId: string): string {
    if (!intent) return '❌ Nothing to rate yet — ask me something first.';
    if (!this.stats[intent]) this.stats[intent] = { good: 0, bad: 0 };
    if (good) this.stats[intent].good++;
    else this.stats[intent].bad++;

    this.recent.push({ intent, good, userId, ts: Date.now() });
    if (this.recent.length > MAX_LOG) this.recent.shift();
    this.dirty = true;
    this.save();

    const s = this.stats[intent];
    const total = s.good + s.bad;
    const pct = total ? Math.round((s.good / total) * 100) : 0;
    return good
      ? `✅ Thanks! "${intent}" is now ${pct}% approved (${total} ratings).`
      : `📝 Noted — "${intent}" flagged. Admins can fix it with .teach "${intent}" "better answer".`;
  }

  /** Weight adjustment multiplier for an intent (0.8 .. 1.2) based on feedback ratio */
  weightFor(intent: string): number {
    const s = this.stats[intent];
    if (!s) return 1;
    const total = s.good + s.bad;
    if (total < 5) return 1; // need a sample before adjusting
    const ratio = s.good / total; // 0..1
    return 0.8 + ratio * 0.4; // 50% good → 1.0, 100% → 1.2, 0% → 0.8
  }

  /** Summary for admins */
  summary(): string {
    const entries = Object.entries(this.stats).filter(([, v]) => v.good + v.bad > 0);
    if (!entries.length) return '📊 No feedback yet. Users rate answers with .ai good / .ai bad.';
    entries.sort((a, b) => (b[1].good + b[1].bad) - (a[1].good + a[1].bad));
    const lines = entries.slice(0, 10).map(([k, v]) => {
      const total = v.good + v.bad;
      const pct = Math.round((v.good / total) * 100);
      const bar = '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${k}: ${bar} ${pct}% (${total})`;
    });
    return `📊 *SYNAI FEEDBACK*\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`;
  }
}