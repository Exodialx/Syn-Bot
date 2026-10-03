import { Player, savePlayer, addXp, addClassXp } from './player.js';
import { gearBonuses } from './shop.js';
import { getDb, saveDb } from '../db/database.js';
import { addCityHeat, crimeDifficultyMult, personalHeatGainMult, isLockdown } from './city.js';
import { addDirtyCash } from './classSystems.js';

export type CrimeDef = {
  id: string;
  name: string;
  minClass: number;
  basePayout: number;
  difficulty: number;
  heatOnSuccess: number;
  heatOnFail: number;
  jailChance: number;
  cooldownSec: number;
};

const CRIMES: CrimeDef[] = [
  { id: 'street-robbery', name: 'Street Robbery', minClass: 1, basePayout: 4500, difficulty: 28, heatOnSuccess: 8, heatOnFail: 18, jailChance: 0.08, cooldownSec: 60 },
  { id: 'weapon-deal', name: 'Weapon Deal', minClass: 2, basePayout: 12000, difficulty: 38, heatOnSuccess: 14, heatOnFail: 28, jailChance: 0.12, cooldownSec: 120 },
  { id: 'cargo-lift', name: 'Cargo Lift', minClass: 3, basePayout: 22000, difficulty: 45, heatOnSuccess: 18, heatOnFail: 35, jailChance: 0.15, cooldownSec: 180 },
  { id: 'bank-shift', name: 'Bank Shift', minClass: 5, basePayout: 55000, difficulty: 60, heatOnSuccess: 28, heatOnFail: 50, jailChance: 0.25, cooldownSec: 360 },
  { id: 'digital-fence', name: 'Digital Fence', minClass: 6, basePayout: 85000, difficulty: 68, heatOnSuccess: 32, heatOnFail: 55, jailChance: 0.22, cooldownSec: 420 },
  { id: 'armored-truck', name: 'Armored Truck', minClass: 7, basePayout: 140000, difficulty: 75, heatOnSuccess: 40, heatOnFail: 65, jailChance: 0.30, cooldownSec: 600 }
];

const cooldowns = new Map<string, number>();

function roll(difficulty: number, p: Player) {
  const cityMult = crimeDifficultyMult();
  const effectiveDiff = difficulty * cityMult;
  const gear = gearBonuses(p);
  let bonus = p.classLevel * 3 + p.stealth * 0.8 + p.luck * 0.5 + gear.crime + gear.stealth * 0.4;
  if (p.role === 'Mafia') bonus += 8;
  if (p.role === 'Hitman') bonus += 5;
  bonus -= p.heat * 0.3;
  const score = Math.random() * 100 + bonus;
  const success = score >= effectiveDiff;
  let quality = 'fail';
  if (success) {
    if (score >= effectiveDiff + 25) quality = 'critical';
    else if (score >= effectiveDiff + 10) quality = 'clean';
    else quality = 'narrow';
  } else if (score < effectiveDiff - 20) quality = 'critical_fail';
  return { success, quality, effectiveDiff };
}

function findCrime(raw: string): CrimeDef | undefined {
  const q = (raw || '').trim().toLowerCase();
  if (!q) return undefined;
  const m = q.match(/^c(\d+)$/);
  if (m) {
    const i = parseInt(m[1], 10) - 1;
    if (i >= 0 && i < CRIMES.length) return CRIMES[i];
  }
  return CRIMES.find(c => c.id === q || c.name.toLowerCase().includes(q));
}

export function listCrimes(p: Player): string {
  const lockdown = isLockdown();
  let out = `🗡️ *CRIME OPERATIONS*\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (lockdown) out += `⚠️ CITY LOCKDOWN — odds crushed\n\n`;
  CRIMES.forEach((c, i) => {
    const locked = p.classLevel < c.minClass ? '🔒' : '✅';
    out += `${locked} \`${'c' + (i + 1)}\`  *${c.name}*  (Class ${c.minClass}+)\n`;
  });
  out += `\n.crime c1  ·  city heat raises difficulty\n.news for city status`;
  return out;
}

