/**
 * Daily role contracts, player bounties, onboarding quest.
 */
import { Player, savePlayer, addXp, addClassXp, resolveExistingPlayerId, getAllPlayers } from './player.js';
import { getDb, saveDb } from '../db/database.js';
import { isPremium } from './shop.js';
import { damageHeart, hospitalBlock } from './health.js';
import { BUSINESS_CATALOG } from './businesses.js';

function now() { return Date.now(); }
function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

// ─── Daily role contracts ─────────────────────────────────────

type DailyJob = {
  id: string;
  role: 'Businessman' | 'Mafia' | 'Hitman' | 'Any';
  title: string;
  desc: string;
  target: number;
  reward: number;
  xp: number;
};

const DAILY_POOL: DailyJob[] = [
  { id: 'biz-collect', role: 'Businessman', title: 'Collect rents', desc: 'Run .collect once', target: 1, reward: 8000, xp: 40 },
  { id: 'biz-buy', role: 'Businessman', title: 'Expand', desc: 'Buy any business', target: 1, reward: 12000, xp: 60 },
  { id: 'mafia-rob', role: 'Mafia', title: 'Street tax', desc: 'Land 1 successful .rob', target: 1, reward: 10000, xp: 50 },
  { id: 'mafia-raid', role: 'Mafia', title: 'Shake a front', desc: 'Attempt .raid once', target: 1, reward: 9000, xp: 45 },
  { id: 'hit-contract', role: 'Hitman', title: 'Board work', desc: 'Complete 1 NPC contract', target: 1, reward: 14000, xp: 70 },
  { id: 'hit-bounty', role: 'Hitman', title: 'Open season', desc: 'Complete 1 player bounty', target: 1, reward: 18000, xp: 80 },
  { id: 'any-crime', role: 'Any', title: 'Street job', desc: 'Finish any .crime once', target: 1, reward: 6000, xp: 35 },
  { id: 'any-daily', role: 'Any', title: 'Show face', desc: 'Claim .daily', target: 1, reward: 4000, xp: 25 }
];

function pickDailyJobs(role: string): DailyJob[] {
  const pool = DAILY_POOL.filter(j => j.role === role || j.role === 'Any');
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function getDailyState(p: Player): { day: string; jobs: DailyJob[]; progress: Record<string, number>; claimed: string[] } {
  const db = getDb() as any;
  if (!db.dailyJobs) db.dailyJobs = {};
  const today = dayKey();
  let st = db.dailyJobs[p.id];
  if (!st || st.day !== today) {
    st = { day: today, jobs: pickDailyJobs(p.role || 'Any'), progress: {}, claimed: [] };
    db.dailyJobs[p.id] = st;
    saveDb();
  }
  return st;
}

export function formatDailyContracts(p: Player): string {
  if (p.role === 'Unassigned') return '❌ Pick a role first: .role';
  const st = getDailyState(p);
  let out = `📋 *DAILY CONTRACTS* · ${st.day}
━━━━━━━━━━━━━━━━━━━━
`;
  st.jobs.forEach((j, i) => {
    const prog = st.progress[j.id] || 0;
    const done = prog >= j.target;
    const claimed = st.claimed.includes(j.id);
    const mark = claimed ? '✅' : done ? '💰' : '·';
    out += `${mark} *d${i + 1}* ${j.title}\n   ${j.desc}\n   $${j.reward.toLocaleString()} · ${prog}/${j.target}\n`;
  });
  out += `━━━━━━━━━━━━━━━━━━━━
.dclaim d1  ·  progress auto-tracks
Resets UTC midnight`;
  return out;
}

/** Call from gameplay hooks: kind = collect|buybiz|rob|raid|contract|bounty|crime|daily */
export function trackDailyProgress(p: Player, kind: string, amount = 1) {
  if (p.role === 'Unassigned') return;
  const st = getDailyState(p);
  const map: Record<string, string[]> = {
    collect: ['biz-collect'],
    buybiz: ['biz-buy'],
    rob: ['mafia-rob'],
    raid: ['mafia-raid'],
    contract: ['hit-contract'],
    bounty: ['hit-bounty'],
    crime: ['any-crime'],
    daily: ['any-daily']
  };
  const ids = map[kind] || [];
  let changed = false;
  for (const j of st.jobs) {
    if (!ids.includes(j.id)) continue;
    st.progress[j.id] = (st.progress[j.id] || 0) + amount;
    changed = true;
  }
  if (changed) saveDb();
}

export function claimDailyJob(p: Player, raw: string): string {
  const st = getDailyState(p);
  const q = (raw || '').trim().toLowerCase();
  let job: DailyJob | undefined;
  const m = q.match(/^d(\d+)$/);
  if (m) {
    const i = parseInt(m[1], 10) - 1;
    job = st.jobs[i];
  } else {
    job = st.jobs.find(j => j.id === q);
  }
  if (!job) return '❌ Unknown job. .dailies';
  if (st.claimed.includes(job.id)) return '✅ Already claimed.';
  const prog = st.progress[job.id] || 0;
  if (prog < job.target) return `❌ Progress ${prog}/${job.target} — keep going.`;
  st.claimed.push(job.id);
  p.cash += job.reward;
  const notes = addXp(p, job.xp);
  if (p.role !== 'Unassigned') notes.push(...addClassXp(p, Math.floor(job.xp / 2), 'daily-job'));
  savePlayer(p);
  saveDb();
  return `📋 *CONTRACT PAID*
━━━━━━━━━━━━━━━━━━━━
${job.title}
💰 +$${job.reward.toLocaleString()}
${notes.join('\n')}`;
}

// ─── Player bounties ──────────────────────────────────────────

type Bounty = {
  id: string;
  placerId: string;
  placerName: string;
  targetId: string;
  targetName: string;
  amount: number;
  created: number;
  expires: number;
  claimedBy?: string;
};

function getBounties(): Bounty[] {
  const db = getDb() as any;
  if (!db.bounties) db.bounties = [];
  const t = now();
  db.bounties = (db.bounties as Bounty[]).filter(b => b.expires > t && !b.claimedBy);
  return db.bounties;
}

export function placeBounty(p: Player, targetRaw: string, amountRaw: string): string {
  const amount = parseInt(String(amountRaw).replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 25000) return '❌ Min bounty $25,000\nUsage: .bounty <@/num> <amount>';
  if (p.cash < amount) return `❌ Need $${amount.toLocaleString()} cash`;
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === p.id) return '❌ Cannot bounty yourself.';
  const target = resolved.player;
  if (target.banned) return '❌ Target banned.';
  if (isPremium(target) && (target as any).ghostUntil > now()) {
    // ghost protocol style — still allow bounty but note
  }
  const board = getBounties();
  if (board.some(b => b.targetId === target.id && b.placerId === p.id)) {
    return '❌ You already have an open bounty on them.';
  }
  p.cash -= amount;
  const id = `p${board.length + 1}_${String(now()).slice(-4)}`;
  const shortId = `p${(board.length % 50) + 1}`;
  const b: Bounty = {
    id: shortId,
    placerId: p.id,
    placerName: p.name || p.id.slice(-4),
    targetId: target.id,
    targetName: target.name || target.id.slice(-4),
    amount,
    created: now(),
    expires: now() + 24 * 3_600_000
  };
  // unique short id
  b.id = shortId;
  while (board.some(x => x.id === b.id)) b.id = `p${Math.floor(Math.random() * 90) + 10}`;
  board.push(b);
  const db = getDb() as any;
  db.bounties = board;
  savePlayer(p);
  saveDb();
  return `🎯 *BOUNTY POSTED*
━━━━━━━━━━━━━━━━━━━━
Target: *${b.targetName}*
Purse: $${amount.toLocaleString()}
Id: \`${b.id}\` · 24h
Hitmen: .bounties → .claim ${b.id}`;
}

