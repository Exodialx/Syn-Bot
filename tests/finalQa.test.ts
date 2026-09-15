import { describe, expect, it } from 'vitest';
import { COMMAND_MATRIX, MENU_GROUPS, GUIDE_TOPICS } from '../src/game/commandCatalog.js';
import { getPlayerById, handleCommand } from '../src/commands/commandRegistry.js';
import { processIncomingMessage } from '../src/connection/messageRouter.js';

const REQUIRED_COMMANDS = [
  'start', 'menu', 'help', 'guide', 'profile', 'status', 'stats', 'balance', 'inventory',
  'biz', 'collect', 'production', 'expenses', 'property', 'vehicle', 'loan', 'debt', 'assets',
  'invest', 'market', 'trade', 'crypto', 'jobs', 'quests', 'explore', 'events', 'clan',
  'combat', 'rob', 'raid', 'heist', 'wanted', 'hit', 'contracts', 'bounty', 'blackjack',
  'gamble', 'lotto', 'war', 'leaderboard', 'ping', 'rules', 'moderation', 'admin'
] as const;

describe('final command QA', () => {
  it('keeps the command catalog aligned with the real command surface', () => {
    const actualCommands = new Set(COMMAND_MATRIX.map(entry => entry.command));
    const allAliases = new Set(COMMAND_MATRIX.flatMap(entry => entry.aliases));

    for (const command of REQUIRED_COMMANDS) {
      expect(actualCommands.has(command) || allAliases.has(command)).toBeTruthy();
    }

    const menuText = Object.values(MENU_GROUPS).join(' ');
    const guideText = GUIDE_TOPICS.join(' ');
    const allCatalogTokens = new Set(Array.from(actualCommands).concat(Array.from(allAliases)));

    const guideTopics = new Map([
      ['.biz', 'business'],
      ['.loan', 'loans'],
      ['.crypto', 'crypto'],
      ['.clan', 'clan'],
      ['.war', 'war'],
      ['.leaderboard', 'leaderboard'],
      ['.blackjack', 'blackjack'],
      ['.lotto', 'lotto']
    ]);

    for (const [token, topic] of guideTopics.entries()) {
      expect(menuText.includes(token)).toBeTruthy();
      expect(guideText.toLowerCase()).toContain(topic);
    }

    expect(COMMAND_MATRIX.length).toBeGreaterThan(40);
    expect(COMMAND_MATRIX.length).toBeLessThan(140);
    expect(new Set(COMMAND_MATRIX.map(entry => entry.command)).size).toBe(COMMAND_MATRIX.length);
    expect(allCatalogTokens.size).toBeGreaterThan(25);
  });

  it('routes actual WhatsApp inputs to real persisted state', () => {
    const profileId = `qa-profile-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const loanId = `qa-loan-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cryptoId = `qa-crypto-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clanId = `qa-clan-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const profile = processIncomingMessage('.profile', profileId, 'private');
    expect(profile.command).toBe('profile');
    expect(profile.response).toContain('Role:');

    const loan = processIncomingMessage('.loan 100000', loanId, 'private');
    expect(loan.response).toContain('Loan');

    const ensuredCryptoPlayer = getPlayerById(cryptoId) ?? handleCommand('.start', cryptoId);
    const currentCryptoPlayer = getPlayerById(cryptoId)!;
    currentCryptoPlayer.cash = 500000;

    const crypto = processIncomingMessage('.crypto buy DYNA 100', cryptoId, 'private');
    expect(crypto.response).toContain('Purchased');
    expect(ensuredCryptoPlayer).toBeTruthy();

    const clan = processIncomingMessage('.clan create Black Meridian', clanId, 'private');
    expect(clan.response).toContain('level 30');
  });

  it('keeps real gameplay commands from becoming dead menu text', () => {
    const responses = [
      handleCommand('.menu', 'qa-1'),
      handleCommand('.help', 'qa-1'),
      handleCommand('.guide', 'qa-1'),
      handleCommand('.profile', 'qa-1'),
      handleCommand('.balance', 'qa-1'),
      handleCommand('.biz list', 'qa-1'),
      handleCommand('.loan 10000', 'qa-1'),
      handleCommand('.crypto price DYNA', 'qa-1'),
      handleCommand('.clan create Audit Crew', 'qa-1'),
      handleCommand('.lotto bet 1000', 'qa-1')
    ];

    for (const response of responses) {
      expect(response).not.toContain('TODO');
      expect(response).not.toContain('placeholder');
      expect(response).not.toContain('coming soon');
    }
  });
});
