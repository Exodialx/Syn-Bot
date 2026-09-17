/*/*
 * .synai — SYN AI, powered by SynAI (offline engine) + an optional Gemini
 * "live boost" for questions the offline brain doesn't know.
 *
 * The offline engine (pattern matching + TF-IDF + taught/learned knowledge)
 * stays the primary brain — it's tried first for every question, for every
 * player, free and unlimited. Nothing about it changes here.
 *
 * ONLY when the offline brain falls back does a live Gemini call happen,
 * and only if the player has live-boost quota left for the day (or is
 * admin, who are unlimited). This is the ONLY place a real API call — and
 * therefore real cost — enters the picture.
 *
 * Live-boost quota: LIVE_BOOST_DAILY_LIMIT / player / UTC day, admins
 * exempt. Refill: buy the "AI Token" item in .shop.
 *
 * GEMINI_API_KEY should be set as an env var in real deployments. The
 * fallback constant below is a TEST key, hardcoded only because the person
 * running this bot explicitly asked for that with full awareness it's
 * exposed in source — rotate/remove it before any real traffic touches
 * this bot.
 */
import { GoogleGenAI } from '@google/genai';
import { Player, getOrCreatePlayer, savePlayer } from './player.js';
import { askSynAI, rateSynAI } from '../synai/synai.js';

const GEMINI_FALLBACK_KEY = 'AQ.Ab8RN6I5Z1S-OhI3LaBKoW81k1GWL8JIG1IylsS2VvTGnG8XuQ'; // TEST KEY — dummy/test use only, rotate before real traffic
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || GEMINI_FALLBACK_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const MAX_QUESTION_LEN = 500;

// Initialize the official Google GenAI SDK to safely parse AQ. format keys
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
export const LIVE_BOOST_DAILY_LIMIT = 4;     // Gemini live boost — the ONLY capped/paid tier

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

/** Calls Gemini directly via official SDK. Only reached when the offline brain has no answer. */
export async function callGeminiLive(question: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: question,
      config: {
        maxOutputTokens: 300,
        temperature: 0.7,
      }
    });

    const answer = response.text?.trim();
    return answer || null;
  } catch (e) {
    console.error('Gemini SDK generation failed', e);
    return null;
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
