/**
 * Extra minigames — shell, racket, futures, prison poker, riddle, race,
 * assassination roulette, contraband, interrogation, counting, counterfeit,
 * auction, rat-or-ride, ghost market.
 */
import { Player, savePlayer, addXp, getAllPlayers, getPlayer, getOrCreatePlayer } from './player.js';
import { getDb, saveDb } from '../db/database.js';

// crypto findToken may not be exported — local helper
function tokenPrice(sym: string): number | null {
  const db = getDb() as any;
  const t = (db.crypto?.tokens || []).find((x: any) => x.symbol === sym.toUpperCase());
  return t ? t.price : null;
}

function now() { return Date.now(); }

// ─── SHELL GAME ───────────────────────────────────────────────
type ShellSession = { bet: number; round: number; wins: number; cups: number };
const shells = new Map<string, ShellSession>();

export function shellStart(p: Player, bet: number): string {
  if (!bet || bet < 200 || bet > 100_000) return 'Usage: .shell <bet>  (min $200 · max $200k)';
  if (p.cash < bet) return `❌ Need $${bet.toLocaleString()}`;
  p.cash -= bet;
  shells.set(p.id, { bet, round: 1, wins: 0, cups: 3 });
  savePlayer(p);
  return `🥣 *SHELL GAME* · Round 1/3
━━━━━━━━━━━━━━━━━━━━
Bet locked: $${bet.toLocaleString()}
3 cups. Pick the ball.
▸ .shell 1  ·  .shell 2  ·  .shell 3
Win a round → stake doubles. Lose → done.`;
}

export function shellPick(p: Player, cup: number): string {
  const s = shells.get(p.id);
  if (!s) return '❌ No game. .shell <bet>';
  if (cup < 1 || cup > 3) return 'Pick 1, 2, or 3';
  const ball = 1 + Math.floor(Math.random() * 3);
  if (cup !== ball) {
    shells.delete(p.id);
    return `💀 Ball was under cup ${ball}.
💸 Lost $${s.bet.toLocaleString()}
Round ${s.round}/3 · wins ${s.wins}`;
  }
  s.wins += 1;
  const pot = s.bet * Math.pow(2, s.wins);
  if (s.round >= 3) {
    shells.delete(p.id);
    p.cash += pot;
    addXp(p, 40);
    savePlayer(p);
    return `🏆 *SHELL CLEAN SWEEP*
━━━━━━━━━━━━━━━━━━━━
3/3 correct · payout $${pot.toLocaleString()}
💰 Cash $${p.cash.toLocaleString()}`;
  }
  s.round += 1;
  return `✅ Cup ${cup} — correct!
Stake now $${pot.toLocaleString()}
Round ${s.round}/3 — pick again
▸ .shell 1  ·  .shell 2  ·  .shell 3
.shell cashout — take current pot`;
}

export function shellCashout(p: Player): string {
  const s = shells.get(p.id);
  if (!s || s.wins === 0) return '❌ Nothing to cash out.';
  const pot = s.bet * Math.pow(2, s.wins);
  shells.delete(p.id);
  p.cash += pot;
  savePlayer(p);
  return `💵 Cashed out $${pot.toLocaleString()} after ${s.wins} win(s).`;
}

// ─── NUMBER RACKET ─────────────────────────────────────────────
type RacketPot = { entries: { id: string; pick: number; bet: number }[]; closes: number };
function getRacket(): RacketPot {
  const db = getDb() as any;
  if (!db.numberRacket || db.numberRacket.closes < now()) {
    db.numberRacket = { entries: [], closes: now() + 10 * 60_000 };
    saveDb();
  }
  return db.numberRacket;
}

