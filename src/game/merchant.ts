/**
 * FISCH Gold → Syndicates cash exchange.
 * Gold stays on FischPlayer; cash uses existing economy grantMoney.
 */
import type { Player } from './player.js';
import { getFischPlayer } from './fisch.js';
import { grantMoney } from './economy.js';
import { savePlayer } from './player.js';
import { addRep } from './reputation.js';

/** 50 FISCH gold → $1 Syndicates cash (fixed, anti-inflation). */
export const GOLD_PER_DOLLAR = 50;
export const MIN_EXCHANGE_GOLD = 50;

const busy = new Set<string>();

export function formatMerchant(player: Player): string {
  const f = getFischPlayer(player.id);
  const gold = Math.max(0, Math.floor(f.gold || 0));
  const cashOut = Math.floor(gold / GOLD_PER_DOLLAR);
  return [
    '💰 *FISCH MERCHANT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Your Gold: *${gold.toLocaleString()}* 🪙`,
    `Rate: *${GOLD_PER_DOLLAR}g → $1*`,
    cashOut > 0
      ? `Max exchange now: *$${cashOut.toLocaleString()}*`
      : `_Need at least ${MIN_EXCHANGE_GOLD}g to exchange_`,
    '',
    '▸ `.merchant exchange` — convert all eligible gold',
    '▸ `.merchant exchange <gold>` — convert a specific amount',
    '',
    '_Gold from the sea. Cash for the city._',
  ].join('\n');
}

/**
 * Exchange gold → cash. Amount in gold units; if omitted, max eligible.
 */
export function exchangeGold(player: Player, goldAmount?: number): string {
  if (busy.has(player.id)) return '⏳ Exchange already processing…';
  busy.add(player.id);
  try {
    const f = getFischPlayer(player.id);
    const available = Math.max(0, Math.floor(f.gold || 0));
    let spend =
      goldAmount == null || !Number.isFinite(goldAmount)
        ? available - (available % GOLD_PER_DOLLAR)
        : Math.floor(goldAmount);

    if (spend < MIN_EXCHANGE_GOLD) {
      return `⚠️ Minimum exchange is ${MIN_EXCHANGE_GOLD}g (you have ${available.toLocaleString()}g).`;
    }
    if (spend > available) {
      return `⚠️ Not enough gold. You have ${available.toLocaleString()}g.`;
    }
    // Align to rate so we never leave fractional dollar issues
    spend = spend - (spend % GOLD_PER_DOLLAR);
    if (spend < MIN_EXCHANGE_GOLD) {
      return `⚠️ Amount must be a multiple of ${GOLD_PER_DOLLAR}g.`;
    }

    const dollars = Math.floor(spend / GOLD_PER_DOLLAR);
    if (dollars <= 0) return '⚠️ Nothing to exchange.';

    // Deduct gold first
    f.gold = available - spend;
    if (f.gold < 0) {
      f.gold = available;
      return '⚠️ Exchange aborted — gold validation failed.';
    }

    grantMoney({
      player,
      amount: dollars,
      source: 'MERCHANT',
      reason: `Exchanged ${spend} FISCH gold`,
      metadata: { goldSpent: spend, rate: GOLD_PER_DOLLAR },
    });
    savePlayer(player);
    try {
      addRep(player, 1, 'merchant');
    } catch {}

    return [
      '💰 *EXCHANGE COMPLETE*',
      `−${spend.toLocaleString()} 🪙 gold`,
      `+$${dollars.toLocaleString()} cash`,
      `Gold left: *${Math.floor(f.gold).toLocaleString()}* 🪙`,
    ].join('\n');
  } finally {
    busy.delete(player.id);
  }
}
