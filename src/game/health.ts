/**
 * Hearts / hospitalization system
 * 3 hearts → each successful hit or battle loss removes 1
 * 0 hearts → hospitalized 10h (no rob/raid/heist/crime/physical)
 */
import { Player, savePlayer } from './player.js';
import { tryGiftbox } from './events.js';

export const MAX_HEARTS = 3;
export const HOSPITAL_MS = 10 * 60 * 60 * 1000;

export function getHearts(p: Player): number {
  const h = (p as any).hearts;
  if (h == null || h === undefined) {
    (p as any).hearts = MAX_HEARTS;
    return MAX_HEARTS;
  }
  return Math.max(0, Math.min(MAX_HEARTS, Number(h)));
}

export function setHearts(p: Player, n: number) {
  (p as any).hearts = Math.max(0, Math.min(MAX_HEARTS, Math.floor(n)));
}

export function heartsBar(p: Player): string {
  const h = getHearts(p);
  return '❤️'.repeat(h) + '🖤'.repeat(MAX_HEARTS - h);
}

export function isHospitalized(p: Player): boolean {
  const until = (p as any).hospitalUntil || 0;
  if (until > Date.now()) return true;
  if (until && until <= Date.now()) {
    (p as any).hospitalUntil = 0;
    if (getHearts(p) <= 0) setHearts(p, MAX_HEARTS); // discharge with full hearts
    savePlayer(p);
  }
  return false;
}

export function hospitalBlock(p: Player): string | null {
  if (!isHospitalized(p)) return null;
  const left = Math.ceil((((p as any).hospitalUntil || 0) - Date.now()) / 3600000);
  return `🏥 Hospitalized (${left}h left)\nOnly businesses, bank, minigames & chat.\nNo rob / raid / hit / crime / heist.`;
}

/** Remove one heart; at 0 → hospitalize */
export function damageHeart(p: Player, reason = 'injury'): { hearts: number; hospitalized: boolean; msg: string } {
  let h = getHearts(p);
  h = Math.max(0, h - 1);
  setHearts(p, h);
  if (h <= 0) {
    (p as any).hospitalUntil = Date.now() + HOSPITAL_MS;
    savePlayer(p);
    const gift = tryGiftbox(p, 'hospital');
    return {
      hearts: 0,
      hospitalized: true,
      msg: (gift ? gift + '\n' : '') + `🖤 All hearts gone — 🏥 HOSPITALIZED 10h (${reason})\n${heartsBar(p)}`
    };
  }
  savePlayer(p);
  return { hearts: h, hospitalized: false, msg: `${heartsBar(p)} (${h}/${MAX_HEARTS}) — ${reason}` };
}

export function healHearts(p: Player, amount = MAX_HEARTS): string {
  setHearts(p, getHearts(p) + amount);
  (p as any).hospitalUntil = 0;
  savePlayer(p);
  return `💉 Hearts restored ${heartsBar(p)}`;
}

export function adminSetHearts(p: Player, amount: number): string {
  setHearts(p, amount);
  if (amount > 0) (p as any).hospitalUntil = 0;
  savePlayer(p);
  return `Admin set hearts → ${heartsBar(p)}`;
}