export function racketJoin(p: Player, pick: number, bet: number): string {
  if (!bet || bet < 500) return 'Usage: .racket <1-100> <bet>';
  if (pick < 1 || pick > 100) return 'Pick a number 1–100';
  if (p.cash < bet) return '❌ Not enough cash';
  const pot = getRacket();
  if (pot.entries.some(e => e.id === p.id)) return '❌ Already in this round.';
  p.cash -= bet;
  pot.entries.push({ id: p.id, pick, bet });
  savePlayer(p);
  saveDb();
  const total = pot.entries.reduce((s, e) => s + e.bet, 0);
  const left = Math.ceil((pot.closes - now()) / 60000);
  return `🎱 *NUMBER RACKET*
━━━━━━━━━━━━━━━━━━━━
Your pick: *${pick}* · bet $${bet.toLocaleString()}
Pot: $${total.toLocaleString()} · ${pot.entries.length} players
Closes in ~${left}m
.racket resolve — when timer ends`;
}

export function racketResolve(p: Player): string {
  const pot = getRacket();
  if (now() < pot.closes && pot.entries.length < 2) {
    return `⏳ Wait for close or more players (${pot.entries.length}/2+).`;
  }
  if (!pot.entries.length) return '❌ Empty pot.';
  const target = 1 + Math.floor(Math.random() * 100);
  let best = pot.entries[0];
  let bestDist = Math.abs(best.pick - target);
  for (const e of pot.entries) {
    const d = Math.abs(e.pick - target);
    if (d < bestDist) { best = e; bestDist = d; }
  }
  const total = pot.entries.reduce((s, e) => s + e.bet, 0);
  const winner = getOrCreatePlayer(best.id);
  const cut = Math.floor(total * 0.9); // 10% house
  winner.cash += cut;
  savePlayer(winner);
  const db = getDb() as any;
  db.numberRacket = { entries: [], closes: now() + 10 * 60_000 };
  saveDb();
  return `🎱 *RACKET RESULT*
━━━━━━━━━━━━━━━━━━━━
Number was *${target}*
Winner: ${winner.name || '...' + best.id.slice(-4)} (picked ${best.pick})
▸ +$${cut.toLocaleString()} (90% of pot)`;
}

// ─── CRYPTO FUTURES ───────────────────────────────────────────
type FutureBet = { id: string; sym: string; dir: 'up' | 'down'; bet: number; price: number; resolves: number };
function futures(): FutureBet[] {
  const db = getDb() as any;
  if (!db.futures) db.futures = [];
  return db.futures;
}

export function futureBet(p: Player, sym: string, dirRaw: string, bet: number): string {
  const dir = (dirRaw || '').toLowerCase();
  if (!['up', 'down'].includes(dir) || !bet || bet < 500) {
    return 'Usage: .futures <SYM> up|down <bet>';
  }
  const price = tokenPrice(sym);
  if (price == null) return '❌ Unknown token. .crypto';
  if (p.cash < bet) return '❌ Not enough cash';
  p.cash -= bet;
  const list = futures();
  list.push({ id: p.id, sym: sym.toUpperCase(), dir: dir as any, bet, price, resolves: now() + 10 * 60_000 });
  savePlayer(p);
  saveDb();
  return `📉 *CRYPTO FUTURES*
━━━━━━━━━━━━━━━━━━━━
${sym.toUpperCase()} @ $${price.toFixed(6)}
You bet *${dir.toUpperCase()}* · $${bet.toLocaleString()}
Resolves in 10 minutes
.futures claim — after timer`;
}

export function futureClaim(p: Player): string {
  const list = futures();
  const mine = list.filter(f => f.id === p.id && f.resolves <= now());
  if (!mine.length) {
    const pending = list.filter(f => f.id === p.id);
    if (pending.length) {
      const left = Math.ceil((pending[0].resolves - now()) / 60000);
      return `⏳ ${pending.length} future(s) still open (~${left}m)`;
    }
    return '❌ No futures to claim.';
  }
  let msg = `📉 *FUTURES SETTLED*\n━━━━━━━━━━━━━━━━━━━━\n`;
  const db = getDb() as any;
  for (const f of mine) {
    const price = tokenPrice(f.sym) ?? f.price;
    const wentUp = price >= f.price;
    const win = (f.dir === 'up' && wentUp) || (f.dir === 'down' && !wentUp);
    if (win) {
      const payout = Math.floor(f.bet * 1.85);
      p.cash += payout;
      msg += `✅ ${f.sym} ${f.dir} · +$${payout.toLocaleString()}\n`;
    } else {
      msg += `❌ ${f.sym} ${f.dir} · lost $${f.bet.toLocaleString()}\n`;
    }
  }
  db.futures = list.filter(f => !(f.id === p.id && f.resolves <= now()));
  savePlayer(p);
  saveDb();
  msg += `💰 Cash $${p.cash.toLocaleString()}`;
  return msg;
}

