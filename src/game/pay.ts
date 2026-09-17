import { Player, savePlayer, resolveExistingPlayerId } from './player.js';

export function payPlayer(from: Player, targetRaw: string, amount: number): string {
  if (!amount || amount <= 0) return '❌ Usage: .pay <number> <amount>';
  if (amount > 5_000_000) return '❌ Max $5,000,000 per send';
  if (from.cash < amount) return `❌ Only have $${from.cash.toLocaleString()} cash`;

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === from.id) return '❌ Cannot pay yourself.';

  const to = resolved.player;
  from.cash -= amount;
  to.cash += amount;
  savePlayer(from);
  savePlayer(to);
  return `▸ Paid $${amount.toLocaleString()} → ...${resolved.id.slice(-6)}
💰 Your cash $${from.cash.toLocaleString()}`;
}
