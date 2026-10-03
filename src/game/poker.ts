/**
 * Multiplayer poker table — up to 4 players, shared pot, showdown
 * Flow: .poker create <bet> → others .poker join → leader .poker deal →
 * each .poker hold|fold → when all acted, showdown
 */
import { Player, savePlayer, addXp, getOrCreatePlayer } from './player.js';
import { getDb, saveDb } from '../db/database.js';

type Rank = number;
type Card = { r: Rank; s: string };
const SUITS = ['♠', '♥', '♦', '♣'];

type Seat = {
  id: string;
  hole: Card[];
  folded: boolean;
  acted: boolean;
};

type Table = {
  id: string;
  buyIn: number;
  pot: number;
  leader: string;
  seats: Seat[];
  phase: 'waiting' | 'dealt' | 'done';
  community: Card[]; // unused in 5-card draw variant — each has 5 hole
  createdAt: number;
};

function tables(): Table[] {
  const db = getDb() as any;
  if (!db.pokerTables) db.pokerTables = [];
  return db.pokerTables as Table[];
}

function save() { saveDb(); }

function deck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function name(c: Card): string {
  const f: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  return `${f[c.r] || c.r}${c.s}`;
}

function handRank(cards: Card[]): { score: number; label: string } {
  const rs = cards.map(c => c.r).sort((a, b) => b - a);
  const ss = cards.map(c => c.s);
  const counts: Record<number, number> = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const flush = ss.every(s => s === ss[0]);
  const uniq = [...new Set(rs)].sort((a, b) => b - a);
  let straight = false;
  if (uniq.length === 5) {
    straight = uniq[0] - uniq[4] === 4;
    if (uniq.join() === '14,5,4,3,2') straight = true;
  }
  if (flush && straight) return { score: 800 + rs[0], label: 'Straight Flush' };
  if (groups[0] === 4) return { score: 700 + rs[0], label: 'Quads' };
  if (groups[0] === 3 && groups[1] === 2) return { score: 600 + rs[0], label: 'Full House' };
  if (flush) return { score: 500 + rs[0], label: 'Flush' };
  if (straight) return { score: 400 + rs[0], label: 'Straight' };
  if (groups[0] === 3) return { score: 300 + rs[0], label: 'Trips' };
  if (groups[0] === 2 && groups[1] === 2) return { score: 200 + rs[0], label: 'Two Pair' };
  if (groups[0] === 2) return { score: 100 + rs[0], label: 'Pair' };
  return { score: rs[0], label: 'High Card' };
}

export function pokerCreate(p: Player, buyIn: number): string {
  if (!buyIn || buyIn < 200) return '❌ Min buy-in $200';
  if (p.cash < buyIn) return '❌ Not enough cash';
  const all = tables();
  if (all.find(t => t.phase !== 'done' && t.seats.some(s => s.id === p.id))) {
    return '❌ Already at a table. .poker leave';
  }
  p.cash -= buyIn;
  savePlayer(p);
  const t: Table = {
    id: `P${Date.now().toString(36)}`,
    buyIn,
    pot: buyIn,
    leader: p.id,
    seats: [{ id: p.id, hole: [], folded: false, acted: false }],
    phase: 'waiting',
    community: [],
    createdAt: Date.now()
  };
  all.push(t);
  // cleanup old
  const db = getDb() as any;
  db.pokerTables = all.filter(x => Date.now() - x.createdAt < 45 * 60 * 1000);
  save();
  return `
 ♠️ TABLE ${t.id.padEnd(22)}
━━━━━━━━━━━━━━━━━━━━
Buy-in $${buyIn.toLocaleString()} · Pot $${t.pot.toLocaleString()}
Seats 1/4 · You are host
━━━━━━━━━━━━━━━━━━━━
Others: .poker join ${t.id}
Host:   .poker deal   (2+ seats)
Leave:  .poker leave
`;
}

export function pokerJoin(p: Player, tableId?: string): string {
  const all = tables().filter(t => t.phase === 'waiting');
  let t = tableId ? all.find(x => x.id === tableId) : all.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!t) return '❌ No open table. .poker create <buyin>';
  if (t.seats.some(s => s.id === p.id)) return '❌ Already seated';
  if (t.seats.length >= 4) return '❌ Table full (4)';
  if (p.cash < t.buyIn) return `❌ Need $${t.buyIn.toLocaleString()}`;
  p.cash -= t.buyIn;
  t.pot += t.buyIn;
  t.seats.push({ id: p.id, hole: [], folded: false, acted: false });
  savePlayer(p);
  save();
  return `▸ Joined ${t.id} · Pot $${t.pot.toLocaleString()} · Seats ${t.seats.length}/4
Host runs .poker deal when ready`;
}