// ─── PRISON POKER ─────────────────────────────────────────────
export function prisonPoker(p: Player, bet: number): string {
  if (!(p.inPrison && now() < p.prisonUntil)) return '❌ Only playable in prison.';
  if (!bet || bet < 1 || bet > 50) return 'Usage: .prisonpoker <1-50>  (cigarettes)';
  const db = getDb() as any;
  if (!db.prisonCurrency) db.prisonCurrency = {};
  if (!db.prisonCurrency[p.id]) db.prisonCurrency[p.id] = { soap: 3, cigs: 10 };
  const bag = db.prisonCurrency[p.id];
  if (bag.cigs < bet) return `❌ Only ${bag.cigs} cigarettes.`;
  bag.cigs -= bet;
  const you = 1 + Math.floor(Math.random() * 13);
  const them = 1 + Math.floor(Math.random() * 13);
  if (you > them) {
    bag.cigs += bet * 2;
    saveDb();
    return `🃏 *PRISON POKER*
━━━━━━━━━━━━━━━━━━━━
You ${you} vs Yard ${them}
✅ Won ${bet * 2} cigarettes
🚬 Stock: ${bag.cigs}`;
  }
  if (you === them) {
    bag.cigs += bet;
    saveDb();
    return `🃏 Tie — cigs returned. Stock: ${bag.cigs}`;
  }
  saveDb();
  return `🃏 *PRISON POKER*
━━━━━━━━━━━━━━━━━━━━
You ${you} vs Yard ${them}
💀 Lost ${bet} cigarettes
🚬 Stock: ${bag.cigs}`;
}

// ─── HITMAN RIDDLE ────────────────────────────────────────────
const RIDDLES = [
  { q: 'I have cities but no houses, forests but no trees, water but no fish. What am I?', a: 'map' },
  { q: 'The more you take, the more you leave behind. What am I?', a: 'footsteps' },
  { q: 'What has keys but can\'t open locks?', a: 'piano' },
  { q: 'I speak without a mouth and hear without ears. What am I?', a: 'echo' },
  { q: 'What gets wetter the more it dries?', a: 'towel' }
];

export function riddleStart(p: Player): string {
  // Open to all roles
  if (false && p.role !== 'Hitman') return '❌ Hitman only.';
  const db = getDb() as any;
  if (!db.riddles) db.riddles = {};
  const r = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
  db.riddles[p.id] = { a: r.a, at: now() };
  saveDb();
  return `🧩 *HITMAN RIDDLE*
━━━━━━━━━━━━━━━━━━━━
${r.q}
▸ .riddle <answer>
Correct → hidden contract unlock`;
}

export function riddleAnswer(p: Player, ans: string): string {
  const db = getDb() as any;
  const s = db.riddles?.[p.id];
  if (!s) return '❌ No active riddle. .riddle';
  if ((ans || '').toLowerCase().includes(s.a)) {
    delete db.riddles[p.id];
    p.cash += 25000;
    addXp(p, 60);
    savePlayer(p);
    saveDb();
    return `🎯 *RIDDLE SOLVED*
━━━━━━━━━━━━━━━━━━━━
Hidden contract unlocked
▸ +$25,000
Check .contracts`;
  }
  return '❌ Wrong. Try again or .riddle for a new one.';
}

