/**
 * Salvage parts from crime-adjacent activity → garage repair discount.
 * Complements vehicles.ts; does not replace cash repairs.
 */
import type { Player } from './player.js';
import { savePlayer } from './player.js';
import { getOwnedVehicleByInstanceId, getActiveVehicle, repairWithMechanic } from './vehicles.js';
import { addRep } from './reputation.js';

export type SalvageBag = { common: number; rare: number };

function bag(p: Player): SalvageBag {
  if (!(p as any).salvage) (p as any).salvage = { common: 0, rare: 0 };
  return (p as any).salvage as SalvageBag;
}

/** Call from crime success paths optionally — safe no-op if unused. */
export function grantSalvage(p: Player, rarity: 'common' | 'rare' = 'common', n = 1): void {
  const b = bag(p);
  if (rarity === 'rare') b.rare += n;
  else b.common += n;
  savePlayer(p);
}

export function formatSalvage(p: Player): string {
  const b = bag(p);
  return [
    '🔧 *SALVAGE BAY*',
    `Common parts: *${b.common}*`,
    `Rare parts: *${b.rare}*`,
    '',
    '▸ `.salvage use` — spend 3 common to restore main car +15% condition',
    '▸ `.salvage use rare` — spend 1 rare to restore +40% + durability touch',
    '',
    '_Parts drop from street jobs and contracts._',
  ].join('\n');
}

export function useSalvage(p: Player, rare = false): string {
  const b = bag(p);
  const active = getActiveVehicle(p);
  if (!active) return '⚠️ No car in garage. Buy one with `.vehicle shop`.';
  if (rare) {
    if (b.rare < 1) return '⚠️ Need 1 rare part.';
    b.rare -= 1;
    active.condition = Math.min(100, active.condition + 40);
  } else {
    if (b.common < 3) return '⚠️ Need 3 common parts.';
    b.common -= 3;
    active.condition = Math.min(100, active.condition + 15);
  }
  savePlayer(p);
  try {
    addRep(p, 1, 'salvage');
  } catch {}
  return `🔧 Applied salvage to *${active.name}* → ${active.condition.toFixed(0)}% condition.`;
}