export function formatBounties(p: Player): string {
  const board = getBounties().slice(0, 12);
  let out = `🎯 *PLAYER BOUNTIES*
━━━━━━━━━━━━━━━━━━━━
`;
  if (!board.length) {
    out += `No open contracts.\n.post with .bounty <@> <amt>\n`;
  } else {
    for (const b of board) {
      const hrs = Math.max(1, Math.ceil((b.expires - now()) / 3_600_000));
      out += `▸ *${b.id}*  ${b.targetName}\n   $${b.amount.toLocaleString()} · ${hrs}h left · by ${b.placerName}\n`;
    }
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.bounty <@/num> <amount>
.claim <id>  (Hitman) · min $25k`;
  return out;
}

export function claimBounty(p: Player, id: string): string {
  if (p.role !== 'Hitman') return '❌ Hitman only.';
  if (p.inPrison && Date.now() < p.prisonUntil) return '◆ In prison.';

  const CD = 2 * 3_600_000;
  const lastClaim = (p as any).lastBountyClaim || 0;
  if (Date.now() - lastClaim < CD) {
    const left = ((CD - (Date.now() - lastClaim)) / 3_600_000).toFixed(1);
    return `⏳ Bounty claim cooldown: *${left}h* (2h).`;
  }

  const board = getBounties();
  const q = (id || '').trim().toLowerCase();
  const b = board.find(x => x.id.toLowerCase() === q);
  if (!b) return '❌ Unknown bounty id. .bounties';
  if (b.targetId === p.id) return '❌ That bounty is on *you*.';
  if (b.placerId === p.id) return '❌ Cannot claim your *own* bounty. That was an exploit.';

  const target = resolveExistingPlayerId(b.targetId);
  if (!target.ok) {
    (p as any).lastBountyClaim = Date.now();
    p.cash += Math.floor(b.amount * 0.5);
    b.claimedBy = p.id;
    savePlayer(p);
    saveDb();
    return `🎯 Target vanished. Partial purse $${Math.floor(b.amount * 0.5).toLocaleString()}\n⏳ Claim CD 2h`;
  }
  const tplayer = target.player;
  const power = p.stealth + p.luck + p.classLevel * 4 + (p.level || 1);
  const def = tplayer.defense + tplayer.security + (tplayer.role === 'Businessman' ? 8 : 0) + Math.min(20, tplayer.heat * 0.15);
  const roll = Math.random() * 100 + power * 0.7;
  const need = 42 + def * 0.4;

  (p as any).lastBountyClaim = Date.now();

  if (roll < need) {
    p.heat = Math.min(100, p.heat + 18);
    p.wanted = Math.min(100, p.wanted + 12);
    if (Math.random() < 0.2) {
      p.inPrison = true;
      p.prisonUntil = now() + 12 * 60 * 1000;
    }
    savePlayer(p);
    return `💀 *BOUNTY FAILED*
━━━━━━━━━━━━━━━━━━━━
${b.targetName} slipped the net.
🔥 Heat +18
⏳ Next claim in 2h
${p.inPrison ? '◆ Arrested 12 min' : ''}`;
  }

  p.cash += b.amount;
  p.heat = Math.min(100, p.heat + 10);
  b.claimedBy = p.id;
  const notes = addClassXp(p, 40 + Math.floor(b.amount / 5000), 'bounty');
  notes.push(...addXp(p, 60 + Math.floor(b.amount / 3000)));
  trackDailyProgress(p, 'bounty');
  const dmg = damageHeart(tplayer, 'bounty claim');
  savePlayer(tplayer);

  const db2 = getDb() as any;
  if (db2.classState?.[p.id]) {
    db2.classState[p.id].signatureKills = (db2.classState[p.id].signatureKills || 0) + 1;
  }
  savePlayer(p);
  saveDb();
  return `🎯 *BOUNTY COMPLETE*
━━━━━━━━━━━━━━━━━━━━
Target: *${b.targetName}*
💰 +$${b.amount.toLocaleString()}
🔥 Heat +10
⏳ Next claim in 2h
${dmg.msg}
${notes.join('\n')}`;
}

// ─── Onboarding ───────────────────────────────────────────────

/**
 * Steps: 0 none → 1 named → 2 role → 3 first action (biz buy OR crime) → 4 collect/rob → done
 */
export function getOnboarding(p: Player): { step: number; done: boolean } {
  const o = (p as any).onboarding || { step: 0, done: false };
  return o;
}

export function formatOnboarding(p: Player): string {
  const o = getOnboarding(p);
  if (o.done) return '';
  const steps = [
    !p.usernameSet ? '① .set name YourName' : '① Name ✅',
    p.role === 'Unassigned' ? '② .role businessman|mafia|hitman' : `② Role ✅ (${p.role})`,
    !(p as any).onboardAction ? '③ .biz buy b1  *or*  .crime c1' : '③ First action ✅',
    !(p as any).onboardLoop ? '④ .collect  *or*  .rob <@>' : '④ Loop ✅'
  ];
  const bonus = o.step >= 4 || o.done ? '' : '\n🎁 Finish all → +$10,000 tutorial cash';
  return `🚀 *STARTER PATH*
━━━━━━━━━━━━━━━━━━━━
${steps.join('\n')}${bonus}
.quest  ·  tutorial cash on complete`;
}

export function touchOnboarding(p: Player, event: 'name' | 'role' | 'action' | 'loop'): string | null {
  if ((p as any).onboarding?.done) return null;
  const o = (p as any).onboarding || { step: 0, done: false };
  if (event === 'name' && p.usernameSet) o.step = Math.max(o.step, 1);
  if (event === 'role' && p.role !== 'Unassigned') o.step = Math.max(o.step, 2);
  if (event === 'action') {
    (p as any).onboardAction = true;
    o.step = Math.max(o.step, 3);
  }
  if (event === 'loop') {
    (p as any).onboardLoop = true;
    o.step = Math.max(o.step, 4);
  }
  (p as any).onboarding = o;
  if (o.step >= 4 && !o.done) {
    o.done = true;
    (p as any).onboarding = o;
    p.cash += 10000;
    savePlayer(p);
    return `🎉 *STARTER COMPLETE*
━━━━━━━━━━━━━━━━━━━━
Tutorial cash +$10,000
💰 Cash $${p.cash.toLocaleString()}
You're in. .menu · .dailies · .cd`;
  }
  savePlayer(p);
  return null;
}

export function netWorth(p: Player): number {
  let biz = 0;
  for (const id of p.businesses || []) {
    const b = BUSINESS_CATALOG.find(x => x.id === id);
    if (b) biz += b.cost;
  }
  return (p.cash || 0) + (p.bank || 0) + biz;
}

export function netWorthRank(p: Player): number {
  const all = getAllPlayers().filter(x => !x.banned && isRegisteredish(x));
  const sorted = all.map(x => ({ id: x.id, nw: netWorth(x) })).sort((a, b) => b.nw - a.nw);
  const i = sorted.findIndex(x => x.id === p.id);
  return i >= 0 ? i + 1 : all.length;
}

function isRegisteredish(p: Player): boolean {
  return !!(p.usernameSet || (p.name && p.name.length >= 3));
}
