/**
 * CITY HEAT — shared world pressure
 *
 * Design:
 * - Every illicit action adds to a global cityHeat pool
 * - City heat decays slowly over time when activity is low
 * - High city heat makes crimes harder, businesses (illegal) less profitable,
 *   raises personal heat gain, and can lock top-tier illegal ops
 * - Players see it on .news / .heat (with the city image)
 */

import { getDb, saveDb } from '../db/database.js';
import { getAllPlayers } from './player.js';

export type CityState = {
  heat: number;           // 0–100
  lastDecay: number;
  lastEvent: string;
  lockdownUntil: number;  // if > now, heavy restrictions
  news: string[];
};

function getCity(): CityState {
  const db = getDb() as any;
  if (!db.city) {
    db.city = {
      heat: 12,
      lastDecay: Date.now(),
      lastEvent: 'City is quiet.',
      lockdownUntil: 0,
      news: []
    };
  }
  return db.city as CityState;
}

function saveCity() {
  saveDb();
}

/** Call on every illicit success/fail */
export function addCityHeat(amount: number, reason: string) {
  const city = getCity();
  decayCityHeat(); // apply time decay first

  // Diminishing returns as heat rises (harder to max it instantly)
  const scale = 1 - city.heat / 180;
  const gain = Math.max(0.15, amount * scale);
  city.heat = Math.min(100, city.heat + gain);

  city.news.unshift(`${new Date().toLocaleTimeString()} — ${reason} (+${gain.toFixed(1)} city heat)`);
  if (city.news.length > 15) city.news = city.news.slice(0, 15);

  if (city.heat >= 85 && city.lockdownUntil < Date.now()) {
    city.lockdownUntil = Date.now() + 20 * 60 * 1000; // 20 min pressure window
    city.lastEvent = '🚨 CITYWIDE CRACKDOWN — illicit ops under heavy fire';
    city.news.unshift(`${new Date().toLocaleTimeString()} — CRACKDOWN declared`);
  } else if (city.heat >= 70) {
    city.lastEvent = '🚔 Police saturation high — crime risk elevated';
  } else if (city.heat >= 45) {
    city.lastEvent = '📡 Elevated surveillance across districts';
  } else {
    city.lastEvent = 'City is relatively stable';
  }

  saveCity();
}

/** Passive decay — stronger when few players are generating heat */
export function decayCityHeat() {
  const city = getCity();
  const now = Date.now();
  const elapsedMin = (now - (city.lastDecay || now)) / 60000;
  if (elapsedMin < 1) return;

  // Base decay ~0.35 heat per minute when quiet
  // Slower decay when heat is already low
  let rate = 0.35;
  if (city.heat < 20) rate = 0.15;
  if (city.heat > 70) rate = 0.25; // crackdowns linger a bit

  const decay = rate * elapsedMin;
  city.heat = Math.max(0, city.heat - decay);
  city.lastDecay = now;

  if (city.heat < 60 && city.lockdownUntil > 0 && now > city.lockdownUntil) {
    city.lockdownUntil = 0;
    city.lastEvent = 'Crackdown lifted. Streets easing.';
  }
  saveCity();
}

export function getCityHeat(): number {
  decayCityHeat();
  return getCity().heat;
}

export function isLockdown(): boolean {
  decayCityHeat();
  return getCity().lockdownUntil > Date.now();
}

/** Multiplier applied to crime difficulty (1.0 = normal) */
export function crimeDifficultyMult(): number {
  const h = getCityHeat();
  if (h < 30) return 1.0;
  if (h < 50) return 1.08;
  if (h < 70) return 1.18;
  if (h < 85) return 1.32;
  return 1.5; // brutal
}

/** Illegal business income mult */
export function illegalIncomeMult(): number {
  const h = getCityHeat();
  if (h < 40) return 1.0;
  if (h < 60) return 0.9;
  if (h < 80) return 0.7;
  return 0.45; // crackdown tanks illegal cash
}

export function personalHeatGainMult(): number {
  const h = getCityHeat();
  return 1 + h / 100; // up to 2x personal heat gain at 100 city heat
}

