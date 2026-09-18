import { getDb, saveDb } from '../db/database.js';
import { debugClassify } from './synai.js';
export type DigestCategory = 'bug' | 'complaint' | 'praise' | 'featureRequest' | 'other';
export interface DigestEntry { sender: string; text: string; timestamp: number; category: DigestCategory; }
export interface AbuseEntry { sender: string; text: string; timestamp: number; flaggedAdmin?: string; }
export interface SuggestEntry { sender: string; text: string; timestamp: number; category: DigestCategory; removed?: boolean; }
export interface GroupSynAIState { listening: { digest: boolean; abuse: boolean }; buffers: { digest: DigestEntry[]; abuse: AbuseEntry[]; suggestions: SuggestEntry[] }; }
export interface LibrarySlot { name: string; count: number; }
const MAX_BUF = 500;
function store(): Record<string, GroupSynAIState> {
  const db = getDb() as any;
  if (!db.synaiGroups) db.synaiGroups = {};
  return db.synaiGroups;
}
export function getGroupSynAI(chatJid: string): GroupSynAIState {
  const s = store();
  const k = chatJid || 'global';
  if (!s[k]) s[k] = { listening: { digest: false, abuse: false }, buffers: { digest: [], abuse: [], suggestions: [] } };
  const g = s[k];
  if (!g.listening) g.listening = { digest: false, abuse: false };
  if (!g.buffers) g.buffers = { digest: [], abuse: [], suggestions: [] };
  if (!Array.isArray(g.buffers.digest)) g.buffers.digest = [];
  if (!Array.isArray(g.buffers.abuse)) g.buffers.abuse = [];
  if (!Array.isArray(g.buffers.suggestions)) g.buffers.suggestions = [];
  return g;
}
function save(): void { saveDb(); }
function classifyDigest(text: string): DigestCategory {
  const t = String(text || '').toLowerCase();
  if (/\b(bug|broken|error|glitch|not working|crash|fail|stuck)\b/.test(t)) return 'bug';
  if (/\b(add|should add|suggest|wish|feature|please add|idea)\b/.test(t)) return 'featureRequest';
  if (/\b(hate|scam|unfair|cheat|complaint|angry|annoying|sucks|rigged|rip.?off|nerf|broken|useless|trash|waste)\b|too long|too slow|too expensive|too high|way too|pay to win/i.test(t)) return 'complaint';
  if (/\b(love|great|awesome|nice|thanks|good bot|amazing|best)\b/.test(t)) return 'praise';
  try {
    const d = debugClassify(text);
    if (d.intent.includes('bug')) return 'bug';
    if (d.intent.includes('complaint')) return 'complaint';
    if (d.intent.includes('praise') || d.intent.includes('thank')) return 'praise';
    if (d.intent.includes('suggest') || d.intent.includes('feature')) return 'featureRequest';
  } catch { /* keep other */ }
  return 'other';
}

