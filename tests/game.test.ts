import { describe, expect, it } from 'vitest';
import { BUSINESS_CATALOG, parseCommand, createPlayer, getRoleInfo } from '../src/index.js';

describe('Underworld Dynasty core systems', () => {
  it('parses aliases and segment arguments correctly', () => {
    const parsed = parseCommand('.biz upgrade 2');
    expect(parsed.command).toBe('biz');
    expect(parsed.alias).toBe('business');
    expect(parsed.args).toEqual(['upgrade', '2']);
  });

  it('creates a business role correctly', () => {
    const player = createPlayer('12345', 'Businessman');
    expect(player.role).toBe('Businessman');
    expect(player.level).toBe(1);
    expect(player.cash).toBeGreaterThanOrEqual(4000);
  });

  it('includes a large business catalog and role bonuses', () => {
    expect(BUSINESS_CATALOG.length).toBeGreaterThan(50);
    const role = getRoleInfo('Mafia');
    expect(role.specialization).toContain('combat');
  });
});
