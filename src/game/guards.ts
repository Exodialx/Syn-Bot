import { Player, savePlayer, resolveExistingPlayerId, getPlayer } from './player.js';
import { ensureInv } from './shop.js';

const HIRE_COST_BASE = 15000; // per guard, scales with target level

export function hireGuard(boss: Player, targetRaw: string): string {
  if (boss.role !== 'Businessman') {
    return '❌ Only Businessmen hire bodyguards.\nMafia/Hitman use weapons instead.';
  }
  const inv = ensureInv(boss);
  if (inv.bodyguards.length >= 3) return '❌ Max 3 bodyguards';

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === boss.id) return '❌ Cannot hire yourself';
  if (inv.bodyguards.includes(resolved.id)) return '❌ Already hired';

  const cost = HIRE_COST_BASE + resolved.player.level * 2000;
  if (boss.cash < cost) return `❌ Hire costs $${cost.toLocaleString()}`;

  boss.cash -= cost;
  inv.bodyguards.push(resolved.id);
  // small tip to guard
  resolved.player.cash += Math.floor(cost * 0.4);
  savePlayer(boss);
  savePlayer(resolved.player);
  return `▸ Hired ...${resolved.id.slice(-6)} as bodyguard
💸 -$${cost.toLocaleString()} (40% paid to them)
Guards: ${inv.bodyguards.length}/3`;
}

export function fireGuard(boss: Player, targetRaw: string): string {
  const inv = ensureInv(boss);
  const id = targetRaw.replace(/[^0-9]/g, '');
  if (!inv.bodyguards.includes(id)) return '❌ Not on your payroll';
  inv.bodyguards = inv.bodyguards.filter(g => g !== id);
  savePlayer(boss);
  return `▸ Fired ...${id.slice(-6)}`;
}

export function listGuards(boss: Player): string {
  const inv = ensureInv(boss);
  if (!inv.bodyguards.length) return 'No bodyguards. .hire <number> (Businessman only, max 3)';
  const lines = inv.bodyguards.map(id => {
    const g = getPlayer(id);
    return `🛡️ ...${id.slice(-6)} Lv${g?.level ?? '?'} STR${g?.strength ?? '?'}`;
  });
  return `
      🛡️ BODYGUARDS (${inv.bodyguards.length}/3)
━━━━━━━━━━━━━━━━━━━━
${lines.map(l => `${l}`).join('\n')}
.hire <num>  .fire <num>
`;
}

/** Defense contribution from active bodyguards */
export function guardDefense(boss: Player): number {
  const inv = ensureInv(boss);
  let d = 0;
  for (const id of inv.bodyguards) {
    const g = getPlayer(id);
    if (!g || g.inPrison) continue;
    d += 6 + Math.floor(g.strength * 0.8) + Math.floor(g.level * 0.5);
  }
  return d;
}
