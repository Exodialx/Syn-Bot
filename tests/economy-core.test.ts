import { describe, expect, it } from 'vitest';
import { handleCommand, getPlayerById } from '../src/commands/commandRegistry.js';
import { createPlayer } from '../src/game/player.js';
import {
  chargeMoney,
  createLoan,
  creditMoney,
  depositToBank,
  getPlayerBalanceSnapshot,
  getTotalDebt,
  grantMoney,
  repayLoan,
  transferMoney,
  withdrawFromBank,
  hydrateEconomyState,
  type EconomyTransaction
} from '../src/game/economy.js';

describe('economy foundation', () => {
  it('credits and debits cash atomically with transaction records', () => {
    const player = createPlayer('eco-1', 'Ledger', 'Businessman');
    const before = player.cash;

    const credit = grantMoney({ player, amount: 2500, source: 'REWARD', reason: 'bonus' });
    expect(credit.amount).toBe(2500);
    expect(player.cash).toBe(before + 2500);
    expect(player.economyLedger.some(entry => entry.id === credit.id)).toBe(true);

    const charge = chargeMoney({ player, amount: 1000, source: 'OTHER', reason: 'expense' });
    expect(charge.amount).toBe(1000);
    expect(player.cash).toBe(before + 1500);
    expect(player.economyLedger.some(entry => entry.id === charge.id)).toBe(true);
  });

  it('prevents duplicate payouts and invalid money values', () => {
    const player = createPlayer('eco-2', 'Dup', 'Businessman');
    const reward = grantMoney({ player, amount: 750, source: 'QUEST', reason: 'repeatable reward', transactionId: 'reward-dup-1' });

    expect(() => grantMoney({ player, amount: 750, source: 'QUEST', reason: 'duplicate', transactionId: 'reward-dup-1' })).toThrow(/duplicate|Duplicate/i);
    expect(() => grantMoney({ player, amount: Number.NaN, source: 'QUEST', reason: 'bad' })).toThrow();
    expect(() => chargeMoney({ player, amount: -1, source: 'OTHER', reason: 'bad' })).toThrow();
    expect(player.cash).toBeGreaterThanOrEqual(reward.amount);
  });

  it('supports deposits, withdrawals, and transfers without negative balances', () => {
    const sender = createPlayer('eco-3', 'Sender', 'Businessman');
    const recipient = createPlayer('eco-4', 'Recipient', 'Businessman');

    sender.cash = 10_000;
    recipient.cash = 1_000;

    const deposit = depositToBank({ player: sender, amount: 2000, reason: 'save cash' });
    expect(deposit.amount).toBe(2000);
    expect(sender.cash).toBe(8000);
    expect(sender.bank).toBeGreaterThan(0);

    const bankBeforeWithdraw = sender.bank;
    const withdraw = withdrawFromBank({ player: sender, amount: 500, reason: 'cash withdrawal' });
    expect(withdraw.amount).toBe(500);
    expect(sender.bank).toBeLessThan(bankBeforeWithdraw);

    const transfer = transferMoney({ sender, recipient, amount: 1000, reason: 'split' });
    expect(transfer.amount).toBe(1000);
    expect(sender.cash).toBeGreaterThanOrEqual(0);
    expect(recipient.cash).toBeGreaterThanOrEqual(1000);
    expect(() => transferMoney({ sender, recipient, amount: 999999999, reason: 'overspend' })).toThrow();
  });

  it('creates real loans and tracks debt and balance snapshots', () => {
    const player = createPlayer('eco-5', 'Borrower', 'Businessman');
    player.cash = 25_000;
    player.credit = 8000;

    const loan = createLoan(player, 12_000, 0.12, 30);
    expect(loan.amount).toBe(12_000);
    expect(player.bank).toBeGreaterThanOrEqual(12_000);
    expect(getTotalDebt(player)).toBe(12_000);

    const snapshot = getPlayerBalanceSnapshot(player);
    expect(snapshot.cash).toBe(player.cash);
    expect(snapshot.bank).toBe(player.bank);
    expect(snapshot.totalLiabilities).toBeGreaterThanOrEqual(player.debt);
    expect(snapshot.netWorth).toBeGreaterThanOrEqual(0);

    const repaid = repayLoan(player, 5000);
    expect(repaid).toBe(true);
    expect(player.debt).toBeLessThan(12_000);
  });

  it('hydrates legacy players with missing economy fields safely', () => {
    const player = createPlayer('eco-6', 'Legacy', 'Businessman');
    player.economyLedger = undefined as any;
    player.loans = undefined as any;
    const hydrated = hydrateEconomyState(player);
    expect(Array.isArray(hydrated.economyLedger)).toBe(true);
    expect(Array.isArray(hydrated.loans)).toBe(true);
    expect(hydrated.cash).toBeGreaterThanOrEqual(0);
  });

  it('keeps bank and cash separate in whole balances', () => {
    const player = createPlayer('eco-7', 'Banker', 'Businessman');
    player.cash = 5_000;
    player.bank = 8_000;

    const snapshot = getPlayerBalanceSnapshot(player);
    expect(snapshot.cash).toBe(5000);
    expect(snapshot.bank).toBe(8000);
    expect(snapshot.totalLiquid).toBe(13000);
    expect(snapshot.totalAssets).toBeGreaterThanOrEqual(13000);
  });

  it('records structured transactions with source metadata', () => {
    const player = createPlayer('eco-8', 'Meta', 'Businessman');
    const tx = grantMoney({ player, amount: 500, source: 'ADMIN', reason: 'test grant', metadata: { category: 'reward' } });
    expect(tx.source).toBe('ADMIN');
    expect(tx.metadata?.category).toBe('reward');
    expect(player.economyLedger.at(-1)?.id).toBe(tx.id);
  });

  it('routes market purchases through the economy ledger', () => {
    const playerId = `market-eco-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    handleCommand('.start', playerId);
    const player = getPlayerById(playerId)!;
    player.cash = 5000;
    const beforeCash = player.cash;

    const result = handleCommand('.market buy Steel', playerId);
    const savedPlayer = getPlayerById(playerId)!;

    expect(result).toContain('Bought Steel');
    expect(savedPlayer.cash).toBeLessThan(beforeCash);
    expect(savedPlayer.economyLedger.some(tx => tx.source === 'TRADE' && tx.reason.includes('Steel'))).toBe(true);
  });
});
