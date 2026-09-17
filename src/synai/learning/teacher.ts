/**
 * SynAI — Teacher.
 * Admins teach new Q&A pairs via .teach "question" "answer".
 * Persisted to data/synai_taught.json — new knowledge survives restarts
 * and takes priority over built-in intents (taught = most specific).
 */
import fs from 'fs';
import path from 'path';

const TAUGHT_PATH = path.join(process.cwd(), 'data', 'synai_taught.json');
const MAX_TAUGHT = 5_000;
const MAX_Q_LEN = 200;
const MAX_A_LEN = 800;

export type TaughtEntry = {
  q: string;          // normalized question
  a: string;          // answer
  taughtBy: string;   // admin player id
  taughtAt: number;   // timestamp
  hits: number;       // times used
};

export class Teacher {
  private entries: Map<string, TaughtEntry> = new Map();
  private dirty = false;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(TAUGHT_PATH)) {
        const raw = JSON.parse(fs.readFileSync(TAUGHT_PATH, 'utf8'));
        for (const [k, v] of Object.entries(raw.entries || {})) {
          this.entries.set(k, v as TaughtEntry);
        }
      }
    } catch {
      // corrupted file — start fresh
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(TAUGHT_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = { entries: Object.fromEntries(this.entries) };
      const tmp = TAUGHT_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
      fs.renameSync(tmp, TAUGHT_PATH); // atomic
      this.dirty = false;
    } catch {
      // best-effort persistence
    }
  }

  flush(): void {
    this.save();
  }

  private static normalizeQ(q: string): string {
    return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Teach a new Q&A. Returns success message or error. */
  teach(question: string, answer: string, adminId: string): string {
    const q = String(question || '').trim();
    const a = String(answer || '').trim();
    if (!q || !a) return '❌ Usage: .teach "question" "answer"';
    if (q.length > MAX_Q_LEN) return `❌ Question too long (max ${MAX_Q_LEN} chars).`;
    if (a.length > MAX_A_LEN) return `❌ Answer too long (max ${MAX_A_LEN} chars).`;

    const key = Teacher.normalizeQ(q);
    const existing = this.entries.get(key);
    if (existing && existing.a === a) return '🎓 I already know that — exactly like that.';
    if (!existing && this.entries.size >= MAX_TAUGHT) return '❌ Knowledge base full. Remove some entries first.';

    this.entries.set(key, {
      q: key,
      a,
      taughtBy: String(adminId || 'unknown'),
      taughtAt: Date.now(),
      hits: existing?.hits || 0,
    });
    this.dirty = true;
    this.save();

    if (existing) return `✅ Updated my answer to:\n"${q}"\n→ ${a}`;
    return `🎓 *Learned!*\nQ: ${q}\nA: ${a}\n\nI'll answer it instantly from now on.`;
  }

  /** Exact (normalized) lookup */
  lookupExact(question: string): TaughtEntry | null {
    const key = Teacher.normalizeQ(question);
    if (!key) return null;
    const e = this.entries.get(key);
    if (e) {
      e.hits++;
      this.dirty = true;
    }
    return e || null;
  }

  /**
   * Fuzzy lookup: finds the taught question with the best token overlap.
   * Returns the entry if overlap is strong enough.
   */
  lookupFuzzy(question: string, minScore = 0.7): { entry: TaughtEntry; score: number } | null {
    const key = Teacher.normalizeQ(question);
    if (!key || !this.entries.size) return null;
    const qTokens = new Set(key.split(' ').filter((t) => t.length > 2));

    let best: TaughtEntry | null = null;
    let bestScore = 0;
    for (const e of this.entries.values()) {
      const eTokens = e.q.split(' ').filter((t) => t.length > 2);
      if (!eTokens.length) continue;
      let overlap = 0;
      for (const t of eTokens) if (qTokens.has(t)) overlap++;
      const score = overlap / Math.max(eTokens.length, qTokens.size);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best && bestScore >= minScore) {
      best.hits++;
      this.dirty = true;
      return { entry: best, score: bestScore };
    }
    return null;
  }

  /** Remove a taught entry (admin forget command) */
  forget(question: string): string {
    const key = Teacher.normalizeQ(question);
    if (!this.entries.has(key)) return `❌ I don't have a taught entry for "${key}".`;
    this.entries.delete(key);
    this.dirty = true;
    this.save();
    return `🧹 Forgotten: "${key}"`;
  }

  /** List taught entries (paginated preview) */
  list(page = 1): string {
    const all = [...this.entries.values()].sort((a, b) => b.taughtAt - a.taughtAt);
    if (!all.length) return '🎓 I haven\'t been taught anything yet.\n.teach "question" "answer"';
    const perPage = 10;
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const p = Math.max(1, Math.min(page, pages));
    const slice = all.slice((p - 1) * perPage, p * perPage);
    const lines = slice.map((e, i) => `${(p - 1) * perPage + i + 1}. ${e.q}\n   → ${e.a.slice(0, 60)}${e.a.length > 60 ? '…' : ''}`);
    return `🎓 *TAUGHT KNOWLEDGE* (${all.length})\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━\nPage ${p}/${pages}`;
  }

  get size(): number {
    return this.entries.size;
  }

  /** All taught entries (for indexing into the search engine) */
  allEntries(): TaughtEntry[] {
    return [...this.entries.values()];
  }
}
