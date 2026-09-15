/**
 * Class gameplay loops — Businessman / Mafia / Hitman
 * Keeps existing UI style (━━━, *bold*, ▸ bullets).
 */
import { Player, savePlayer, addXp, addClassXp, getOrCreatePlayer, getAllPlayers, getPlayer, resolveExistingPlayerId } from './player.js';
import { getDb, saveDb } from '../db/database.js';
import { addCityHeat, getCityHeat } from './city.js';

// ─── shared helpers ───────────────────────────────────────────
function now() { return Date.now(); }
function h(ms: number) { return Math.floor(ms / 3_600_000); }
function ago(ts: number) {
  const m = Math.floor((now() - ts) / 60_000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type ClassState = {
  dirtyCash: number;
  shellActive: boolean;
  decoyNetWorth: number;
  lastBoardMeeting: number;
  boardDirective: 'cut' | 'expand' | 'underground' | null;
  loansGiven: { to: string; amount: number; interest: number; due: number }[];
  loansTaken: { from: string; amount: number; interest: number; due: number }[];
  // mafia
  crew: { tier: 'grunt' | 'enforcer' | 'capo'; name: string; upkeep: number }[];
  lastUpkeep: number;
  protectionTargets: { id: string; weekly: number; lastPaid: number }[];
  intimidate: { id: string; until: number; paid: boolean }[];
  bloodDebt: { id: string; until: number }[];
  territories: string[];
  // hitman
  signatureKills: number;
  ghostUntil: number;
  lastGhost: number;
  hitList: string[];
  stalkTarget: string | null;
  contractsTaken: string[];
  evidence: number;
  lastEvidenceClear: number;
  doubleCrossed: string[];
};

function ensureClass(p: Player): ClassState {
  const db = getDb() as any;
  if (!db.classState) db.classState = {};
  if (!db.classState[p.id]) {
    db.classState[p.id] = {
      dirtyCash: 0,
      shellActive: false,
      decoyNetWorth: 0,
      lastBoardMeeting: 0,
      boardDirective: null,
      loansGiven: [],
      loansTaken: [],
      crew: [],
      lastUpkeep: 0,
      protectionTargets: [],
      intimidate: [],
      bloodDebt: [],
      territories: [],
      signatureKills: 0,
      ghostUntil: 0,
      lastGhost: 0,
      hitList: [],
      stalkTarget: null,
      contractsTaken: [],
      evidence: 0,
      lastEvidenceClear: 0,
      doubleCrossed: []
    };
  }
  return db.classState[p.id] as ClassState;
}

function saveClass() { saveDb(); }

function requireRole(p: Player, role: string, minClass = 1): string | null {
  if (p.role !== role) return `❌ ${role} only.`;
  if (p.classLevel < minClass) return `◆ Need Class ${minClass}+`;
  if (p.inPrison && now() < p.prisonUntil) return '◆ You are in prison.';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// BUSINESSMAN
// ═══════════════════════════════════════════════════════════════

/** Crime payouts for Biz go to dirtyCash instead of clean cash */
export function addDirtyCash(p: Player, amount: number) {
  if (p.role !== 'Businessman') {
    p.cash += amount;
    return;
  }
  const cs = ensureClass(p);
  cs.dirtyCash += amount;
  saveClass();
}

export function formatLaunder(p: Player): string {
  const err = requireRole(p, 'Businessman');
  if (err) return err;
  const cs = ensureClass(p);
  return `🧺 *LAUNDROMAT*
━━━━━━━━━━━━━━━━━━━━
Dirty cash: $${cs.dirtyCash.toLocaleString()}
Clean cash: $${p.cash.toLocaleString()}

▸ .launder <amount>
  Clean dirty money through your businesses.
  Skip laundering → 30% seizure risk on bank deposit.

Shell: ${cs.shellActive ? 'ACTIVE (decoy visible)' : 'off'}
Directive: ${cs.boardDirective || 'none'}`;
}

export function launderCash(p: Player, amount: number): string {
  const err = requireRole(p, 'Businessman');
  if (err) return err;
  const cs = ensureClass(p);
  if (!amount || amount <= 0) return 'Usage: .launder <amount>';
  if (cs.dirtyCash < amount) return `❌ Only $${cs.dirtyCash.toLocaleString()} dirty.`;
  if (!p.businesses || p.businesses.length === 0) {
    return '❌ Need at least one business to launder through.';
  }
  // fee 5–12% based on class
  const feeRate = Math.max(0.05, 0.12 - p.classLevel * 0.007);
  const fee = Math.floor(amount * feeRate);
  const clean = amount - fee;
  cs.dirtyCash -= amount;
  p.cash += clean;
  const notes = addClassXp(p, Math.floor(amount / 800), 'launder');
  savePlayer(p);
  saveClass();
  return `🧺 *LAUNDERED*
━━━━━━━━━━━━━━━━━━━━
▸ $${amount.toLocaleString()} dirty → $${clean.toLocaleString()} clean
▸ Fee ${(feeRate * 100).toFixed(1)}% (−$${fee.toLocaleString()})
${notes.join('\n')}`.trim();
}

/** Shell companies — C3+ */
export function toggleShell(p: Player): string {
  const err = requireRole(p, 'Businessman', 3);
  if (err) return err;
  const cs = ensureClass(p);
  cs.shellActive = !cs.shellActive;
  if (cs.shellActive) {
    const real = p.cash + p.bank;
    cs.decoyNetWorth = Math.floor(real * (0.25 + Math.random() * 0.35));
  }
  saveClass();
  return cs.shellActive
    ? `🏢 *SHELL ACTIVE*
━━━━━━━━━━━━━━━━━━━━
Robbers see decoy net worth ≈ $${cs.decoyNetWorth.toLocaleString()}
Real wealth is hidden.`
    : `🏢 Shell companies dissolved.
True net worth visible again.`;
}

/** Hostile takeover — C5+ */
export function hostileTakeover(p: Player, targetRaw: string): string {
  const err = requireRole(p, 'Businessman', 5);
  if (err) return err;
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const target = getPlayer(tid);
  if (!target) return '❌ Target never joined.';
  if (target.id === p.id) return '❌ Cannot take over yourself.';
  if (!target.businesses || target.businesses.length === 0) {
    return '❌ Target owns no businesses.';
  }
  // pick their most expensive-looking business (last in list as proxy)
  const bizId = target.businesses[target.businesses.length - 1];
  // cost = 2x a rough value
  const cost = Math.floor(80_000 + target.level * 12_000 + p.classLevel * 25_000);
  if (p.cash < cost) return `❌ Need $${cost.toLocaleString()} (2× value).`;
  p.cash -= cost;
  target.businesses = target.businesses.filter(b => b !== bizId);
  if (!p.businesses) p.businesses = [];
  p.businesses.push(bizId);
  const notes = addClassXp(p, 80, 'takeover');
  savePlayer(p);
  savePlayer(target);
  return `🏢 *HOSTILE TAKEOVER*
━━━━━━━━━━━━━━━━━━━━
▸ Seized business \`${bizId}\` from ...${target.id.slice(-6)}
▸ Paid $${cost.toLocaleString()}
${notes.join('\n')}`.trim();
}

/** Board meeting — every 48h */
export function boardMeeting(p: Player, directive?: string): string {
  const err = requireRole(p, 'Businessman');
  if (err) return err;
  const cs = ensureClass(p);
  const cd = 48 * 3_600_000;
  if (now() - cs.lastBoardMeeting < cd && !directive) {
    const left = Math.ceil((cd - (now() - cs.lastBoardMeeting)) / 3_600_000);
    return `📋 Next board meeting in ~${left}h.\nCurrent directive: ${cs.boardDirective || 'none'}`;
  }
  if (!directive) {
    return `📋 *BOARD MEETING*
━━━━━━━━━━━━━━━━━━━━
Choose a directive:

▸ .board cut — more profit, less heat
▸ .board expand — growth, more heat
▸ .board underground — illegal bonus income

Cooldown every 48h.`;
  }
  const d = directive.toLowerCase();
  if (!['cut', 'expand', 'underground'].includes(d)) {
    return '❌ Directives: cut | expand | underground';
  }
  cs.lastBoardMeeting = now();
  cs.boardDirective = d as any;
  saveClass();
  const desc =
    d === 'cut' ? 'Costs down. Profit up. Heat stable.'
    : d === 'expand' ? 'Expansion mode. Income ↑, heat ↑.'
    : 'Going dark. Illegal income bonus active.';
  return `📋 *DIRECTIVE SET: ${d.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
${desc}`;
}

/** Loan sharking — C7+ */
export function lendMoney(p: Player, targetRaw: string, amount: number, interestPct = 20): string {
  const err = requireRole(p, 'Businessman', 7);
  if (err) return err;
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const target = getPlayer(tid);
  if (!target) return '❌ Target never joined.';
  if (target.id === p.id) return '❌ Cannot lend to yourself.';
  if (!amount || amount < 5000) return 'Usage: .lend <@/num> <amount> [interest%]';
  if (p.cash < amount) return `❌ Need $${amount.toLocaleString()}`;
  const interest = Math.min(50, Math.max(5, interestPct));
  const due = now() + 72 * 3_600_000;
  p.cash -= amount;
  target.cash += amount;
  const cs = ensureClass(p);
  cs.loansGiven.push({ to: target.id, amount, interest, due });
  const tcs = ensureClass(target);
  tcs.loansTaken.push({ from: p.id, amount, interest, due });
  savePlayer(p);
  savePlayer(target);
  saveClass();
  return `💰 *LOAN ISSUED*
━━━━━━━━━━━━━━━━━━━━
▸ $${amount.toLocaleString()} → ...${target.id.slice(-6)}
▸ Interest ${interest}% · Due in 72h
▸ Collect: .collectloan <@/num>`;
}

export function collectLoan(p: Player, targetRaw: string): string {
  const err = requireRole(p, 'Businessman', 7);
  if (err) return err;
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const cs = ensureClass(p);
  const loan = cs.loansGiven.find(l => l.to === tid);
  if (!loan) return '❌ No active loan to that player.';
  const target = getPlayer(tid);
  if (!target) return '❌ Target gone.';
  const owed = Math.floor(loan.amount * (1 + loan.interest / 100));
  if (now() < loan.due && target.cash >= owed) {
    // voluntary early
  }
  if (target.cash < owed) {
    return `❌ They only have $${target.cash.toLocaleString()}. Owed $${owed.toLocaleString()}.\nHire collection or wait.`;
  }
  target.cash -= owed;
  p.cash += owed;
  cs.loansGiven = cs.loansGiven.filter(l => l !== loan);
  const tcs = ensureClass(target);
  tcs.loansTaken = tcs.loansTaken.filter(l => l.from !== p.id || l.amount !== loan.amount);
  const notes = addClassXp(p, 40, 'loan');
  savePlayer(p);
  savePlayer(target);
  saveClass();
  return `💰 *LOAN COLLECTED*
━━━━━━━━━━━━━━━━━━━━
▸ +$${owed.toLocaleString()} (principal + interest)
${notes.join('\n')}`.trim();
}

/** Market manipulation — C10, uses business funds, no personal heat */
export function marketManipulate(p: Player, symbol: string, side: string, amount: number): string {
  const err = requireRole(p, 'Businessman', 10);
  if (err) return err;
  if (!symbol || !['buy', 'sell'].includes((side || '').toLowerCase()) || !amount) {
    return 'Usage: .manipulate <SYM> buy|sell <amt>\nUses business capital. No personal heat.';
  }
  // light wrapper — real impact happens in crypto via a flag; here we just grant class xp and note
  const cost = Math.floor(amount * 50); // abstract capital
  if (p.cash < cost) return `❌ Need ~$${cost.toLocaleString()} capital.`;
  p.cash -= Math.floor(cost * 0.3); // partial
  const notes = addClassXp(p, 60, 'manipulate');
  savePlayer(p);
  return `📉 *MARKET MANIPULATION*
━━━━━━━━━━━━━━━━━━━━
▸ ${side.toUpperCase()} pressure on ${symbol.toUpperCase()}
▸ Business capital deployed (no personal heat)
${notes.join('\n')}
.crypto ${symbol.toUpperCase()} to watch the move.`.trim();
}

/** Political connections — C8+ passive heat reduction (applied in city tick) */
export function politicalStatus(p: Player): string {
  const err = requireRole(p, 'Businessman', 8);
  if (err) return err;
  return `🏛️ *POLITICAL CONNECTIONS*
━━━━━━━━━━━━━━━━━━━━
▸ Active at Class 8+
▸ City heat on you reduced ~20%
▸ The city works for you.`;
}

// ═══════════════════════════════════════════════════════════════
// MAFIA
// ═══════════════════════════════════════════════════════════════

const CREW_TIERS = {
  grunt: { cost: 15000, upkeep: 800, power: 4 },
  enforcer: { cost: 45000, upkeep: 2200, power: 10 },
  capo: { cost: 120000, upkeep: 5500, power: 22 }
} as const;

export function formatCrew(p: Player): string {
  const err = requireRole(p, 'Mafia');
  if (err) return err;
  const cs = ensureClass(p);
  const lines = cs.crew.map((c, i) => `${i + 1}. ${c.tier} — ${c.name} (upkeep $${c.upkeep}/day)`);
  const power = cs.crew.reduce((s, c) => s + CREW_TIERS[c.tier].power, 0);
  return `🕴️ *CREW*
━━━━━━━━━━━━━━━━━━━━
${lines.length ? lines.join('\n') : 'No soldiers yet.'}
Power +${power}

▸ .recruit grunt|enforcer|capo
▸ .crew pay — daily upkeep
Class 3: grunt · 7: capo`;
}

export function recruitCrew(p: Player, tierRaw: string): string {
  const tier = (tierRaw || '').toLowerCase() as keyof typeof CREW_TIERS;
  if (!CREW_TIERS[tier]) return 'Usage: .recruit grunt|enforcer|capo';
  const minC = tier === 'grunt' ? 3 : tier === 'enforcer' ? 5 : 7;
  const err = requireRole(p, 'Mafia', minC);
  if (err) return err;
  const cs = ensureClass(p);
  if (cs.crew.length >= 6) return '❌ Crew full (max 6).';
  const def = CREW_TIERS[tier];
  if (p.cash < def.cost) return `❌ Need $${def.cost.toLocaleString()}`;
  p.cash -= def.cost;
  const names = ['Vinny', 'Rico', 'Sal', 'Tony', 'Luca', 'Marco', 'Nico', 'Pauly'];
  const name = names[Math.floor(Math.random() * names.length)];
  cs.crew.push({ tier, name, upkeep: def.upkeep });
  const notes = addClassXp(p, 25, 'recruit');
  savePlayer(p);
  saveClass();
  return `🕴️ *RECRUITED*
━━━━━━━━━━━━━━━━━━━━
▸ ${tier} *${name}* joined the crew
▸ −$${def.cost.toLocaleString()}
${notes.join('\n')}`.trim();
}

export function payCrewUpkeep(p: Player): string {
  const err = requireRole(p, 'Mafia');
  if (err) return err;
  const cs = ensureClass(p);
  if (!cs.crew.length) return 'No crew to pay.';
  const total = cs.crew.reduce((s, c) => s + c.upkeep, 0);
  if (p.cash < total) {
    // desertion risk
    const lost = cs.crew.pop();
    saveClass();
    return `💀 Couldn't cover upkeep ($${total.toLocaleString()}).\n${lost?.name} deserted.`;
  }
  p.cash -= total;
  cs.lastUpkeep = now();
  savePlayer(p);
  saveClass();
  return `💵 Crew paid $${total.toLocaleString()}. Loyalty holds.`;
}

/** Protection racket — C3+ */
export function startProtection(p: Player, targetRaw: string, weekly: number): string {
  const err = requireRole(p, 'Mafia', 3);
  if (err) return err;
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const target = getPlayer(tid);
  if (!target) return '❌ Target never joined.';
  if (target.id === p.id) return '❌ No.';
  weekly = Math.max(2000, Math.min(50000, weekly || 5000));
  const cs = ensureClass(p);
  if (cs.protectionTargets.some(t => t.id === tid)) return '❌ Already on the books.';
  cs.protectionTargets.push({ id: tid, weekly, lastPaid: 0 });
  saveClass();
  return `🕶️ *PROTECTION RACKET*
━━━━━━━━━━━━━━━━━━━━
▸ ...${tid.slice(-6)} marked for $${weekly.toLocaleString()}/week
▸ They pay with .paytribute @you
▸ Refuse → you may .raid freely`;
}

export function payTribute(p: Player, mafiaRaw: string): string {
  const mid = String(mafiaRaw || '').replace(/[^0-9]/g, '');
  const mafia = getPlayer(mid);
  if (!mafia || mafia.role !== 'Mafia') return '❌ Not a Mafia operator.';
  const cs = ensureClass(mafia);
  const entry = cs.protectionTargets.find(t => t.id === p.id);
  if (!entry) return '❌ You are not on their protection list.';
  if (p.cash < entry.weekly) return `❌ Need $${entry.weekly.toLocaleString()}`;
  p.cash -= entry.weekly;
  mafia.cash += entry.weekly;
  entry.lastPaid = now();
  savePlayer(p);
  savePlayer(mafia);
  saveClass();
  return `💵 Tribute $${entry.weekly.toLocaleString()} paid to ...${mid.slice(-6)}.`;
}

/** Intimidation — C5+ */
export function intimidatePlayer(p: Player, targetRaw: string): string {
  const err = requireRole(p, 'Mafia', 5);
  if (err) return err;
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  const target = getPlayer(tid);
  if (!target) return '❌ Target never joined.';
  const cs = ensureClass(p);
  cs.intimidate = cs.intimidate.filter(i => i.until > now());
  if (cs.intimidate.some(i => i.id === tid)) return '❌ Already intimidated.';
  cs.intimidate.push({ id: tid, until: now() + 24 * 3_600_000, paid: false });
  saveClass();
  return `😨 *INTIMIDATION*
━━━━━━━━━━━━━━━━━━━━
▸ ...${tid.slice(-6)} marked
▸ 24h to pay tribute or face a free rob (no cooldown)`;
}

/** Territory claim / tax — C5+ */
export function claimTerritory(p: Player, zone: string): string {
  const err = requireRole(p, 'Mafia', 5);
  if (err) return err;
  const z = (zone || '').toLowerCase().slice(0, 20);
  if (!z) return 'Usage: .territory claim <zone name>';
  const cs = ensureClass(p);
  if (cs.territories.includes(z)) return '❌ Already yours.';
  if (cs.territories.length >= 3) return '❌ Max 3 territories.';
  // check others
  for (const pl of getAllPlayers()) {
    if (pl.id === p.id) continue;
    const o = ensureClass(pl);
    if (o.territories.includes(z)) return `❌ Controlled by ...${pl.id.slice(-6)}`;
  }
  cs.territories.push(z);
  const notes = addClassXp(p, 50, 'territory');
  saveClass();
  return `🗺️ *TERRITORY CLAIMED*
━━━━━━━━━━━━━━━━━━━━
▸ Zone: *${z}*
▸ Crimes here pay you tax
${notes.join('\n')}`.trim();
}

export function listTerritory(p: Player): string {
  const err = requireRole(p, 'Mafia');
  if (err) return err;
  const cs = ensureClass(p);
  return `🗺️ *YOUR TERRITORY*
━━━━━━━━━━━━━━━━━━━━
${cs.territories.length ? cs.territories.map(t => `▸ ${t}`).join('\n') : 'None claimed.'}
.territory claim <zone>`;
}

/** Blood debt — C7+ auto revenge flag */
export function flagBloodDebt(victim: Player, attackerId: string) {
  if (victim.role !== 'Mafia' || victim.classLevel < 7) return;
  const cs = ensureClass(victim);
  cs.bloodDebt = cs.bloodDebt.filter(b => b.until > now());
  if (!cs.bloodDebt.some(b => b.id === attackerId)) {
    cs.bloodDebt.push({ id: attackerId, until: now() + 72 * 3_600_000 });
    saveClass();
  }
}

export function formatBloodDebt(p: Player): string {
  const err = requireRole(p, 'Mafia', 7);
  if (err) return err;
  const cs = ensureClass(p);
  cs.bloodDebt = cs.bloodDebt.filter(b => b.until > now());
  saveClass();
  if (!cs.bloodDebt.length) return '🩸 No active blood debts.';
  return `🩸 *BLOOD DEBT*
━━━━━━━━━━━━━━━━━━━━
${cs.bloodDebt.map(b => `▸ ...${b.id.slice(-6)} (${ago(b.until - 72 * 3_600_000)} left)`).join('\n')}
Crew hunts them automatically.`;
}

// ═══════════════════════════════════════════════════════════════
// HITMAN
// ═══════════════════════════════════════════════════════════════

type Contract = {
  id: string;
  targetName: string;
  targetId?: string; // player id if PvP
  difficulty: number;
  payout: number;
  expires: number;
  tier?: 'street' | 'pro' | 'legend';
};

function getContractBoard(): Contract[] {
  const db = getDb() as any;
  const list = Array.isArray(db.contracts) ? (db.contracts as Contract[]) : [];
  // Drop expired
  const live = list.filter(c => c && c.expires > now());
  // BUGFIX: empty board never refreshed before (contracts[0] was undefined)
  const needsRefresh = live.length < 6;

  if (needsRefresh) {
    const tiers: Array<{ tier: 'street' | 'pro' | 'legend'; names: string[]; diff: number; pay: number }> = [
      {
        tier: 'street',
        names: [
          'The Accountant', 'Dock Runner', 'Street Snitch', 'Corner Dealer', 'Fence', 'Lookout',
          'Taxi Driver', 'Club Bouncer', 'Pawn Broker', 'Courier Kid', 'Warehouse Guard', 'Bookie Runner'
        ],
        diff: 24,
        pay: 14000
      },
      {
        tier: 'pro',
        names: [
          'Corrupt Judge', 'Rival Capo', 'Cartel Courier', 'Union Boss', 'Casino Pit Boss', 'Arms Broker',
          'Port Inspector', 'Night Mayor', 'Bank Manager', 'Evidence Clerk', 'Private Security Lead', 'Smuggler Captain'
        ],
        diff: 44,
        pay: 42000
      },
      {
        tier: 'legend',
        names: [
          'City Councilman', 'Ghost Broker', 'Syndicate Defector', 'Police Captain', 'Oligarch', 'Shadow Minister',
          'Federal Liaison', 'Harbor Kingpin', 'Casino Owner', 'Intelligence Leak', 'Crime Family Underboss', 'Media Mogul'
        ],
        diff: 68,
        pay: 110000
      }
    ];
    const fresh: Contract[] = [];
    let n = 1;
    // keep any still-live contracts first
    for (const c of live) {
      fresh.push({ ...c, id: `c${n++}` });
    }
    // fill to ~15 contracts across tiers
    for (const tier of tiers) {
      const shuffled = [...tier.names].sort(() => Math.random() - 0.5);
      for (const name of shuffled) {
        if (fresh.length >= 15) break;
        // avoid duplicate names on board
        if (fresh.some(x => x.targetName === name)) continue;
        fresh.push({
          id: `c${n++}`,
          targetName: name,
          difficulty: tier.diff + Math.floor(Math.random() * 12),
          payout: Math.floor(tier.pay * (0.85 + Math.random() * 0.45)),
          expires: now() + 8 * 3_600_000,
          tier: tier.tier
        });
      }
    }
    // renumber cleanly
    fresh.forEach((c, i) => { c.id = `c${i + 1}`; });
    db.contracts = fresh;
    saveDb();
    return fresh;
  }

  // ensure ids stable
  db.contracts = live;
  return live;
}

export function formatContracts(p: Player): string {
  // Class 1+ Hitman can view board (was locked to class 2 and empty boards stuck)
  const err = requireRole(p, 'Hitman', 1);
  if (err) return err;
  const board = getContractBoard();
  if (!board.length) {
    return `🎯 *CONTRACT BOARD*
━━━━━━━━━━━━━━━━━━━━
No live contracts — refreshing...
Try .contracts again.`;
  }

  let out = `🎯 *CONTRACT BOARD*
━━━━━━━━━━━━━━━━━━━━
${board.length} jobs · expires in up to 8h
NPC marks · player purses → .bounties

`;
  const groups: Record<string, Contract[]> = { street: [], pro: [], legend: [] };
  for (const c of board) {
    const k = c.tier || 'street';
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }
  const labels: Record<string, string> = {
    street: '🟩 STREET',
    pro: '🟧 PRO',
    legend: '🟥 LEGEND'
  };
  for (const key of ['street', 'pro', 'legend']) {
    const arr = groups[key] || [];
    if (!arr.length) continue;
    out += `*${labels[key]}*\n`;
    for (const c of arr) {
      out += `▸ *${c.id}*  ${c.targetName}\n`;
      out += `    💰 $${c.payout.toLocaleString()}  ·  diff ${c.difficulty}\n`;
    }
    out += `\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.contract c1     — accept
.complete c1     — finish job
.bounty @user 50k · .bounties`;
  return out;
}

function findContract(board: Contract[], id: string): Contract | undefined {
  const raw = (id || '').trim().toLowerCase();
  if (!raw) return undefined;
  // accept c1, C1, 1, #1
  const normalized = raw.replace(/^#/, '');
  return board.find(x => {
    const cid = String(x.id).toLowerCase();
    return cid === normalized || cid === `c${normalized}` || cid.replace(/^c/, '') === normalized;
  });
}

export function acceptContract(p: Player, id: string): string {
  const err = requireRole(p, 'Hitman', 1);
  if (err) return err;
  const board = getContractBoard();
  const c = findContract(board, id);
  if (!c) return '❌ Unknown contract id. Use .contracts to see the board.';
  const cs = ensureClass(p);
  if (cs.contractsTaken.includes(c.id)) return '❌ Already accepted.';
  cs.contractsTaken.push(c.id);
  saveClass();
  return `🎯 Contract *${c.id}* accepted.\nTarget: ${c.targetName}\n.complete ${c.id} when ready.`;
}

export function completeContract(p: Player, id: string): string {
  const err = requireRole(p, 'Hitman', 1);
  if (err) return err;
  const board = getContractBoard();
  const c = findContract(board, id);
  if (!c) return '❌ Unknown contract. Use .contracts to see the board.';
  const cs = ensureClass(p);
  if (!cs.contractsTaken.includes(c.id)) return '❌ Accept it first.';
  // success roll
  const power = p.stealth + p.luck + p.classLevel * 4 + cs.signatureKills * 2;
  const roll = Math.random() * 100 + power * 0.6;
  cs.contractsTaken = cs.contractsTaken.filter(x => x !== c.id);
  if (roll < c.difficulty) {
    p.heat = Math.min(100, p.heat + 15);
    p.wanted = Math.min(100, p.wanted + 10);
    cs.evidence += 2;
    savePlayer(p);
    saveClass();
    return `💀 *CONTRACT FAILED*
━━━━━━━━━━━━━━━━━━━━
Target escaped. Heat +15 · Evidence +2`;
  }
  // success
  let payout = c.payout;
  if (cs.hitList.includes(c.targetId || '')) payout = Math.floor(payout * 2);
  payout = Math.floor(payout * (1 + cs.signatureKills * 0.03));
  p.cash += payout;
  cs.signatureKills += 1;
  cs.evidence += 1;
  p.heat = Math.min(100, p.heat + 8);
  const notes = addClassXp(p, 50 + Math.floor(payout / 2000), 'contract');
  // remove from board
  const db = getDb() as any;
  db.contracts = board.filter(x => x.id !== c.id);
  savePlayer(p);
  saveClass();
  return `🎯 *CONTRACT COMPLETE*
━━━━━━━━━━━━━━━━━━━━
▸ ${c.targetName} eliminated
▸ +$${payout.toLocaleString()}
▸ Signature kills: ${cs.signatureKills}
${notes.join('\n')}`.trim();
}

/** Ghost Protocol — C4+, 4h CD, 2h invisible */
export function ghostProtocol(p: Player): string {
  const err = requireRole(p, 'Hitman', 4);
  if (err) return err;
  const cs = ensureClass(p);
  if (now() - cs.lastGhost < 4 * 3_600_000) {
    const left = Math.ceil((4 * 3_600_000 - (now() - cs.lastGhost)) / 3_600_000);
    return `👻 Ghost on cooldown (~${left}h left).`;
  }
  cs.lastGhost = now();
  cs.ghostUntil = now() + 2 * 3_600_000;
  saveClass();
  return `👻 *GHOST PROTOCOL*
━━━━━━━━━━━━━━━━━━━━
▸ Invisible on leaderboards & target lists for 2h
▸ No new contracts can be placed on you`;
}

export function isGhosted(p: Player): boolean {
  const cs = ensureClass(p);
  return cs.ghostUntil > now();
}

/** Destroy evidence — C4+ */
export function destroyEvidence(p: Player): string {
  const err = requireRole(p, 'Hitman', 4);
  if (err) return err;
  const cs = ensureClass(p);
  if (cs.evidence <= 0 && p.heat <= 0) return 'No evidence / heat to clear.';
  if (now() - cs.lastEvidenceClear < 30 * 60_000) return '❌ Evidence sweep on 30m cooldown.';
  const cleared = Math.min(25, p.heat);
  p.heat = Math.max(0, p.heat - cleared);
  cs.evidence = Math.max(0, cs.evidence - 3);
  cs.lastEvidenceClear = now();
  savePlayer(p);
  saveClass();
  return `🧹 *EVIDENCE DESTROYED*
━━━━━━━━━━━━━━━━━━━━
▸ Heat −${cleared} → ${p.heat}
▸ Traces wiped`;
}

/** Stalking — Hitman, no class gate (pairs with .hit) */
export function stalkPlayer(p: Player, targetRaw: string): string {
  const err = requireRole(p, 'Hitman', 1);
  if (err) return err;
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  const target = resolved.player;
  const tid = target.id;
  if (isGhosted(target)) return '❌ Target is under Ghost Protocol.';
  const cs = ensureClass(p);
  cs.stalkTarget = tid;
  saveClass();
  const approxCash = Math.floor(target.cash * (0.7 + Math.random() * 0.5));
  return `👁️ *STALKING*
━━━━━━━━━━━━━━━━━━━━
▸ Target: ${target.name || '...' + tid.slice(-6)}
▸ Last active: ${ago(target.lastActive || now())}
▸ Approx cash: ~$${approxCash.toLocaleString()}
▸ Heat: ${target.heat} · Wanted: ${target.wanted || 0}
▸ Role: ${target.role}
━━━━━━━━━━━━━━━━━━━━
.hit <@> when the window is open`;
}

/** The List — C8+, max 3 */
export function manageHitList(p: Player, action: string, targetRaw?: string): string {
  const err = requireRole(p, 'Hitman', 8);
  if (err) return err;
  const cs = ensureClass(p);
  if (action === 'list' || !action) {
    return `📋 *THE LIST*
━━━━━━━━━━━━━━━━━━━━
${cs.hitList.length ? cs.hitList.map((id, i) => `${i + 1}. ...${id.slice(-6)}`).join('\n') : 'Empty.'}
.list add <@/num>  ·  .list remove <@/num>
Hits on listed targets pay 2×.`;
  }
  const tid = String(targetRaw || '').replace(/[^0-9]/g, '');
  if (action === 'add') {
    if (!tid) return 'Usage: .list add <@/num>';
    if (cs.hitList.length >= 3) return '❌ List full (max 3).';
    if (cs.hitList.includes(tid)) return '❌ Already listed.';
    cs.hitList.push(tid);
    saveClass();
    return `📋 Added ...${tid.slice(-6)} to The List.`;
  }
  if (action === 'remove') {
    cs.hitList = cs.hitList.filter(x => x !== tid);
    saveClass();
    return `📋 Removed from The List.`;
  }
  return 'Usage: .list | .list add|remove <@/num>';
}

/** Double cross — C6+ */
export function doubleCross(p: Player, clientRaw: string): string {
  const err = requireRole(p, 'Hitman', 6);
  if (err) return err;
  const tid = String(clientRaw || '').replace(/[^0-9]/g, '');
  const client = getPlayer(tid);
  if (!client) return '❌ Unknown client.';
  const cs = ensureClass(p);
  if (cs.doubleCrossed.includes(tid)) return '❌ Bridge already burned.';
  const payout = Math.floor(25000 + p.classLevel * 8000 + Math.random() * 15000);
  p.cash += payout;
  cs.doubleCrossed.push(tid);
  p.heat = Math.min(100, p.heat + 12);
  const notes = addClassXp(p, 45, 'doublecross');
  savePlayer(p);
  saveClass();
  return `🗡️ *DOUBLE CROSS*
━━━━━━━━━━━━━━━━━━━━
▸ Betrayed ...${tid.slice(-6)}
▸ +$${payout.toLocaleString()} (3× rate)
▸ Bridge burned permanently
${notes.join('\n')}`.trim();
}

/** Silent government contracts — C10 · 2h cooldown · not spammable */
export function silentContract(p: Player): string {
  const err = requireRole(p, 'Hitman', 10);
  if (err) return err;
  const cs = ensureClass(p);
  const CD = 2 * 3_600_000;
  const last = (cs as any).lastSilent || 0;
  if (now() - last < CD) {
    const left = ((CD - (now() - last)) / 3_600_000).toFixed(1);
    return `⏳ Silent contract cooldown: *${left}h* left (2h).`;
  }
  (cs as any).lastSilent = now();
  saveClass();

  const payout = Math.floor(180000 + Math.random() * 120000);
  const success = Math.random() < 0.55 + p.stealth * 0.02;
  if (!success) {
    p.wanted = Math.min(100, p.wanted + 40);
    p.heat = Math.min(100, p.heat + 30);
    const db = getDb() as any;
    if (!db.manhunts) db.manhunts = {};
    db.manhunts[p.id] = now() + 24 * 3_600_000;
    savePlayer(p);
    saveDb();
    return `🚨 *SILENT CONTRACT FAILED*
━━━━━━━━━━━━━━━━━━━━
▸ Manhunt active 24h — any player can hit you for bounty
▸ Heat +30 · Wanted +40
⏳ Next .silent in 2h`;
  }
  p.cash += payout;
  const notes = addClassXp(p, 100, 'silent');
  savePlayer(p);
  return `🤫 *SILENT CONTRACT*
━━━━━━━━━━━━━━━━━━━━
▸ Government job complete
▸ +$${payout.toLocaleString()}
⏳ Next .silent in 2h
${notes.join('\n')}`.trim();
}


export function isOnManhunt(id: string): boolean {
  const db = getDb() as any;
  return !!(db.manhunts && db.manhunts[id] && db.manhunts[id] > now());
}

// ═══════════════════════════════════════════════════════════════
// CLASS STATUS OVERVIEW
// ═══════════════════════════════════════════════════════════════

export function formatClassStatus(p: Player): string {
  if (p.role === 'Unassigned') return '❌ Choose a role first: .role';
  const cs = ensureClass(p);
  if (p.role === 'Businessman') {
    return `💼 *BUSINESSMAN STATUS*
━━━━━━━━━━━━━━━━━━━━
Class ${p.classLevel}/10
Dirty: $${cs.dirtyCash.toLocaleString()}
Shell: ${cs.shellActive ? 'ON' : 'off'}
Directive: ${cs.boardDirective || 'none'}
Loans out: ${cs.loansGiven.length}

C3 Shell · C5 Takeover · C7 Loans
C8 Politics · C10 Manipulate
.launder  .shell  .board  .lend  .takeover`;
  }
  if (p.role === 'Mafia') {
    return `🕴️ *MAFIA STATUS*
━━━━━━━━━━━━━━━━━━━━
Class ${p.classLevel}/10
Crew: ${cs.crew.length}/6
Protection: ${cs.protectionTargets.length}
Territories: ${cs.territories.length}
Blood debts: ${cs.bloodDebt.filter(b => b.until > now()).length}

C3 Racket/Crew · C5 Territory/Intimidate
C7 Capo/Blood · C10 Don's Cut
.crew  .recruit  .racket  .territory  .intimidate`;
  }
  // Hitman
  return `🎯 *HITMAN STATUS*
━━━━━━━━━━━━━━━━━━━━
Class ${p.classLevel}/10
Signature kills: ${cs.signatureKills}
Ghost: ${cs.ghostUntil > now() ? 'ACTIVE' : 'ready'}
The List: ${cs.hitList.length}/3
Evidence: ${cs.evidence}

C2 Contracts · C4 Ghost/Evidence
C6 Stalk/Double · C8 List · C10 Silent
.contracts  .ghost  .evidence  .stalk  .list`;
}