export const ABUSE_KEYWORDS = ['abuse', 'abusing', 'cheat', 'cheating', 'corrupt', 'favoritism', 'rigged', 'unfair ban', 'power trip', 'admin abuse', 'mod abuse', 'stealing', 'spawned', 'gave himself', 'gave herself', 'free money', '.admin give', '.admin set'];
export const ABUSE_NEGATIVE = ['stupid', 'dumb', 'idiot', 'hate', 'sucks', 'trash', 'biased', 'unfair', 'wrong', 'liar', 'lying'];
function detectAbuse(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!ABUSE_KEYWORDS.some((k) => t.includes(k.toLowerCase()))) return false;
  if (/\b(admin|mod|owner)\b/.test(t)) return true;
  return ABUSE_NEGATIVE.some((w) => t.includes(w));
}
function detectFlaggedAdmin(text: string): string | undefined {
  const m = String(text || '').match(/@(\d{7,15})/);
  if (m) return m[1];
  const nm = String(text || '').match(/(?:admin|mod)\s+([a-z0-9_]{3,20})/i);
  if (nm) return nm[1];
  return undefined;
}
export function ingestGroupMessage(chatJid: string, sender: string, text: string): 'abuse' | 'digest' | null {
  const t = (text || '').trim();
  if (!t || t.startsWith('.')) return null;
  if (t.length < 2) return null;
  const g = getGroupSynAI(chatJid);
  let hit: 'abuse' | 'digest' | null = null;
  if (g.listening.digest) {
    g.buffers.digest.push({ sender: String(sender), text: t.slice(0, 500), timestamp: Date.now(), category: classifyDigest(t) });
    if (g.buffers.digest.length > MAX_BUF) g.buffers.digest = g.buffers.digest.slice(-MAX_BUF);
    hit = 'digest';
  }
  if (g.listening.abuse && detectAbuse(t)) {
    g.buffers.abuse.push({ sender: String(sender), text: t.slice(0, 800), timestamp: Date.now(), flaggedAdmin: detectFlaggedAdmin(t) });
    if (g.buffers.abuse.length > MAX_BUF) g.buffers.abuse = g.buffers.abuse.slice(-MAX_BUF);
    hit = 'abuse';
  }
  if (hit) save();
  return hit;
}
export function getLibrarySlots(chatJid: string): LibrarySlot[] {
  const g = getGroupSynAI(chatJid);
  return [
    { name: 'gc-digest', count: g.buffers.digest.length },
    { name: 'abuse-log', count: g.buffers.abuse.length },
    { name: 'suggestions', count: g.buffers.suggestions.filter((s) => !s.removed).length },
  ];
}
export function dumpLibrarySlot(chatJid: string, slot: string): string {
  const g = getGroupSynAI(chatJid);
  const s = String(slot || '').toLowerCase().replace(/[_ ]/g, '-');
  if (s === 'gc-digest' || s === 'digest') {
    if (!g.buffers.digest.length) return 'Empty gc-digest.';
    return g.buffers.digest.slice(-30).map((e, i) => `${i + 1}. [${e.category}] ...${e.sender.slice(-4)}: ${e.text.slice(0, 180)}`).join('\n');
  }
  if (s === 'abuse-log' || s === 'abuse') {
    if (!g.buffers.abuse.length) return 'Empty abuse-log.';
    return g.buffers.abuse.slice(-30).map((e, i) => `${i + 1}. ...${e.sender.slice(-4)} @${new Date(e.timestamp).toLocaleString()}: ${e.text}`).join('\n');
  }
  if (s === 'suggestions' || s === 'suggestion' || s === 'suggest') {
    const list = g.buffers.suggestions.filter((x) => !x.removed);
    if (!list.length) return 'Empty suggestions.';
    return list
      .map((e, i) => `${i + 1}. [${e.category}] ...${e.sender.slice(-4)} @${new Date(e.timestamp).toLocaleString()}: ${e.text}`)
      .join('\n');
  }
  return `Unknown slot "${slot}". Slots: gc-digest, abuse-log, suggestions`;
}

// ── Suggestions buffer (player-submitted ideas / bug reports) ──
export function addSuggestion(chatJid: string, sender: string, text: string): { index: number; category: DigestCategory } {
  const g = getGroupSynAI(chatJid);
  const entry: SuggestEntry = {
    sender: String(sender),
    text: String(text || '').slice(0, 500),
    timestamp: Date.now(),
    category: classifyDigest(text),
  };
  g.buffers.suggestions.push(entry);
  if (g.buffers.suggestions.length > MAX_BUF) g.buffers.suggestions = g.buffers.suggestions.slice(-MAX_BUF);
  save();
  return { index: g.buffers.suggestions.length, category: entry.category };
}
export function activeSuggestions(chatJid: string): SuggestEntry[] {
  return getGroupSynAI(chatJid).buffers.suggestions.filter((s) => !s.removed);
}
export function removeSuggestion(chatJid: string, index: number): SuggestEntry | null {
  const g = getGroupSynAI(chatJid);
  const list = g.buffers.suggestions.filter((s) => !s.removed);
  const target = list[index - 1];
  if (!target) return null;
  target.removed = true;
  save();
  return target;
}
export function clearSuggestions(chatJid: string): number {
  const g = getGroupSynAI(chatJid);
  const n = g.buffers.suggestions.filter((s) => !s.removed).length;
  g.buffers.suggestions = [];
  save();
  return n;
}
export function clearAbuseBuffer(chatJid: string): number {
  const g = getGroupSynAI(chatJid);
  const n = g.buffers.abuse.length;
  g.buffers.abuse = [];
  save();
  return n;
}
export function flushDigestBuffer(chatJid: string): DigestEntry[] {
  const g = getGroupSynAI(chatJid);
  const out = [...g.buffers.digest];
  g.buffers.digest = [];
  save();
  return out;
}
export function lastAbuseEntry(chatJid: string): AbuseEntry | null {
  const g = getGroupSynAI(chatJid);
  return g.buffers.abuse.length ? g.buffers.abuse[g.buffers.abuse.length - 1] : null;
}
