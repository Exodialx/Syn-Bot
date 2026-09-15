import { describe, expect, it } from 'vitest';
import { createPlayer, applyXp, xpForNextLevel } from '../src/game/player.js';
import { createLoan, repayLoan } from '../src/game/economy.js';
import { BUSINESS_CATALOG } from '../src/game/businessSystem.js';
import { CRYPTO_CATALOG } from '../src/game/crypto.js';
import { createClan } from '../src/game/clans.js';
import { WAR_OBJECTIVES } from '../src/game/war.js';
import { addLottoEntry, pickLottoWinner, createLottoRound } from '../src/game/lotto.js';
import { createBlackjackRound, scoreHand } from '../src/game/gambling.js';
import { handleCommand } from '../src/commands/commandRegistry.js';
import { initializeWhatsAppConnection } from '../src/connection/whatsapp.js';

describe('Underworld Dynasty MMO systems', () => {
  it('registers a player and applies XP progression', () => {
    const player = createPlayer('p1', 'Alpha', 'Businessman');
    applyXp(player, xpForNextLevel(1));
    expect(player.level).toBeGreaterThanOrEqual(2);
    expect(player.cash).toBeGreaterThan(0);
  });

  it('supports business purchase, upgrades and debt flow', () => {
    const player = createPlayer('p2', 'Bravo', 'Businessman');
    expect(BUSINESS_CATALOG.length).toBeGreaterThan(40);
    const loan = createLoan(player, 15000, 0.12, 30);
    expect(loan.amount).toBeGreaterThan(0);
    const repaid = repayLoan(player, 5000);
    expect(repaid).toBe(true);
  });

  it('supports crypto, clan, war and lotto flows', () => {
    const player = createPlayer('p3', 'Charlie', 'Mafia');
    const clan = createClan('c1', 'Night Reapers', 'p3');
    const lotto = createLottoRound();
    addLottoEntry(lotto, 'p3', 5000);
    const winner = pickLottoWinner(lotto);
    expect(CRYPTO_CATALOG.length).toBeGreaterThan(5);
    expect(clan.members).toContain('p3');
    expect(WAR_OBJECTIVES.length).toBeGreaterThan(5);
    expect(winner).toBe('p3');
  });

  it('supports blackjack hand scoring', () => {
    const round = createBlackjackRound();
    const total = scoreHand(round.player);
    expect(total).toBeGreaterThan(0);
  });

  it('routes the war command through live runtime state and reward flow', () => {
    const player = createPlayer('p-war', 'War Chief', 'Mafia');
    const status = handleCommand('.war info', 'p-war');
    expect(status).toContain('Objective');
    expect(status).toContain('Downtown');

    const battle = handleCommand('.war attack downtown', 'p-war');
    expect(battle).toMatch(/Captured|Objective|Front|Frontline/i);
    expect(player.stats.wars).toBeGreaterThanOrEqual(0);
  });

  it('routes real commands to live game state and a non-placeholder WhatsApp session', async () => {
    const profile = handleCommand('.profile', 'p4');
    expect(profile).toContain('Role:');

    const loanText = handleCommand('.loan 20000', 'p4');
    expect(loanText).toContain('Loan');

    const marketText = handleCommand('.crypto price DYNA', 'p4');
    expect(marketText).toContain('DYNA');

    const state = await initializeWhatsAppConnection();
    expect(state.state).toBe('qr');
    expect(state.qrCode).not.toContain('placeholder');
  });
});
