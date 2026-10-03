/**
 * Lightweight reputation — does not replace level/XP/heat.
 * Stored on Player as `rep` (number).
 */
import type { Player } from './player.js';
import { savePlayer } from './player.js';

export function getRep(p: Player): number {
  return Math.max(0, Math.floor(Number((p as any).rep) || 0));
}

export function addRep(p: Player, amount: number, _source?: string): number {
  if (!amount) return getRep(p);
  const next = Math.max(0, getRep(p) + Math.floor(amount));
  (p as any).rep = next;
  try {
    savePlayer(p);
  } catch {}
  return next;
}

export function formatRep(p: Player): string {
  const r = getRep(p);
  const tiers = [
    { at: 1000, label: 'Kingpin access' },
    { at: 500, label: 'High-tier contracts' },
    { at: 250, label: 'Better merchant perks' },
    { at: 100, label: 'Street trust' },
  ];
  const next = tiers.reverse().find((t) => r < t.at);
  return [
    `⭐ *REPUTATION* · *${r.toLocaleString()}*`,
    next ? `Next: ${next.label} at ${next.at}` : 'Status: established',
    '',
    'Earn rep via business, crime, FISCH merchant, contracts, street jobs.',
  ].join('\n');
}

export function repUnlocks(p: Player): { merchantBonus: number; contractTier: number } {
  const r = getRep(p);
  return {
    merchantBonus: r >= 250 ? 0.02 : 0, // reserved for future rate perk
    contractTier: r >= 1000 ? 3 : r >= 500 ? 2 : r >= 100 ? 1 : 0,
  };
}