// ─── STREET RACE ──────────────────────────────────────────────
export function streetRace(p: Player, targetRaw: string, bet: number): string {
  if (!bet || bet < 1000) return 'Usage: .race <@/num> <bet>';
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const t = getPlayer(tid);
  if (!t) return '❌ Target never joined.';
  if (p.cash < bet || t.cash < bet) return '❌ Both need enough cash.';
  // simple stat race: luck + stealth + level noise
  const you = p.luck + p.stealth + p.level + Math.random() * 20;
  const them = t.luck + t.stealth + t.level + Math.random() * 20;
  p.cash -= bet;
  t.cash -= bet;
  if (you >= them) {
    p.cash += bet * 2;
    savePlayer(p);
    savePlayer(t);
    return `🏎️ *STREET RACE*
━━━━━━━━━━━━━━━━━━━━
You edged ${t.name || '...' + tid.slice(-4)}
▸ +$${bet.toLocaleString()}`;
  }
  t.cash += bet * 2;
  savePlayer(p);
  savePlayer(t);
  return `🏎️ *STREET RACE*
━━━━━━━━━━━━━━━━━━━━
Lost to ${t.name || '...' + tid.slice(-4)}
💸 -$${bet.toLocaleString()}`;
}


// ─── ROULETTE (solo wheel) ───────────────────────────────────
export function rouletteJoin(p: Player, bet: number, color?: string): string {
  if (!bet || bet < 500) return `Usage: .roulette <bet> [red|black|green]
red/black pays 2× · green pays 14×
Max bet $100,000`;
  if (bet > 5_000) return '❌ Max bet $5,000';
  if (p.cash < bet) return '❌ Not enough cash';
  const pick = (color || 'red').toLowerCase();
  if (!['red', 'black', 'green'].includes(pick)) return 'Pick red, black, or green';
  p.cash -= bet;
  // European-ish: 0 green, 1-18 red-ish alternate, 19-36 black-ish
  const n = Math.floor(Math.random() * 37); // 0-36
  let landed: 'red' | 'black' | 'green' = 'green';
  if (n === 0) landed = 'green';
  else if (n % 2 === 1) landed = 'red';
  else landed = 'black';

  let result = '';
  if (pick === landed) {
    const mult = landed === 'green' ? 14 : 2;
    const win = Math.floor(bet * mult);
    p.cash += win;
    result = `🏆 ${landed.toUpperCase()} ${n} · +$${win.toLocaleString()}`;
    addXp(p, 15);
  } else {
    result = `💀 ${landed.toUpperCase()} ${n} · lost $${bet.toLocaleString()}`;
  }
  savePlayer(p);
  return `🎰 *ROULETTE*
━━━━━━━━━━━━━━━━━━━━
You: *${pick}*  ·  $${bet.toLocaleString()}
Ball: *${landed}* (${n})
${result}
💰 $${p.cash.toLocaleString()}`;
}

export function rouletteSpin(p: Player): string {
  return 'Usage: .roulette <bet> [red|black|green]';
}

// ─── CONTRABAND RUN ───────────────────────────────────────────
const RUNS = new Map<string, { step: number; bet: number; path: string[] }>();

export function contrabandStart(p: Player, bet: number): string {
  if (!bet || bet < 1000) return 'Usage: .contraband <bet>';
  if (p.cash < bet) return '❌ Not enough cash';
  p.cash -= bet;
  RUNS.set(p.id, { step: 0, bet, path: [] });
  savePlayer(p);
  return `📦 *CONTRABAND RUN*
━━━━━━━━━━━━━━━━━━━━
Checkpoint 1/3 — cops ahead
▸ .contraband alley
▸ .contraband highway
▸ .contraband wait`;
}