export function runCrime(p: Player, id: string): string {
  if (p.inPrison && Date.now() < p.prisonUntil) {
    return `◆ Prison until ${new Date(p.prisonUntil).toLocaleTimeString()}`;
  }
  p.inPrison = false;

  const crime = findCrime(id);
  if (!crime) return '❌ Unknown. .crime list  ·  use c1, c2…';
  if (p.classLevel < crime.minClass) return `◆ Need Class ${crime.minClass}`;

  if (isLockdown() && crime.minClass >= 5) {
    return '🚨 LOCKDOWN — high-tier ops suspended. Check .news';
  }

  const key = `${p.id}:${crime.id}`;
  const now = Date.now();
  if (now < (cooldowns.get(key) || 0)) {
    return `⏳ Cooldown ${Math.ceil(((cooldowns.get(key) || 0) - now) / 1000)}s`;
  }

  const { success, quality } = roll(crime.difficulty, p);
  const heatMult = personalHeatGainMult();
  let payout = 0;
  let heatG = 0;
  let msg = '';

  if (success) {
    const mult = quality === 'critical' ? 1.55 : quality === 'clean' ? 1.25 : 1.0;
    payout = Math.floor(crime.basePayout * mult * (p.role === 'Mafia' ? 1.15 : 1));
    // lockdown/high heat softens payout slightly
    payout = Math.floor(payout / Math.sqrt(crimeDifficultyMult()));
    if (p.role === 'Businessman') { addDirtyCash(p, payout); } else { p.cash += payout; }
    heatG = Math.floor(crime.heatOnSuccess * heatMult);
    p.heat = Math.min(100, p.heat + heatG);
    const notes = addXp(p, Math.floor(crime.basePayout / 50));
    if (p.role === 'Mafia' || p.role === 'Hitman' || p.role === 'Businessman') notes.push(...addClassXp(p, Math.floor(crime.basePayout / 120), 'crime'));
    addCityHeat(crime.heatOnSuccess * 0.35, `${p.name || p.id.slice(-4)} pulled ${crime.name}`);
    msg = `▸ *${crime.name}* — ${quality.toUpperCase()}
💰 +$${payout.toLocaleString()}
🔥 Personal heat +${heatG} (now ${p.heat})
📡 City felt that.
${notes.join('\n')}`;
  } else {
    heatG = Math.floor(crime.heatOnFail * heatMult);
    p.heat = Math.min(100, p.heat + heatG);
    p.wanted = Math.min(100, p.wanted + Math.floor(heatG / 2));
    const lost = Math.floor(p.cash * 0.04);
    p.cash = Math.max(0, p.cash - lost);
    addCityHeat(crime.heatOnFail * 0.25, `Failed ${crime.name} drew heat`);
    msg = `❌ *${crime.name}* FAILED (${quality})
💸 -$${lost.toLocaleString()}
🔥 Heat +${heatG}  🚨 Wanted +${Math.floor(heatG / 2)}`;
    if (Math.random() < crime.jailChance * (isLockdown() ? 1.5 : 1)) {
      p.inPrison = true;
      p.prisonUntil = now + 6 * 60 * 1000;
      msg += `\n◆ Arrested — 6 minutes\n💡 .work · .bail · .escape · .commissary`;
    }
  }

  cooldowns.set(key, now + crime.cooldownSec * 1000);
  const db = getDb();
  db.crime_log.push({
    id: db.nextIds.crime++,
    player_id: p.id,
    crime_id: crime.id,
    success: success ? 1 : 0,
    payout,
    heat_gained: heatG,
    created_at: now
  });
  if (db.crime_log.length > 2000) db.crime_log = db.crime_log.slice(-1500);
  savePlayer(p);
  saveDb();
  return msg;
}

export function getWantedStatus(p: Player): string {
  const heatBar = '▓'.repeat(Math.round(Math.min(p.heat,100) / 10)) + '░'.repeat(10 - Math.round(Math.min(p.heat,100) / 10));
  const wantedBar = '▓'.repeat(Math.round(Math.min(p.wanted,100) / 10)) + '░'.repeat(10 - Math.round(Math.min(p.wanted,100) / 10));
  let prison = '🔓 Free';
  if (p.inPrison && Date.now() < p.prisonUntil) prison = `◆ Until ${new Date(p.prisonUntil).toLocaleTimeString()}`;
  return `👁️ *YOUR STATUS*
━━━━━━━━━━━━━━━━━━━━
🔥 Heat   [${heatBar}] ${p.heat}
🚨 Wanted [${wantedBar}] ${p.wanted}
${prison}

City status → .news`;
}
