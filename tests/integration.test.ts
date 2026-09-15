import { describe, expect, it } from 'vitest';
import { processIncomingMessage } from '../src/connection/messageRouter.js';
import { ensurePlayer, handleCommand } from '../src/commands/commandRegistry.js';
import { createPlayer } from '../src/game/player.js';
import { createLoan } from '../src/game/economy.js';

describe('real WhatsApp game flows', () => {
  it('routes a real .profile message through the command pipeline', () => {
    const result = processIncomingMessage('.profile', 'flow-user-1', 'private');
    expect(result.command).toBe('profile');
    expect(result.response).toContain('Role:');
    expect(result.response).toContain('Level:');
  });

  it('supports a complete player economy flow', () => {
    const player = createPlayer('flow-user-2', 'Flow', 'Businessman');
    player.cash = 250000;
    const loan = createLoan(player, 150000);
    expect(loan.amount).toBeGreaterThan(0);
    expect(player.debt).toBeGreaterThan(0);

    const profile = handleCommand('.profile', 'flow-user-2');
    expect(profile).toContain('Role:');

    const business = handleCommand('.biz buy Convenience Store', 'flow-user-2');
    expect(business).toContain('Purchased');

    const collect = handleCommand('.collect', 'flow-user-2');
    expect(collect).toContain('Collected');
  });

  it('supports a complete crypto flow and keeps state in the registry', () => {
    const player = ensurePlayer('flow-user-3', 'Trader', 'Businessman');
    player.cash = 500000;

    const result = handleCommand('.crypto price DYNA', 'flow-user-3');
    expect(result).toContain('DYNA');

    const buy = handleCommand('.crypto buy DYNA 10', 'flow-user-3');
    expect(buy).toContain('Purchased');

    const portfolio = handleCommand('.crypto portfolio', 'flow-user-3');
    expect(portfolio).toContain('DYNA');
  });

  it('supports a real clan creation flow and enforces level 30 minimum', () => {
    const lowLevel = handleCommand('.clan create Low Level', 'flow-user-4-clan-low');
    expect(lowLevel).toContain('level 30');

    const player = ensurePlayer('flow-user-5-clan-ready', 'Boss', 'Mafia');
    player.level = 30;
    player.displayName = 'Boss';
    const created = handleCommand('.clan create Black Meridian', 'flow-user-5-clan-ready');
    expect(created).toContain('Clan created');
  });
});