export function contrabandChoice(p: Player, choice: string): string {
  const s = RUNS.get(p.id);
  if (!s) return '❌ No run. .contraband <bet>';
  const c = (choice || '').toLowerCase();
  const good = ['alley', 'wait', 'tunnel', 'side', 'slow'];
  const ok = good.includes(c) || Math.random() > 0.4;
  s.step += 1;
  s.path.push(c);
  if (!ok) {
    RUNS.delete(p.id);
    p.heat = Math.min(100, p.heat + 12);
    savePlayer(p);
    return `🚨 *CAUGHT*
━━━━━━━━━━━━━━━━━━━━
Wrong call at checkpoint ${s.step}.
💸 Lost $${s.bet.toLocaleString()} · Heat +12`;
  }
  if (s.step >= 3) {
    RUNS.delete(p.id);
    const win = Math.floor(s.bet * 2.4);
    p.cash += win;
    addXp(p, 35);
    savePlayer(p);
    return `📦 *RUN COMPLETE*
━━━━━━━━━━━━━━━━━━━━
▸ +$${win.toLocaleString()}
💰 Cash $${p.cash.toLocaleString()}`;
  }
  return `✅ Checkpoint ${s.step} clear
Next choice:
▸ .contraband tunnel
▸ .contraband side
▸ .contraband slow`;
}

// ─── INTERROGATION ────────────────────────────────────────────
const INTER = new Map<string, { q: number; correct: number }>();
const QUESTIONS = [
  { q: 'What year did the syndicate form? (answer: 2019)', a: '2019' },
  { q: 'How many roles exist? (3)', a: '3' },
  { q: 'Command to check heat city-wide?', a: 'news' },
  { q: 'Crypto command prefix?', a: 'crypto' }
];

export function interStart(p: Player): string {
  if (!(p.inPrison && now() < p.prisonUntil)) return '❌ Interrogation only while jailed.';
  INTER.set(p.id, { q: 0, correct: 0 });
  return `🔦 *INTERROGATION*
━━━━━━━━━━━━━━━━━━━━
${QUESTIONS[0].q}
▸ .inter <answer>`;
}

export function interAnswer(p: Player, ans: string): string {
  const s = INTER.get(p.id);
  if (!s) return '❌ .inter start first';
  const cur = QUESTIONS[s.q];
  if ((ans || '').toLowerCase().includes(cur.a.toLowerCase())) s.correct += 1;
  s.q += 1;
  if (s.q >= QUESTIONS.length) {
    INTER.delete(p.id);
    const reduce = s.correct * 3 * 60_000; // 3 min per correct
    p.prisonUntil = Math.max(now(), (p.prisonUntil || now()) - reduce);
    if (p.prisonUntil <= now()) { p.inPrison = false; p.prisonUntil = 0; }
    savePlayer(p);
    return `🔦 *INTERROGATION OVER*
━━━━━━━━━━━━━━━━━━━━
Correct ${s.correct}/${QUESTIONS.length}
Jail −${s.correct * 3} minutes`;
  }
  return `Next:
${QUESTIONS[s.q].q}
▸ .inter <answer>`;
}

// ─── MONEY COUNTING ───────────────────────────────────────────
const COUNT = new Map<string, { target: string; pot: number; at: number }>();
const COUNT_COOLDOWN_MS = 30 * 60 * 1000;
const countCooldowns = new Map<string, number>();

export function countStart(p: Player, bet: number): string {
  if (!bet || bet < 500) return 'Usage: .count <bet>  then .count <number>';
  if (bet > 5_000) return '❌ Max bet $5,000';
  if (p.cash < bet) return '❌ Not enough cash';
  p.cash -= bet;
  // 6-digit with spaces so players must type carefully (harder for blind copy bots)
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  COUNT.set(p.id, { target: digits, pot: bet, at: Date.now() });
  savePlayer(p);
  const spaced = digits.split('').join(' ');
  // Prefix tells bot to delete this message after 2s (anti-cheat)
  return `__COUNT_EPHEMERAL__
🧮 *MONEY COUNTING*
━━━━━━━━━━━━━━━━━━━━
Memorize this number (*disappears in 2s*):
*${spaced}*
▸ .count answer <digits>  (no spaces)
Wins 1.85× if exact`;
}

export function countAnswer(p: Player, val: string): string {
  const s = COUNT.get(p.id);
  if (!s) return '❌ Start with .count <bet> first';
  const cleaned = String(val).replace(/\s+/g, '').trim();
  if (cleaned === s.target) {
    COUNT.delete(p.id);
    const win = Math.floor(s.pot * 1.85);
    p.cash += win;
    savePlayer(p);
    return `✅ Correct · +$${win.toLocaleString()}\n💰 $${p.cash.toLocaleString()}`;
  }
  // wrong attempt — don't delete so they can retry once? delete to stop spam
  COUNT.delete(p.id);
  return `❌ Wrong. Was ${s.target}. Lost $${s.pot.toLocaleString()}`;
}

