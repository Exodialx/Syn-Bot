/**
 * Heist lobbies with timed stages:
 * recruit → prep (timer) → resolve
 */
import { Player, savePlayer, addXp, getOrCreatePlayer } from './player.js';
import { addCityHeat, crimeDifficultyMult, isLockdown } from './city.js';
import { getDb, saveDb } from '../db/database.js';

export type HeistDef = {
  id: string;
  name: string;
  minCrew: number;
  maxCrew: number;
  minClass: number;
  basePayout: number;
  difficulty: number;
  heat: number;
  prepSec: number; // preparation time before auto-resolve can start
};

/** Crew-only specials */
export const HEISTS: HeistDef[] = [
  { id: 'safe', name: 'Safe Heist', minCrew: 2, maxCrew: 4, minClass: 1, basePayout: 100000, difficulty: 32, heat: 8, prepSec: 40 },
  { id: 'risky', name: 'Risky Heist', minCrew: 2, maxCrew: 4, minClass: 1, basePayout: 300000, difficulty: 62, heat: 28, prepSec: 50 }
];

/** Classic jobs — SOLO only, extreme prison risk */
export type SoloHeistDef = {
  id: string;
  name: string;
  payout: number;
  difficulty: number;
  heat: number;
  jailChance: number;   // on fail / partial
  jailMinOnBust: number;
  cdMs: number;
};

export const SOLO_HEISTS: SoloHeistDef[] = [
  { id: 'sh', name: 'Store Heist', payout: 22000, difficulty: 42, heat: 14, jailChance: 0.42, jailMinOnBust: 12, cdMs: 10 * 60_000 },
  { id: 'jh', name: 'Jewelry Heist', payout: 65000, difficulty: 55, heat: 20, jailChance: 0.52, jailMinOnBust: 16, cdMs: 15 * 60_000 },
  { id: 'gmh', name: 'Gold Mine Heist', payout: 150000, difficulty: 68, heat: 28, jailChance: 0.62, jailMinOnBust: 22, cdMs: 20 * 60_000 },
  { id: 'dh', name: 'Diamond Heist', payout: 340000, difficulty: 78, heat: 36, jailChance: 0.72, jailMinOnBust: 28, cdMs: 30 * 60_000 },
  { id: 'bh', name: 'Bank Heist', payout: 750000, difficulty: 88, heat: 48, jailChance: 0.82, jailMinOnBust: 35, cdMs: 45 * 60_000 }
];

export function isSoloHeistId(id: string): boolean {
  return SOLO_HEISTS.some(h => h.id === id);
}


/** Shared 1h cooldown for safe + risky crew heists */
const CREW_SPECIAL_CD = 60 * 60 * 1000;

function specialHeistCdLeft(p: Player): number {
  const last = (p as any).lastSpecialHeist || 0;
  return Math.max(0, CREW_SPECIAL_CD - (Date.now() - last));
}

function markSpecialHeistCd(members: Player[]) {
  const t = Date.now();
  for (const m of members) {
    (m as any).lastSpecialHeist = t;
    savePlayer(m);
  }
}

type Stage = 'lobby' | 'prep' | 'done';

type Lobby = {
  id: string;
  heistId: string;
  leader: string;
  members: string[];
  stage: Stage;
  createdAt: number;
  prepStartedAt: number;
  prepReadyAt: number;
  prepBonus: number; // 0-15 from ready checks
};

function lobbies(): Lobby[] {
  const db = getDb() as any;
  if (!db.heistLobbies) db.heistLobbies = [];
  return db.heistLobbies as Lobby[];
}

function save() { saveDb(); }


