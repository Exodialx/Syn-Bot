/*/*
 * .synai — SYN AI, powered by SynAI (offline engine) + an optional live
 * boost (OpenRouter → DeepSeek) for questions the offline brain doesn't know.
 *
 * The offline engine (pattern matching + TF-IDF + taught/learned knowledge)
 * stays the primary brain — it's tried first for every question, for every
 * player, free and unlimited. Nothing about it changes here.
 *
 * ONLY when the offline brain falls back does a live-boost call happen,
 * and only if the player has live-boost quota left for the day (or is
 * admin, who are unlimited). This is the ONLY place a real API call — and
 * therefore real cost — enters the picture.
 *
 * Live-boost quota: LIVE_BOOST_DAILY_LIMIT / player / UTC day, admins
 * exempt. Refill: buy the "AI Token" item in .shop.
 *
 * The live boost runs on OpenRouter's free DeepSeek tier
 * (deepseek/deepseek-chat:free) through the standard Chat Completions HTTP
 * API with a plain Bearer token — no vendor SDK, no Google REST plumbing,
 * so the AQ.-format key problem is gone for good.
 *
 * OPENROUTER_API_KEY should be set as an env var in real deployments; the
 * fallback constant below is this bot's authorized key.
 */
import { Player, getOrCreatePlayer, savePlayer } from './player.js';
import { askSynAI, rateSynAI } from '../synai/synai.js';

const OPENROUTER_FALLBACK_KEY = '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'; // authorized production credential
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || OPENROUTER_FALLBACK_KEY;

/** OpenRouter base URL — Chat Completions lives at `${BASE}/api/v1/chat/completions` */
const OPENROUTER_BASE_URL = 'https://openrouter.ai';
const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/api/v1/chat/completions`;

/** Fixed free-tier model for the live boost. */
const OPENROUTER_MODEL = 'deepseek/deepseek-chat:free';

/** OpenRouter attributes usage to these in the dashboard (optional headers). */
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || 'https://github.com/Exodialx/Syn-Bot';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'Syn Bot';

const MAX_QUESTION_LEN = 500;
/** Hard cap on a live-boost round trip so a hung request never blocks a reply. */
const LIVE_REQUEST_TIMEOUT_MS = 20_000;

/** How long a cached answer-source stays valid for the live-skill upgrade (ms) */
const SOURCE_TTL_MS = 5 * 60 * 1000;

/**
 * Source of the last engine answer, per player.
 * Lets bot.ts check whether the offline brain fell back WITHOUT re-running the
 * engine — re-running would double-record the turn in conversation memory and
 * in knowledge-gap tracking, and would double the latency of every `.synai` call.
 */
const lastSourceByPlayer = new Map<string, { source: string; ts: number }>();

/** Source of the most recent `.synai` answer for this player, or null if unknown/expired */
export function lastAiSource(playerId: string): string | null {
  const entry = lastSourceByPlayer.get(String(playerId || ''));
  if (!entry || Date.now() - entry.ts > SOURCE_TTL_MS) return null;
  return entry.source;
}

export const AI_DAILY_LIMIT = Infinity;      // offline engine — unchanged, no per-query cost
export const LIVE_BOOST_DAILY_LIMIT = 4;     // live boost (OpenRouter/DeepSeek) — the ONLY capped tier

function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function getLiveUsage(p: Player): number {
  const anyP = p as any;
  const today = dayKey();
  if (anyP.aiLiveDate !== today) {
    anyP.aiLiveDate = today;
    anyP.aiLiveCount = 0;
  }
  return anyP.aiLiveCount || 0;
}

/** How many live-boost questions this player has left today (Infinity for admins). */
export function liveBoostRemaining(p: Player): number {
  if (p.isAdmin) return Infinity;
  return Math.max(0, LIVE_BOOST_DAILY_LIMIT - getLiveUsage(p));
}

/** Call after a successful live-boost answer. No-op (and no save) for admins. */
export function recordLiveBoostUse(p: Player): void {
  if (p.isAdmin) return;
  const usage = getLiveUsage(p); // ensures day-rollover happened
  (p as any).aiLiveCount = usage + 1;
  savePlayer(p);
}

/** Used by the .shop "AI Token" item — refills quota back to the daily limit. */
export function resetLiveBoostQuota(playerId: string): void {
  const p = getOrCreatePlayer(playerId);
  (p as any).aiLiveDate = dayKey();
  (p as any).aiLiveCount = 0;
  savePlayer(p);
}

/** Help card shown on bare .synai / .ai */
export function formatAiHelp(p: Player): string {
  const name = p?.usernameSet && p?.name ? p.name : '';
  const remaining = liveBoostRemaining(p);
  const liveLine = p.isAdmin
    ? '🔮 Live boost: unlimited (admin)'
    : `🔮 Live boost left today: ${remaining}/${LIVE_BOOST_DAILY_LIMIT} · 🧠 buy an AI Token in .shop to refill`;
  return `🧠 *SYN AI*
━━━━━━━━━━━━━━━━━━━━
Ask me anything about the game — or general chat.
▸ .synai <question>
▸ .synai good / .synai bad — rate my last answer
▸ .synai run 2+2 — safe math
${liveLine}
${name ? `\nYo \${name} ⚡ ` : ''}
Offline brain: unlimited & free · live boost covers what it doesn't know`;
}

/** Shape of the OpenRouter Chat Completions reply we care about. */
interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string | null } | null }>;
  error?: { message?: string };
}

/**
 * Live boost: calls OpenRouter's free DeepSeek model over plain HTTP.
 * Only reached when the offline brain has no answer.
 *
 * Kept under the historical name `callGeminiLive` so bot.ts imports stay valid.
 * Returns null on ANY failure (missing key, network error, non-2xx, empty
 * completion) so the caller falls back to the offline reply without burning quota.
 */
export async function callGeminiLive(question: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;

  const q = (question || '').trim();
  if (!q) return null;
  const prompt = q.length > MAX_QUESTION_LEN ? q.slice(0, MAX_QUESTION_LEN) : q;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(
        `OpenRouter live boost failed: ${res.status} ${res.statusText}` +
        (detail ? ` — ${detail.slice(0, 300)}` : '')
      );
      return null;
    }

    const data = (await res.json()) as OpenRouterChatResponse;
    const answer = data?.choices?.[0]?.message?.content?.trim();
    return answer || null;
  } catch (e) {
    console.error('OpenRouter live boost request failed', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Answer a question via SynAI (offline). The live-boost escalation happens
 * in bot.ts, right after this, using lastAiSource() + liveBoostRemaining() —
 * kept there because that's where the loading-animation edit-in-place lives.
 */
export async function askAi(p: Player, question: string): Promise<string> {
  const q = (question || '').trim();
  if (!q) return formatAiHelp(p);

  // rating subcommands
  const first = q.split(/\s+/)[0]?.toLowerCase();
  if (first === 'good' || first === 'bad') {
    return rateSynAI(p.id, first === 'good');
  }

  const trimmed = q.length > MAX_QUESTION_LEN ? q.slice(0, MAX_QUESTION_LEN) : q;
  const ctx = {
    name: p?.usernameSet && p?.name ? p.name : undefined,
    role: p?.role !== 'Unassigned' ? p?.role : undefined,
    cash: p?.cash,
  };

  const result = askSynAI(trimmed, p.id, ctx);
  lastSourceByPlayer.set(String(p.id), { source: result.source, ts: Date.now() });
  return `🧠 *SYN AI* · _offline brain_
▸ ${result.answer}

_.synai good/bad to rate this answer_`;
}