// ─── COUNTERFEIT SPOTTER ──────────────────────────────────────
export function counterfeit(p: Player, bet: number): string {
  if (!bet || bet < 500) return 'Usage: .fake <bet>';
  if (p.cash < bet) return '❌ Not enough cash';
  p.cash -= bet;
  const bills = ['A1', 'B2', 'C3', 'D4', 'E5'];
  const fakeIdx = Math.floor(Math.random() * bills.length);
  const shown = bills.map((b, i) => (i === fakeIdx ? b + '*' : b)).join('  ');
  // player must reply .fake spot N
  const db = getDb() as any;
  if (!db.fakeGame) db.fakeGame = {};
  db.fakeGame[p.id] = { fakeIdx, bet, at: now() };
  savePlayer(p);
  saveDb();
  return `💵 *COUNTERFEIT SPOTTER*
━━━━━━━━━━━━━━━━━━━━
Bills: ${bills.map((b, i) => `${i + 1}:${b}`).join(' ')}
One is fake. Spot it.
▸ .fake spot <1-5>`;
}

export function counterfeitSpot(p: Player, n: number): string {
  const db = getDb() as any;
  const g = db.fakeGame?.[p.id];
  if (!g) return '❌ .fake <bet> first';
  delete db.fakeGame[p.id];
  saveDb();
  if (n - 1 === g.fakeIdx) {
    const win = Math.floor(g.bet * 2.2);
    p.cash += win;
    savePlayer(p);
    return `✅ Spotted · +$${win.toLocaleString()}`;
  }
  return `❌ Fake was #${g.fakeIdx + 1}. Lost $${g.bet.toLocaleString()}`;
}

// ─── CARTEL AUCTION ───────────────────────────────────────────
export function auctionBid(p: Player, amount: number): string {
  if (!amount || amount < 5000) return 'Usage: .auction <bid>';
  if (p.cash < amount) return '❌ Not enough cash';
  const db = getDb() as any;
  if (!db.auction || db.auction.ends < now()) {
    db.auction = { bids: {}, ends: now() + 12 * 60_000, item: 'Mystery Crate' };
  }
  const prev = db.auction.bids[p.id] || 0;
  if (amount <= prev) return `❌ Beat your last bid ($${prev.toLocaleString()})`;
  // lock difference
  p.cash -= (amount - prev);
  db.auction.bids[p.id] = amount;
  savePlayer(p);
  saveDb();
  const top = Math.max(0, ...Object.values(db.auction.bids as Record<string, number>));
  return `🏛️ *CARTEL AUCTION*
━━━━━━━━━━━━━━━━━━━━
Item: ${db.auction.item}
Your bid: $${amount.toLocaleString()}
High bid: $${top.toLocaleString()}
Ends ~${Math.ceil((db.auction.ends - now()) / 60000)}m
.auction end — resolve`;
}

export function auctionEnd(p: Player): string {
  const db = getDb() as any;
  const a = db.auction;
  if (!a || !Object.keys(a.bids || {}).length) return '❌ No auction.';
  if (now() < a.ends) return '⏳ Auction still open.';
  let winnerId = '';
  let high = 0;
  for (const [id, bid] of Object.entries(a.bids as Record<string, number>)) {
    if (bid > high) { high = bid; winnerId = id; }
  }
  const w = getOrCreatePlayer(winnerId);
  w.cash += Math.floor(high * 0.1); // mystery rebate flavor
  // grant a random premium-ish cash prize
  const prize = Math.floor(high * 1.3);
  w.cash += prize;
  savePlayer(w);
  db.auction = null;
  saveDb();
  return `🏛️ *AUCTION CLOSED*
━━━━━━━━━━━━━━━━━━━━
Winner takes *${a.item}*
Payout value ~$${prize.toLocaleString()}
(Winner notified in spirit of the street)`;
}

