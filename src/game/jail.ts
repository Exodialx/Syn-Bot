/**
 * Jail / escape system
 * — status, bail, escape plans, solitary, tool & role bonuses
 */
import { Player, savePlayer, addXp } from './player.js';
import { gearBonuses } from './shop.js';
import { addCityHeat } from './city.js';

const ESCAPE_CD = 3 * 60 * 1000; // 3 min between attempts

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export function ensureFreeIfExpired(p: Player): boolean {
  if (p.inPrison && Date.now() >= p.prisonUntil) {
    p.inPrison = false;
    p.prisonUntil = 0;
    (p as any).solitary = false;
    savePlayer(p);
    return true;
  }
  return false;
}

export function jailStatus(p: Player): string {
  if (!p.inPrison || Date.now() >= p.prisonUntil) {
    ensureFreeIfExpired(p);
    return `🔓 *FREE*
━━━━━━━━━━━━━━━━━━━━
You are not in custody.
Stay clean — or don't.`;
  }

  const leftMs = p.prisonUntil - Date.now();
  const bail = bailCost(p);
  const last = (p as any).lastEscapeAttempt || 0;
  const cdLeft = Math.max(0, ESCAPE_CD - (Date.now() - last));
  const solitary = !!(p as any).solitary;
  const escapes = (p as any).escapeFails || 0;
  const inv = ((p as any).inventory || []) as string[];
  const bag = ((p as any).contraband || []) as string[];
  const tools: string[] = [];
  if (inv.includes('lockpick')) tools.push('lockpick');
  if (inv.includes('mask')) tools.push('mask');
  if (bag.includes('phone-chip')) tools.push('phone-chip');
  if (bag.includes('shank-kit')) tools.push('shank');

  const odds = estimateEscapeOdds(p);

  return `◆ *JAIL*
━━━━━━━━━━━━━━━━━━━━
⏱️ ${fmtTime(leftMs)} left${solitary ? ' · 🔒 SOLITARY' : ''}
💵 Bail $${bail.toLocaleString()}
🏃 Escape ${cdLeft > 0 ? fmtTime(cdLeft) + ' CD' : 'ready'} · odds ~${odds}%
${tools.length ? `🧰 ${tools.join(', ')}` : '🧰 No break tools'}
${escapes ? `⚠️ Failed breaks: ${escapes}` : ''}
━━━━━━━━━━━━━━━━━━━━
.bail — pay & walk
.escape — stealth breakout
.work — cash + shave time
.commissary · .smuggle
.prison — full help`;
}

export function bailCost(p: Player): number {
  const left = Math.max(0, p.prisonUntil - Date.now());
  const mins = left / 60000;
  let cost = 3000 + mins * 900 + p.wanted * 120 + p.level * 220;
  if ((p as any).solitary) cost *= 1.35;
  if (p.role === 'Businessman') cost *= 0.9; // connections
  return Math.max(2500, Math.floor(cost));
}

export function payBail(p: Player): string {
  if (!p.inPrison || Date.now() >= p.prisonUntil) {
    ensureFreeIfExpired(p);
    return '🔓 Already free.';
  }
  const cost = bailCost(p);
  if (p.cash < cost) {
    return `❌ Bail is $${cost.toLocaleString()}
You have $${p.cash.toLocaleString()}
.work for commissary cash or wait it out`;
  }
  p.cash -= cost;
  p.inPrison = false;
  p.prisonUntil = 0;
  (p as any).solitary = false;
  (p as any).escapeFails = 0;
  p.wanted = Math.max(0, p.wanted - 5);
  savePlayer(p);
  return `💵 *BAILED*
━━━━━━━━━━━━━━━━━━━━
Paid $${cost.toLocaleString()}
🔓 Free · 🚨 Wanted -5
💰 $${p.cash.toLocaleString()}`;
}

function estimateEscapeOdds(p: Player): number {
  const gear = gearBonuses(p);
  const difficulty = escapeDifficulty(p);
  let power =
    p.stealth * 1.4 +
    p.luck * 0.8 +
    p.classLevel * 2 +
    gear.stealth * 1.2 +
    gear.crime * 0.5;
  if (p.role === 'Hitman') power += 12;
  else if (p.role === 'Mafia') power += 8;
  else if (p.role === 'Businessman') power += 2;

  const inv = ((p as any).inventory || []) as string[];
  const bag = ((p as any).contraband || []) as string[];
  if (inv.includes('lockpick')) power += 10;
  if (inv.includes('mask')) power += 4;
  if (bag.includes('phone-chip')) power += 8;
  if (bag.includes('shank-kit')) power += 5;
  if ((p as any).solitary) power -= 15;
  const fails = (p as any).escapeFails || 0;
  power -= fails * 3;

  // Approximate P(success) with average roll 50
  const avgRoll = 50 + power * 0.55;
  const odds = Math.max(5, Math.min(92, Math.round(50 + (avgRoll - difficulty))));
  return odds;
}

