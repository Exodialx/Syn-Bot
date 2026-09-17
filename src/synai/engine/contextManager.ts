/**
 * SynAI — Context Manager.
 * Tracks per-user conversation state (last intent/topic + last 5 turns) so
 * follow-ups like "what about heists?" resolve against the previous topic.
 * In-memory with lazy JSON persistence — survives restarts.
 */
import fs from 'fs';
import path from 'path';
import { Turn, UserContext } from '../types.js';

const MAX_HISTORY = 5;
const MAX_USERS = 5_000; // hard cap so memory can't grow unbounded

const STORE_PATH = path.join(process.cwd(), 'data', 'synai_memory.json');

export class ContextManager {
  private users: Map<string, UserContext> = new Map();
  private dirty = false;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw.users || {})) {
            this.users.set(k, v as UserContext);
          }
        }
      }
    } catch {
      // corrupted memory file — start fresh, never crash the bot
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, unknown> = { users: Object.fromEntries(this.users) };
      const tmp = STORE_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj));
      fs.renameSync(tmp, STORE_PATH); // atomic
      this.dirty = false;
    } catch {
      // persistence is best-effort; in-memory still works
    }
  }

  /** Persist if there are unsaved changes (call after each answer) */
  flush(): void {
    this.save();
  }

  get(userId: string): UserContext {
    let ctx = this.users.get(userId);
    if (!ctx) {
      ctx = { userId, lastIntent: null, lastTopic: null, turns: 0, history: [] };
      this.users.set(userId, ctx);
      // evict oldest users when over cap
      if (this.users.size > MAX_USERS) {
        const first = this.users.keys().next().value;
        if (first) this.users.delete(first);
      }
    }
    return ctx;
  }

  record(userId: string, turn: Turn): void {
    const ctx = this.get(userId);
    ctx.history.push(turn);
    if (ctx.history.length > MAX_HISTORY) ctx.history.shift();
    ctx.turns++;
    ctx.lastIntent = turn.intent;
    ctx.lastTopic = turn.topic;
    this.dirty = true;
  }

  /** Last turn for a user (or null) */
  lastTurn(userId: string): Turn | null {
    const ctx = this.users.get(userId);
    if (!ctx || !ctx.history.length) return null;
    return ctx.history[ctx.history.length - 1];
  }

  /**
   * Resolve a follow-up query. If the query is context-dependent (starts with
   * "what about", "and", "tell me more", or is a bare topic noun), we rewrite
   * it using the previous topic.
   */
  resolveFollowUp(userId: string, query: string): string {
    const ctx = this.users.get(userId);
    if (!ctx || !ctx.lastTopic) return query;
    const q = query.toLowerCase().trim();
    const followUpStarters = [
      'what about ', 'how about ', 'and ', 'tell me more', 'more about ',
      'what else', 'why', 'what about that', 'explain more',
    ];
    const isShortTopicQuery = q.split(' ').length <= 3 && q.length >= 3 && /^[a-z\s]+$/.test(q);
    const isFollowUp =
      followUpStarters.some((s) => q.startsWith(s)) ||
      (isShortTopicQuery && q.includes(ctx.lastTopic.split(' ')[0]));

    if (isFollowUp) {
      // Inject the previous topic so the classifier has signal
      if (!q.includes(ctx.lastTopic)) {
        return `${query} (regarding ${ctx.lastTopic})`;
      }
    }
    return query;
  }

  /** Forget a user's history (privacy / reset) */
  reset(userId: string): void {
    this.users.delete(userId);
    this.dirty = true;
  }
}