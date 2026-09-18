import { Player, savePlayer, resolveExistingPlayerId } from './player.js';
import { applyTransferTax, taxLine } from './tax.js';

export function payPlayer(from: Player, targetRaw: string, amount: number): string {
  if (!amount || amount <= 0) return '❌ Usage: .pay <number> <amount>';
  if (amount > 5_000_000) return '❌ Max $5,000,000 per send';
  if (from.cash < amount) return `❌ Only have $${from.cash.toLocaleString()} cash`;

  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === from.id) return '❌ Cannot pay yourself.';

  const to = resolved.player;
  const tx = applyTransferTax(from, amount); // city tax — receiver gets the net
  from.cash -= amount;
  to.cash += tx.net;
  savePlayer(from);
  savePlayer(to);
  const tax = taxLine(tx);
  return `▸ Paid $${amount.toLocaleString()} → ...${resolved.id.slice(-6)}\n${tax ? tax + '\n▸ They received $' + tx.net.toLocaleString() + '\n' : ''}💰 Your cash $${from.cash.toLocaleString()}`;
}