function escapeDifficulty(p: Player): number {
  let d = 48 + p.wanted * 0.4 + Math.min(22, p.heat * 0.18);
  if ((p as any).solitary) d += 12;
  const fails = (p as any).escapeFails || 0;
  d += fails * 4;
  return d;
}

/**
 * Escape attempt — uses stealth, tools, contraband, role.
 * Failures stack (harder next try) and can trigger solitary.
 */
export function attemptEscape(p: Player): string {
  if (!p.inPrison || Date.now() >= p.prisonUntil) {
    ensureFreeIfExpired(p);
    return '🔓 Already free — nothing to escape from.';
  }

  const now = Date.now();
  const last = (p as any).lastEscapeAttempt || 0;
  if (now - last < ESCAPE_CD) {
    return `⏳ Guards on rotation — escape in ${fmtTime(ESCAPE_CD - (now - last))}`;
  }
  (p as any).lastEscapeAttempt = now;

  const gear = gearBonuses(p);
  const difficulty = escapeDifficulty(p);

  let power =
    p.stealth * 1.4 +
    p.luck * 0.8 +
    p.classLevel * 2 +
    gear.stealth * 1.2 +
    gear.crime * 0.5;

  if (p.role === 'Hitman') power += 12;
  else if (p.role === 'Mafia') power += 8;
  else if (p.role === 'Businessman') power += 2;

  const inv = ((p as any).inventory || []) as string[];
  const bag = ((p as any).contraband || []) as string[];
  const used: string[] = [];

  if (inv.includes('lockpick')) {
    power += 10;
    used.push('lockpick');
  }
  if (inv.includes('mask')) {
    power += 4;
    used.push('mask');
  }
  // Contraband consumed on attempt (success or fail) for phone-chip; shank is riskier
  if (bag.includes('phone-chip')) {
    power += 8;
    used.push('phone-chip');
    (p as any).contraband = bag.filter((x: string) => x !== 'phone-chip');
  } else if (bag.includes('shank-kit')) {
    power += 5;
    used.push('shank');
    // 20% extra solitary risk baked into fail path
    (p as any).contraband = bag.filter((x: string) => x !== 'shank-kit');
  }

  if ((p as any).solitary) power -= 15;

  const fails = (p as any).escapeFails || 0;
  power -= fails * 3;

  const roll = Math.random() * 100 + power * 0.55;
  const success = roll >= difficulty;
  const toolLine = used.length ? `\n🧰 Used: ${used.join(', ')}` : '';

  if (success) {
    p.inPrison = false;
    p.prisonUntil = 0;
    (p as any).solitary = false;
    (p as any).escapeFails = 0;
    p.heat = Math.min(100, p.heat + 10);
    p.wanted = Math.min(100, p.wanted + 6);
    const notes = addXp(p, 45);
    addCityHeat(4, 'Jailbreak reported');
    savePlayer(p);
    return `🏃 *ESCAPE SUCCESS*
━━━━━━━━━━━━━━━━━━━━
You cleared the fence.
🔥 Heat +10 · 🚨 Wanted +6${toolLine}
${notes.join('\n')}
Stay low — .cd · .news`;
  }

  // FAIL
  (p as any).escapeFails = fails + 1;
  const extraMin = 5 + Math.floor(Math.random() * 7); // 5–11 min
  p.prisonUntil = Math.max(p.prisonUntil, now) + extraMin * 60 * 1000;
  p.heat = Math.min(100, p.heat + 14);
  p.wanted = Math.min(100, p.wanted + 10);

  // Solitary on repeated fails or shank attempt
  let solitaryHit = false;
  if ((p as any).escapeFails >= 2 || used.includes('shank') || Math.random() < 0.22) {
    (p as any).solitary = true;
    solitaryHit = true;
    p.prisonUntil += 3 * 60 * 1000;
  }

  addCityHeat(3, 'Failed jailbreak');
  savePlayer(p);

  return `❌ *ESCAPE FAILED*
━━━━━━━━━━━━━━━━━━━━
Caught on the wire.
⏱️ +${extraMin} min${solitaryHit ? ' · 🔒 SOLITARY +3m' : ''}
🔥 Heat +14 · 🚨 Wanted +10
Fails: ${(p as any).escapeFails} (harder next try)${toolLine}
.bail $${bailCost(p).toLocaleString()} · .work · wait`;
}

/** Force-release helper for admin or sentence end messaging */
export function releasePlayer(p: Player): string {
  p.inPrison = false;
  p.prisonUntil = 0;
  (p as any).solitary = false;
  (p as any).escapeFails = 0;
  savePlayer(p);
  return '🔓 Released.';
}