/** Personal heat → shop price multiplier (1.0–1.45) */
export function personalShopPriceMult(personalHeat: number): number {
  const h = Math.max(0, Math.min(100, personalHeat));
  if (h < 40) return 1.0;
  if (h < 60) return 1.08;
  if (h < 80) return 1.18;
  return 1.0 + Math.min(0.45, (h - 40) / 100 + 0.15);
}

/** Max single deposit while hot (0 = unlimited) */
export function depositLimitForHeat(personalHeat: number): number {
  const h = Math.max(0, Math.min(100, personalHeat));
  if (h < 50) return 0; // unlimited
  if (h < 70) return 75000;
  if (h < 85) return 35000;
  return 15000;
}

/** Block aggressive PvP when personal heat is critical */
export function isHeatBlocked(personalHeat: number): boolean {
  return personalHeat >= 90;
}

/** Random street raid-check while very hot (call occasionally on actions) */
export function maybeRaidCheck(p: { heat: number; cash: number; wanted: number; inPrison?: boolean; prisonUntil?: number }, now = Date.now()): string | null {
  if (p.heat < 75) return null;
  const chance = p.heat >= 90 ? 0.18 : 0.08;
  if (Math.random() > chance) return null;
  const fine = Math.min(p.cash, Math.floor(4000 + p.heat * 80 + Math.random() * 6000));
  p.cash = Math.max(0, p.cash - fine);
  p.wanted = Math.min(100, (p.wanted || 0) + 8);
  if (p.heat >= 88 && Math.random() < 0.35) {
    p.inPrison = true;
    p.prisonUntil = now + 10 * 60 * 1000;
    return `🚨 *RAID CHECK*\nCops sweep the block.\n💸 Fine $${fine.toLocaleString()}\n◆ Arrested 10 min`;
  }
  return `🚨 *RAID CHECK*\nStreet cameras flagged you.\n💸 Fine $${fine.toLocaleString()} · Wanted +8`;
}

export function formatCityNews(): string {
  decayCityHeat();
  const city = getCity();
  const h = Math.round(city.heat);
  const bar = '█'.repeat(Math.min(20, Math.floor(h / 5))) + '░'.repeat(Math.max(0, 20 - Math.floor(h / 5)));

  let tier = '🟢 STABLE';
  let advice = 'Low pressure. Good window for ops.';
  if (h >= 85) {
    tier = '🔴 LOCKDOWN';
    advice = 'Illicit work is suicide until heat drops. Go legal or lay low.';
  } else if (h >= 70) {
    tier = '🟠 CRITICAL';
    advice = 'Crimes harder. Illegal businesses bleeding. Cool off.';
  } else if (h >= 45) {
    tier = '🟡 ELEVATED';
    advice = 'Surveillance up. Expect more heat per job.';
  }

  const lockdownLine = isLockdown()
    ? `🚨 CRACKDOWN ACTIVE until ${new Date(city.lockdownUntil).toLocaleTimeString()}\n`
    : '';

  const feed = (city.news || []).slice(0, 6).map(n => `· ${n.slice(0, 30)}`).join('\n') || '· No recent incidents';

  return `
      📰 CITY WIRE — NEWS
━━━━━━━━━━━━━━━━━━━━
CITY HEAT  [${bar}] ${String(h).padStart(3)}%
STATUS: ${tier.padEnd(24)}
${lockdownLine}${city.lastEvent.slice(0, 32).padEnd(32)}
━━━━━━━━━━━━━━━━━━━━
${advice.slice(0, 32).padEnd(32)}
━━━━━━━━━━━━━━━━━━━━
RECENT:
━━━━━━━━━━━━━━━━━━━━
Crime difficulty x${crimeDifficultyMult().toFixed(2).padEnd(16)}
Illegal income   x${illegalIncomeMult().toFixed(2).padEnd(16)}
━━━━━━━━━━━━━━━━━━━━
Lay low → heat decays. Keep stacking bodies → lockdown.`;
}
