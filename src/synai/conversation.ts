/**
 * Short-term conversational memory scoped by chatJid + userId.
 * Bounded history + inactivity TTL. Does not invent context.
 */
export type ConvTurn = { role: 'user' | 'assistant'; text: string; ts: number };

type Session = {
  turns: ConvTurn[];
  lastActive: number;
  lastTopic?: string;
  lastBotMsgId?: string;
  /** e.g. 5_000_000 from '20% of 5m' for later 'what about 35%?' */
  lastNumericBase?: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_TURNS = 8; // 4 exchanges
const sessions = new Map<string, Session>();

function key(chatJid: string, userId: string): string {
  return `${chatJid}|${userId}`;
}

function purgeStale(now = Date.now()): void {
  for (const [k, s] of sessions) {
    if (now - s.lastActive > TTL_MS) sessions.delete(k);
  }
}

export function getConversation(chatJid: string, userId: string): Session {
  purgeStale();
  const k = key(chatJid, userId);
  let s = sessions.get(k);
  if (!s) {
    s = { turns: [], lastActive: Date.now() };
    sessions.set(k, s);
  }
  return s;
}

export function isActiveConversation(chatJid: string, userId: string, withinMs = 8 * 60 * 1000): boolean {
  const s = sessions.get(key(chatJid, userId));
  if (!s || !s.turns.length) return false;
  return Date.now() - s.lastActive <= withinMs;
}

export function recordUserTurn(chatJid: string, userId: string, text: string): void {
  const s = getConversation(chatJid, userId);
  s.turns.push({ role: 'user', text: text.slice(0, 500), ts: Date.now() });
  while (s.turns.length > MAX_TURNS) s.turns.shift();
  s.lastActive = Date.now();
  const base = extractMoneyBase(text);
  if (base != null) {
    s.lastNumericBase = base;
  } else if (!/^\s*(?:what about|and|how about)?\s*\d+(?:\.\d+)?\s*%/i.test(text)) {
    // Unrelated question — stop carrying percent base into later turns
    s.lastNumericBase = undefined;
  }
}

/** Parse "20% of 5m" / "5 million" style bases for % follow-ups */
function extractMoneyBase(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, "");
  // "20% of 5m" | "20 percent of 5 million"
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)\s*(k|m|b|million|thousand)?\b/);
  if (!m) return null;
  let n = parseFloat(m[2]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[3] || "").toLowerCase();
  if (suf === "k" || suf === "thousand") n *= 1_000;
  if (suf === "m" || suf === "million") n *= 1_000_000;
  if (suf === "b") n *= 1_000_000_000;
  return n;
}

/** Expand "what about 35%?" using lastNumericBase when present */
export function expandPercentFollowUp(chatJid: string, userId: string, text: string): string {
  const s = sessions.get(`${chatJid}|${userId}`);
  if (!s?.lastNumericBase) return text;
  const m = text.trim().match(/^(?:what about|and|how about)?\s*(\d+(?:\.\d+)?)\s*%\??$/i);
  if (!m) return text;
  const pct = parseFloat(m[1]);
  if (!Number.isFinite(pct)) return text;
  const val = Math.round((pct / 100) * s.lastNumericBase);
  return `${text} (that is ${pct}% of ${s.lastNumericBase.toLocaleString()} = ${val.toLocaleString()})`;
}


export function recordAssistantTurn(
  chatJid: string,
  userId: string,
  text: string,
  opts?: { topic?: string; botMsgId?: string }
): void {
  const s = getConversation(chatJid, userId);
  s.turns.push({ role: 'assistant', text: text.slice(0, 800), ts: Date.now() });
  while (s.turns.length > MAX_TURNS) s.turns.shift();
  s.lastActive = Date.now();
  if (opts?.topic) s.lastTopic = opts.topic;
  if (opts?.botMsgId) s.lastBotMsgId = opts.botMsgId;
}

export function conversationMessagesForPrompt(chatJid: string, userId: string): { role: 'user' | 'assistant'; content: string }[] {
  const s = getConversation(chatJid, userId);
  return s.turns.map((t) => ({ role: t.role, content: t.text }));
}

export function markBotMessage(chatJid: string, userId: string, msgId: string): void {
  const s = getConversation(chatJid, userId);
  s.lastBotMsgId = msgId;
  s.lastActive = Date.now();
}

export function wasReplyToSynAi(chatJid: string, userId: string, quotedId?: string | null): boolean {
  if (!quotedId) return false;
  const s = sessions.get(key(chatJid, userId));
  return !!(s?.lastBotMsgId && s.lastBotMsgId === quotedId);
}