export function pokerDeal(p: Player): string {
  const t = tables().find(x => x.leader === p.id && x.phase === 'waiting');
  if (!t) return '❌ No waiting table you host';
  if (t.seats.length < 2) return '❌ Need at least 2 players';
  const d = deck();
  let i = 0;
  for (const s of t.seats) {
    s.hole = d.slice(i, i + 5);
    i += 5;
    s.folded = false;
    s.acted = false;
  }
  t.phase = 'dealt';
  save();
  // Only tell each player their own cards via return for host; others check .poker hand
  const host = t.seats.find(s => s.id === p.id)!;
  return `🃏 DEALT · Table ${t.id}
Your hand: ${host.hole.map(name).join(' ')}
Everyone: .poker hand  |  .poker hold  |  .poker fold
When all act → auto showdown`;
}

export function pokerHand(p: Player): string {
  const t = tables().find(x => x.phase === 'dealt' && x.seats.some(s => s.id === p.id));
  if (!t) return '❌ No active hand';
  const s = t.seats.find(x => x.id === p.id)!;
  if (s.folded) return '❌ You folded';
  return `🃏 Your hand: ${s.hole.map(name).join(' ')}
.poker hold · .poker fold`;
}

export function pokerAct(p: Player, action: 'hold' | 'fold'): string {
  const t = tables().find(x => x.phase === 'dealt' && x.seats.some(s => s.id === p.id));
  if (!t) return '❌ No active hand';
  const s = t.seats.find(x => x.id === p.id)!;
  if (s.acted) return '❌ Already acted';
  if (action === 'fold') s.folded = true;
  s.acted = true;
  save();

  const alive = t.seats.filter(x => !x.folded);
  const allActed = t.seats.every(x => x.acted || x.folded);
  if (!allActed) {
    const left = t.seats.filter(x => !x.acted && !x.folded).length;
    return `▸ ${action.toUpperCase()} recorded · waiting ${left} player(s)`;
  }

  // Showdown
  t.phase = 'done';
  if (alive.length === 0) {
    save();
    return '❌ Everyone folded — pot burns';
  }
  if (alive.length === 1) {
    const w = getOrCreatePlayer(alive[0].id);
    w.cash += t.pot;
    savePlayer(w);
    save();
    return `🏆 ${alive[0].id.slice(-4)} wins pot $${t.pot.toLocaleString()} (others folded)`;
  }

  let best = alive[0];
  let bestRank = handRank(best.hole);
  const results: string[] = [];
  for (const s of alive) {
    const r = handRank(s.hole);
    results.push(`...${s.id.slice(-4)}: ${s.hole.map(name).join(' ')} (${r.label})`);
    if (r.score > bestRank.score) {
      best = s;
      bestRank = r;
    }
  }
  const winner = getOrCreatePlayer(best.id);
  winner.cash += t.pot;
  addXp(winner, 40);
  savePlayer(winner);
  save();
  return `
        ♠️ SHOWDOWN
━━━━━━━━━━━━━━━━━━━━
${results.map(r => `${r}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━
🏆 Winner ...${best.id.slice(-4)} · ${bestRank.label}
Pot $${t.pot.toLocaleString()}
`;
}

export function pokerLeave(p: Player): string {
  const all = tables();
  const t = all.find(x => x.phase !== 'done' && x.seats.some(s => s.id === p.id));
  if (!t) return '❌ Not at a table';
  if (t.phase === 'dealt') return '❌ Finish the hand first';
  // refund buy-in share approx
  t.seats = t.seats.filter(s => s.id !== p.id);
  t.pot = Math.max(0, t.pot - t.buyIn);
  p.cash += t.buyIn;
  if (t.seats.length === 0 || t.leader === p.id) {
    const db = getDb() as any;
    db.pokerTables = all.filter(x => x.id !== t.id);
  }
  savePlayer(p);
  save();
  return '▸ Left table · buy-in returned';
}

/** Solo fallback still available */
export function pokerSolo(p: Player, bet: number): string {
  return pokerCreate(p, bet);
}