/** Instant solo classic heist — high payout, extreme bust risk */
export function runSoloClassicHeist(p: Player, heistId: string): string {
  if (isLockdown()) return '🚨 Lockdown — heists frozen. .news';
  if (p.inPrison && Date.now() < p.prisonUntil) return '◆ In prison. .jail · .bail · .escape';

  const def = SOLO_HEISTS.find(h => h.id === heistId);
  if (!def) return '❌ Unknown solo heist. .heist';

  const now = Date.now();
  const key = `lastSolo_${def.id}`;
  const prev = (p as any)[key] || 0;
  if (now - prev < def.cdMs) {
    const m = Math.ceil((def.cdMs - (now - prev)) / 60000);
    return `⏳ ${def.name} cooldown: ${m}m left`;
  }

  const inv = ((p as any).inventory || []) as string[];
  const equipped = ((p as any).equipped || {}) as Record<string, string | null>;
  let gearStealth = 0;
  let gearCrime = 0;
  if (inv.includes('lockpick')) { gearCrime += 6; gearStealth += 3; }
  if (inv.includes('mask')) gearStealth += 5;
  if (inv.includes('drone') || equipped.tool === 'drone') { gearCrime += 12; gearStealth += 4; }
  if (inv.includes('scanner') || equipped.tool === 'scanner') gearCrime += 8;

  let power =
    p.stealth * 1.1 +
    p.luck * 0.7 +
    p.classLevel * 2.5 +
    gearStealth +
    gearCrime * 0.8 +
    (p.role === 'Hitman' ? 10 : p.role === 'Mafia' ? 8 : 3);

  power -= Math.min(25, p.heat * 0.2 + p.wanted * 0.15);

  const cityMult = crimeDifficultyMult();
  const need = def.difficulty * cityMult;
  const roll = Math.random() * 100 + power * 0.5;
  const success = roll >= need;

  (p as any)[key] = now;
  const noteText = (notes: string[]) => (notes.length ? '\n' + notes.join('\n') : '');

  if (success) {
    const hotExit = Math.random() < def.jailChance * 0.25;
    const pay = Math.floor(def.payout * (0.85 + Math.random() * 0.35));
    p.cash += pay;
    p.heat = Math.min(100, p.heat + Math.floor(def.heat * 0.7));
    p.wanted = Math.min(100, p.wanted + Math.floor(def.heat * 0.25));
    const notes = addXp(p, Math.floor(def.payout / 90));
    addCityHeat(def.heat * 0.4, `${def.name} hit (solo)`);

    if (hotExit) {
      const mins = Math.floor(def.jailMinOnBust * 0.5);
      p.inPrison = true;
      p.prisonUntil = now + mins * 60 * 1000;
      savePlayer(p);
      return (
        `💰 *${def.name.toUpperCase()} — SCORE + BUST*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `▸ +$${pay.toLocaleString()} (got the bag)\n` +
        `🚨 Cops cut you off on the way out\n` +
        `◆ Prison ${mins} min\n` +
        `🔥 Heat ${p.heat} · 🚨 Wanted ${p.wanted}\n` +
        `💡 .jail · .bail · .escape · .work` +
        noteText(notes)
      );
    }

    savePlayer(p);
    return (
      `💰 *${def.name.toUpperCase()} — CLEAN*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `▸ +$${pay.toLocaleString()}\n` +
      `🔥 Heat +${Math.floor(def.heat * 0.7)} → ${p.heat}\n` +
      `🚨 Wanted ${p.wanted}\n` +
      `⏳ CD ${Math.ceil(def.cdMs / 60000)}m` +
      noteText(notes)
    );
  }

  const busted = Math.random() < def.jailChance;
  p.heat = Math.min(100, p.heat + def.heat);
  p.wanted = Math.min(100, p.wanted + Math.floor(def.heat * 0.5));
  const fine = Math.min(p.cash, Math.floor(def.payout * 0.08 + Math.random() * 15000));
  p.cash = Math.max(0, p.cash - fine);
  addCityHeat(def.heat * 0.35, `${def.name} failed (solo)`);

  if (busted) {
    const mins = def.jailMinOnBust + Math.floor(Math.random() * 8);
    p.inPrison = true;
    p.prisonUntil = now + mins * 60 * 1000;
    savePlayer(p);
    return (
      `🚨 *${def.name.toUpperCase()} — BUSTED*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Cops were inside.\n` +
      `💸 Fine $${fine.toLocaleString()}\n` +
      `◆ Prison ${mins} min\n` +
      `🔥 Heat ${p.heat} · 🚨 Wanted ${p.wanted}\n` +
      `💡 .jail · .bail · .escape · .work · .commissary`
    );
  }

  savePlayer(p);
  return (
    `❌ *${def.name.toUpperCase()} — FAILED*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `You got nothing. Trail is hot.\n` +
    `💸 Fine $${fine.toLocaleString()}\n` +
    `🔥 Heat ${p.heat} · 🚨 Wanted ${p.wanted}\n` +
    `(Lucky — not cuffed this time)`
  );
}


export function openLobby(leader: Player, heistId: string): string {
  if (isLockdown()) return '🚨 Lockdown — heists frozen. .news';
  if (isSoloHeistId(heistId)) {
    return runSoloClassicHeist(leader, heistId);
  }
  const def = HEISTS.find(h => h.id === heistId);
  if (!def) return '❌ Unknown heist. Solo: .sh .jh .gmh .dh .bh · Crew: .safe .risky';
  // Class unlocked — all ranks can run any crew heist
  if (false && leader.classLevel < def.minClass) return `◆ Need Class ${def.minClass}`;
  if (leader.inPrison && Date.now() < leader.prisonUntil) return '◆ In prison';

  if (def.id === 'safe' || def.id === 'risky') {
    const left = specialHeistCdLeft(leader);
    if (left > 0) {
      const m = Math.ceil(left / 60000);
      return `⏳ Safe/Risky heist cooldown: ${m}m left (1h shared)`;
    }
  }

  const all = lobbies();
  if (all.find(l => l.stage !== 'done' && l.leader === leader.id)) {
    return '❌ You already lead a lobby. .heist leave';
  }

  const lobby: Lobby = {
    id: `H${Date.now().toString(36)}`,
    heistId: def.id,
    leader: leader.id,
    members: [leader.id],
    stage: 'lobby',
    createdAt: Date.now(),
    prepStartedAt: 0,
    prepReadyAt: 0,
    prepBonus: 0
  };
  all.push(lobby);
  const db = getDb() as any;
  db.heistLobbies = all.filter(l => Date.now() - l.createdAt < 40 * 60 * 1000);
  save();

  return `📢 *HEIST LOBBY OPEN* — ${def.name}
Type *.join heist ${def.id}* to crew up


 🏦 ${def.name.toUpperCase().padEnd(26)}
━━━━━━━━━━━━━━━━━━━━
Lobby ${lobby.id} · Stage RECRUIT
Crew 1/${def.minCrew} (max ${def.maxCrew})
Prep time when started: ${def.prepSec}s
━━━━━━━━━━━━━━━━━━━━
📢 LOBBY OPEN — group can join
Join:  .join heist ${def.id}
Ready: .${def.id} prep   (min crew)
Go:    .${def.id} start  (after prep)
`;
}

export function joinLobby(p: Player, heistId?: string): string {
  if (p.inPrison && Date.now() < p.prisonUntil) return '◆ In prison';
  const all = lobbies().filter(l => l.stage === 'lobby');
  let lobby = heistId
    ? all.filter(l => l.heistId === heistId).sort((a, b) => b.createdAt - a.createdAt)[0]
    : all.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!lobby) return '❌ No open lobby. .safe / .risky / .sh / .jh / .gmh / .dh / .bh';

  const def = HEISTS.find(h => h.id === lobby!.heistId)!;
  if (false && p.classLevel < def.minClass) return `◆ Need Class ${def.minClass}`;
  if (lobby.members.includes(p.id)) return '❌ Already in lobby';
  if (lobby.members.length >= def.maxCrew) return `❌ Full (max ${def.maxCrew})`;
  if (def.id === 'safe' || def.id === 'risky') {
    const left = specialHeistCdLeft(p);
    if (left > 0) {
      const m = Math.ceil(left / 60000);
      return `⏳ You are on Safe/Risky cooldown (${m}m left)`;
    }
  }

  lobby.members.push(p.id);
  save();
  return `▸ Joined ${def.name} (${lobby.id})
Crew ${lobby.members.length}/${def.minCrew}
Leader: .${def.id} prep when ready`;
}

export function startPrep(leader: Player, heistId: string): string {
  const def = HEISTS.find(h => h.id === heistId);
  if (!def) return '❌ Unknown';
  const lobby = lobbies().find(l => l.leader === leader.id && l.heistId === heistId && l.stage === 'lobby');
  if (!lobby) return '❌ No recruit lobby you lead';
  if (lobby.members.length < def.minCrew) {
    return `❌ Need ${def.minCrew} crew (have ${lobby.members.length})`;
  }
  lobby.stage = 'prep';
  lobby.prepStartedAt = Date.now();
  lobby.prepReadyAt = Date.now() + def.prepSec * 1000;
  // prep bonus from crew quality
  const members = lobby.members.map(id => getOrCreatePlayer(id));
  const avg = members.reduce((s, m) => s + m.stealth + m.classLevel, 0) / members.length;
  lobby.prepBonus = Math.min(15, Math.floor(avg / 4));
  save();
  return `
 🛠️ PREP PHASE — ${def.name.padEnd(14)}
━━━━━━━━━━━━━━━━━━━━
Casing the target...
Ready in ${def.prepSec}s
Prep bonus +${lobby.prepBonus} success
━━━━━━━━━━━━━━━━━━━━
When timer done: .${def.id} start
.heist status — check clock
`;
}

export function heistStatus(p: Player): string {
  const lobby = lobbies().find(l => l.stage !== 'done' && l.members.includes(p.id));
  if (!lobby) return '❌ Not in a heist';
  const def = HEISTS.find(h => h.id === lobby.heistId)!;
  if (lobby.stage === 'lobby') {
    return `🏦 ${def.name} · RECRUIT · ${lobby.members.length}/${def.minCrew}`;
  }
  const left = Math.max(0, Math.ceil((lobby.prepReadyAt - Date.now()) / 1000));
  return `🏦 ${def.name} · PREP · ${left}s left · bonus +${lobby.prepBonus}`;
}

export function startHeist(leader: Player, heistId: string): string {
  const def = HEISTS.find(h => h.id === heistId);
  if (!def) return '❌ Unknown heist';
  let lobby = lobbies().find(l => l.leader === leader.id && l.heistId === heistId && l.stage !== 'done');
  if (!lobby) return '❌ No lobby. Open with .' + heistId;

  // allow start from lobby only if they skipped prep? require prep
  if (lobby.stage === 'lobby') {
    return `❌ Run .${heistId} prep first (recruit → prep → start)`;
  }
  if (lobby.stage === 'prep' && Date.now() < lobby.prepReadyAt) {
    const left = Math.ceil((lobby.prepReadyAt - Date.now()) / 1000);
    return `⏳ Prep not finished — ${left}s left. .heist status`;
  }

  lobby.stage = 'done';
  save();

  const members = lobby.members.map(id => getOrCreatePlayer(id));
  // 1h shared CD for safe/risky on all crew when the job runs
  if (def.id === 'safe' || def.id === 'risky') {
    markSpecialHeistCd(members);
  }

  const avgStealth = members.reduce((s, m) => s + m.stealth, 0) / members.length;
  const avgClass = members.reduce((s, m) => s + m.classLevel, 0) / members.length;
  const mafiaBonus = members.filter(m => m.role === 'Mafia').length * 4;
  const hitmanBonus = members.filter(m => m.role === 'Hitman').length * 3;
  const cityMult = crimeDifficultyMult();
  const score =
    Math.random() * 100 +
    avgStealth * 1.2 +
    avgClass * 3 +
    mafiaBonus +
    hitmanBonus +
    members.length * 2 +
    (lobby.prepBonus || 0);
  const need = def.difficulty * cityMult;
  const success = score >= need;

  const lines: string[] = [];
  if (success) {
    const quality = score >= need + 20 ? 1.4 : score >= need + 8 ? 1.15 : 1.0;
    const pot = Math.floor(def.basePayout * quality * (0.9 + members.length * 0.05));
    const share = Math.floor(pot / members.length);
    for (const m of members) {
      m.cash += share;
      m.heat = Math.min(100, m.heat + Math.floor(def.heat * 0.6));
      addXp(m, Math.floor(def.basePayout / 80));
      savePlayer(m);
    }
    addCityHeat(def.heat * 0.5, `${def.name} succeeded`);
    lines.push(`▸ SUCCESS · prep helped +${lobby.prepBonus}`);
    lines.push(`💰 $${share.toLocaleString()} each (pot $${pot.toLocaleString()})`);
  } else {
    const jailChance = def.id === 'risky' ? 0.45 : def.id === 'safe' ? 0.05 : 0.2;
    const jailMin = def.id === 'risky' ? 18 : 8;
    for (const m of members) {
      m.heat = Math.min(100, m.heat + def.heat);
      m.wanted = Math.min(100, m.wanted + Math.floor(def.heat / 3));
      m.cash = Math.max(0, m.cash - Math.floor(m.cash * 0.06));
      if (Math.random() < jailChance) {
        m.inPrison = true;
        m.prisonUntil = Date.now() + jailMin * 60 * 1000;
      }
      savePlayer(m);
    }
    addCityHeat(def.heat * 0.35, `${def.name} failed`);
    lines.push(`❌ FAILED · heat wave`);
    if (def.id === 'risky') lines.push(`⚠️ High bust risk on Risky jobs`);
  }

  const db = getDb() as any;
  db.heistLobbies = lobbies().filter(l => l.id !== lobby!.id);
  save();

  return `
 🏦 HEIST RESOLVED
━━━━━━━━━━━━━━━━━━━━
${def.name} · crew ${members.length}
${lines.join('\n')}
`;
}

export function leaveLobby(p: Player): string {
  const all = lobbies();
  const lobby = all.find(l => l.stage !== 'done' && l.members.includes(p.id));
  if (!lobby) return '❌ Not in a lobby';
  if (lobby.stage === 'prep') return '❌ Locked in prep — wait it out';
  lobby.members = lobby.members.filter(m => m !== p.id);
  if (lobby.leader === p.id || lobby.members.length === 0) {
    const db = getDb() as any;
    db.heistLobbies = all.filter(l => l.id !== lobby.id);
  }
  save();
  return '▸ Left lobby';
}

export function listHeists(): string {
  let out = `🏦 *HEISTS*
━━━━━━━━━━━━━━━━━━━━
*SOLO · extreme jail risk*
`;
  for (const h of SOLO_HEISTS) {
    out += `.${h.id}  ${h.name}  ~$${(h.payout / 1000).toFixed(0)}k  jail~${Math.round(h.jailChance * 100)}%\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
*CREW · max 4 · 1h CD*
`;
  for (const h of HEISTS) {
    out += `.${h.id}  ${h.name}  crew ${h.minCrew}–${h.maxCrew}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
Solo: type .sh / .jh / .gmh / .dh / .bh
Crew: .safe / .risky → .join heist <id>
.heist status · .heist leave`;
  return out;
}

/** @deprecated solo removed — redirects to crew lobby */
export function runSoloHeist(p: Player, mode: 'risky' | 'safe'): string {
  return openLobby(p, mode) + `
━━━━━━━━━━━━━━━━━━━━
⚠️ Not solo anymore — need 2–4 crew
.join heist ${mode}  ·  .${mode} prep  ·  .${mode} start
1 hour cooldown after the job`;
}