// ─── RAT OR RIDE ──────────────────────────────────────────────
export function ratOrRide(p: Player, choice: string): string {
  if (!(p.inPrison && now() < p.prisonUntil)) return '❌ Only in prison.';
  const c = (choice || '').toLowerCase();
  if (!['rat', 'ride'].includes(c)) return 'Usage: .rat ride|rat';
  const db = getDb() as any;
  if (!db.ratride) db.ratride = {};
  db.ratride[p.id] = c;
  // find another jailed player with a choice
  const others = getAllPlayers().filter(x => x.id !== p.id && x.inPrison && db.ratride[x.id]);
  if (!others.length) {
    saveDb();
    return `🐀 Choice locked: *${c}*
Waiting for another inmate…`;
  }
  const o = others[Math.floor(Math.random() * others.length)];
  const oc = db.ratride[o.id];
  delete db.ratride[p.id];
  delete db.ratride[o.id];
  saveDb();
  // classic dilemma
  if (c === 'ride' && oc === 'ride') {
    p.prisonUntil = now() + 2 * 60_000;
    o.prisonUntil = now() + 2 * 60_000;
    savePlayer(p); savePlayer(o);
    return '🤝 Both rode. Short sentences.';
  }
  if (c === 'rat' && oc === 'rat') {
    p.prisonUntil = now() + 12 * 60_000;
    o.prisonUntil = now() + 12 * 60_000;
    savePlayer(p); savePlayer(o);
    return '🐀 Both ratted. Long stay.';
  }
  if (c === 'rat') {
    p.inPrison = false; p.prisonUntil = 0;
    o.prisonUntil = now() + 20 * 60_000;
    savePlayer(p); savePlayer(o);
    return '🐀 You walked free. They took the fall.';
  }
  p.prisonUntil = now() + 20 * 60_000;
  o.inPrison = false; o.prisonUntil = 0;
  savePlayer(p); savePlayer(o);
  return '💀 You rode. They ratted. Enjoy the time.';
}

// ─── GHOST MARKET ─────────────────────────────────────────────
export function ghostStatus(p: Player): string {
  const db = getDb() as any;
  if (!db.ghostMarket || db.ghostMarket.expires < now()) {
    const sym = ['GHOST', 'SHADE', 'VEIL', 'NULL'][Math.floor(Math.random() * 4)];
    db.ghostMarket = {
      sym,
      price: 0.001 + Math.random() * 0.05,
      expires: now() + 60 * 60_000,
      clue: `Symbol starts with ${sym[0]} · length ${sym.length}`
    };
    saveDb();
  }
  const g = db.ghostMarket;
  const left = Math.ceil((g.expires - now()) / 60000);
  return `👻 *GHOST MARKET*
━━━━━━━━━━━━━━━━━━━━
Hidden token listing in ~${left}m
Clue: ${g.clue}
▸ .ghost buy <SYM> <amt>
Wrong symbol = rejected`;
}

export function ghostBuy(p: Player, sym: string, amt: number): string {
  const db = getDb() as any;
  const g = db.ghostMarket;
  if (!g || g.expires < now()) return '❌ No active ghost listing. .ghost';
  if (sym.toUpperCase() !== g.sym) return '❌ That is not the ghost token.';
  if (!amt || amt <= 0) return 'Usage: .ghost buy <SYM> <amt>';
  const cost = Math.ceil(g.price * amt);
  if (p.cash < cost) return `❌ Need $${cost.toLocaleString()}`;
  p.cash -= cost;
  // credit as cash rebate later flavor — store in portfolios-like
  if (!db.ghostBags) db.ghostBags = {};
  db.ghostBags[p.id] = (db.ghostBags[p.id] || 0) + amt;
  savePlayer(p);
  saveDb();
  return `👻 Bought ${amt} ${g.sym} @ $${g.price.toFixed(4)}
−$${cost.toLocaleString()}
Hold for public list value.`;
}
