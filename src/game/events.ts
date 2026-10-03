/**
 * Timed city events — Giftbox inflation event
 */
import { Player, savePlayer, addXp } from './player.js';
import { getDb, saveDb } from '../db/database.js';

const GIFT_LINES = [
  '🎁 *{name}* tripped over a mystery box and somehow walked away richer. Capitalism.',
  '🎁 *{name}* opened a giftbox. The box said "do not open". They opened it. $ arrived.',
  '🎁 Police evidence locker "accidentally" mailed a giftbox to *{name}*.',
  '🎁 *{name}* found a giftbox labeled "definitely not money". It was money.',
  '🎁 A seagull dropped a giftbox on *{name}*. The seagull looked paid.',
  '🎁 *{name}* won a giftbox from a street raffle that did not exist 5 minutes ago.',
  '🎁 *{name}* checked their coat pocket. Giftbox. They were not wearing a coat.',
  '🎁 Santa is unemployed so *{name}* got a criminal giftbox instead.',
  '🎁 *{name}* robbed a vending machine. It dispensed a giftbox and trauma.',
  '🎁 *{name}* found a giftbox under the hospital bed. Doctor said "get well soon (rich)".',
  '🎁 *{name}* hit someone so hard a giftbox fell out of the economy.',
  '🎁 City council "stimulus package" delivered to *{name}* via giftbox.',
  '🎁 *{name}* opened a giftbox. Inside: cash, XP, and poor financial planning for the server.',
  '🎁 *{name}* said they needed a buff. The universe mailed a giftbox.',
  '🎁 *{name}* looted a giftbox from a boss that was just trying to grocery shop.',
  '🎁 Breaking: *{name}* legally illegally acquired a giftbox.',
  '🎁 *{name}* found a giftbox in the raid van. Nobody is asking questions.',
  '🎁 *{name}* pressed "claim". Giftbox. Inflation nodded respectfully.',
  '🎁 A giftbox chose *{name}*. The giftbox has taste. Questionable taste.',
  '🎁 *{name}* got a giftbox for "participation in chaos". Fair.',
  '🎁 *{name}* blinked. Giftbox. Economy therapists are on the way.',
  '🎁 *{name}* opened a giftbox stamped "Season recovery kit". Effective immediately.',
  '🎁 *{name}* found a giftbox taped to a streetlight. Instructions: get rich.',
  '🎁 *{name}* won the giftbox lottery they did not enter. Perfect.',
  '🎁 *{name}* shook a random NPC. Giftbox fell out. NPC apologized.',
];

export type EventState = {
  id: string;
  name: string;
  endsAt: number;
  startedAt: number;
  startedBy?: string;
  giftChance: number; // 0-1
  giftMin: number;
  giftMax: number;
  totalGifts: number;
};

function now() {
  return Date.now();
}

export function getActiveEvent(): EventState | null {
  const db = getDb() as any;
  const e = db.activeEvent as EventState | undefined;
  if (!e || !e.endsAt) return null;
  if (e.endsAt <= now()) {
    db.activeEvent = null;
    saveDb();
    return null;
  }
  return e;
}

export function startGiftboxEvent(adminId: string, hours = 10): string {
  const h = Math.max(1, Math.min(48, hours));
  const db = getDb() as any;
  db.activeEvent = {
    id: 'giftbox',
    name: 'Giftbox Rush',
    startedAt: now(),
    endsAt: now() + h * 3_600_000,
    startedBy: adminId,
    giftChance: 0.22, // 22% on eligible actions
    giftMin: 1_000_000,
    giftMax: 2_000_000,
    totalGifts: 0,
  } satisfies EventState;
  saveDb();
  return formatAnnouncement();
}

export function stopEvent(): string {
  const db = getDb() as any;
  db.activeEvent = null;
  saveDb();
  return '📣 Event stopped.';
}

export function formatAnnouncement(): string {
  const e = getActiveEvent();
  if (!e) {
    return `📣 *NO ACTIVE EVENT*
━━━━━━━━━━━━━━━━━━━━
Admin: .event start giftbox 10
(or .announcement to repost when live)`;
  }
  const leftMs = e.endsAt - now();
  const leftH = (leftMs / 3_600_000).toFixed(1);
  return `📣 *CITY ANNOUNCEMENT*
━━━━━━━━━━━━━━━━━━━━
🎁 *GIFTBOX RUSH* — Season recovery

For the next *${leftH} hours*:
Rob · Raid · Hit · Battle · Hospital rolls
have a *high chance* to drop a *Giftbox*.

Each Giftbox grants:
💰 *$1,000,000 – $2,000,000*
⭐ Bonus XP

Inflate up. Climb back. Don't ask the mayor.
Gifts dropped so far: *${e.totalGifts}*
━━━━━━━━━━━━━━━━━━━━
Ends: ${new Date(e.endsAt).toUTCString()}
.event status`;
}

export function formatEventStatus(): string {
  const e = getActiveEvent();
  if (!e) return '📣 No event running.';
  const leftH = ((e.endsAt - now()) / 3_600_000).toFixed(2);
  return `🎁 *${e.name}*
Time left: ${leftH}h
Chance / action: ${Math.round(e.giftChance * 100)}%
Payout: $${e.giftMin.toLocaleString()}–$${e.giftMax.toLocaleString()}
Total giftboxes found: ${e.totalGifts}`;
}

/**
 * Roll a giftbox during an eligible action. Returns funny public line or null.
 */
export function tryGiftbox(p: Player, source: string): string | null {
  const e = getActiveEvent();
  if (!e || e.id !== 'giftbox') return null;
  if (Math.random() > e.giftChance) return null;

  const cash = e.giftMin + Math.floor(Math.random() * (e.giftMax - e.giftMin + 1));
  const xp = 80 + Math.floor(Math.random() * 120);
  p.cash = (p.cash || 0) + cash;
  addXp(p, xp);
  e.totalGifts = (e.totalGifts || 0) + 1;
  const db = getDb() as any;
  db.activeEvent = e;
  savePlayer(p);
  saveDb();

  const name = (p as any).usernameSet && p.name ? p.name : `…${p.id.slice(-4)}`;
  const line = GIFT_LINES[Math.floor(Math.random() * GIFT_LINES.length)].replace(/\{name\}/g, name);
  return `${line}
━━━━━━━━━━━━━━━━━━━━
🎁 Giftbox (${source})
💰 +$${cash.toLocaleString()} · ⭐ +${xp} XP
💵 Cash now $${p.cash.toLocaleString()}`;
}
