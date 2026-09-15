import { describe, expect, it } from 'vitest';
import { COMMAND_MATRIX } from '../src/game/commandCatalog.js';
import { handleCommand } from '../src/commands/commandRegistry.js';
import { parseCommand } from '../src/game/commandParser.js';

describe('command matrix audit', () => {
  it('ensures core advertised commands are in the registry and parse cleanly', () => {
    const commands = ['start', 'menu', 'help', 'guide', 'profile', 'stats', 'balance', 'biz', 'loan', 'crypto', 'clan', 'war', 'blackjack', 'lotto'];

    for (const command of commands) {
      const parsed = parseCommand(`.${command}`);
      const entry = COMMAND_MATRIX.find(item => item.command === command || item.aliases.includes(command));
      expect(parsed.command).toBeTruthy();
      expect(entry).toBeTruthy();
    }
  });

  it('ensures major handlers return real responses instead of placeholders', () => {
    const responses = [
      handleCommand('.menu', 'audit-1'),
      handleCommand('.help', 'audit-1'),
      handleCommand('.guide', 'audit-1'),
      handleCommand('.profile', 'audit-1'),
      handleCommand('.balance', 'audit-1'),
      handleCommand('.biz list', 'audit-1'),
      handleCommand('.loan 10000', 'audit-1'),
      handleCommand('.crypto price DYNA', 'audit-1'),
      handleCommand('.clan create Audit Crew', 'audit-1'),
      handleCommand('.lotto bet 1000', 'audit-1')
    ];

    for (const response of responses) {
      expect(response).not.toContain('TODO');
      expect(response).not.toContain('placeholder');
      expect(response).not.toContain('coming soon');
    }
  });
});
