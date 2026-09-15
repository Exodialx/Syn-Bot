import { describe, expect, it } from 'vitest';
import { getPlayerById, handleCommand } from '../src/commands/commandRegistry.js';
import { createPlayer } from '../src/game/player.js';
import { CLASS_LEVEL_CAP, GENERAL_LEVEL_CAP, grantClassXp, grantXp, hydratePlayerProgression } from '../src/game/progression.js';

describe('progression phase 1', () => {
  it('adds the required player progression fields and caps', () => {
    const player = createPlayer('progression-player-1', 'Test Pilot');

    expect(player.level).toBe(1);
    expect(player.xp).toBe(0);
    expect(player.lifetimeXp).toBe(0);
    expect(player.classLevel).toBe(1);
    expect(player.classXp).toBe(0);
    expect(GENERAL_LEVEL_CAP).toBe(30);
    expect(CLASS_LEVEL_CAP).toBe(10);
  });

  it('awards lifetime xp through the centralized grant system with duplicate protection', () => {
    const player = createPlayer('progression-player-2', 'Test Pilot');
    const first = grantXp(player, 150, 'JOB', 'event-1');
    const duplicate = grantXp(player, 150, 'JOB', 'event-1');

    expect(first.duplicate).toBe(false);
    expect(first.granted).toBeGreaterThan(0);
    expect(duplicate.duplicate).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThan(0);
    expect(player.level).toBeGreaterThanOrEqual(1);
  });

  it('calculates cumulative class xp thresholds correctly across every boundary and multi-level grants', () => {
    const thresholds = [100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];
    for (const [index, threshold] of thresholds.entries()) {
      const player = createPlayer(`class-threshold-${index + 1}`, 'Test Pilot');
      const result = grantClassXp(player, threshold, 'BUSINESS', `class-threshold-${index + 1}`);
      expect(result.granted).toBe(threshold);
      expect(player.classXp).toBe(threshold);
      expect(player.classLevel).toBe(index + 2);
    }

    const multi = createPlayer('class-multi', 'Test Pilot');
    const result = grantClassXp(multi, 1500, 'BUSINESS', 'class-multi');
    expect(result.granted).toBe(1500);
    expect(multi.classXp).toBe(1500);
    expect(multi.classLevel).toBe(7);

    const overshoot = createPlayer('class-overshoot', 'Test Pilot');
    const overshootResult = grantClassXp(overshoot, 5000, 'BUSINESS', 'class-overshoot');
    expect(overshootResult.granted).toBe(5000);
    expect(overshoot.classXp).toBe(5000);
    expect(overshoot.classLevel).toBe(CLASS_LEVEL_CAP);
  });

  it('keeps class xp cumulative while preserving duplicate protection', () => {
    const player = createPlayer('progression-player-3', 'Test Pilot');
    const first = grantClassXp(player, 5000, 'BUSINESS', 'class-event-1');
    const duplicate = grantClassXp(player, 5000, 'BUSINESS', 'class-event-1');

    expect(first.duplicate).toBe(false);
    expect(first.granted).toBe(5000);
    expect(player.classXp).toBe(5000);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.granted).toBe(0);

    const capped = createPlayer('progression-player-4', 'Test Pilot');
    capped.classLevel = CLASS_LEVEL_CAP;
    capped.classXp = 999999;
    const finalState = hydratePlayerProgression(capped);
    expect(finalState.classLevel).toBeLessThanOrEqual(CLASS_LEVEL_CAP);
  });

  it('exposes progression data through the command layer', () => {
    const profile = handleCommand('.profile', 'progression-player-5');
    const level = handleCommand('.level', 'progression-player-5');
    const xp = handleCommand('.xp', 'progression-player-5');
    const classInfo = handleCommand('.class', 'progression-player-5');

    expect(profile).toContain('Level');
    expect(level).toContain('Level');
    expect(xp).toContain('Lifetime');
    expect(classInfo).toContain('Class');
  });

  it('awards quest XP through the centralized progression authority', () => {
    const id = `quest-authority-${Date.now()}`;
    handleCommand('.quest claim', id);
    const player = getPlayerById(id)!;

    expect(player.lifetimeXp).toBeGreaterThan(0);
    expect(player.xp).toBeGreaterThanOrEqual(0);
    expect(player.history.some(entry => entry.includes('Quest') || entry.includes('quest'))).toBe(true);
  });

  it('applies Businessman purchase cost discounts through the command runtime', () => {
    const id = `biz-discount-${Date.now()}`;
    const player = createPlayer(id, 'Business Pilot', 'Businessman');
    player.classLevel = 7;
    player.cash = 200000;
    player.businesses = [];

    const result = handleCommand('.biz buy Supermarket', id);

    expect(result).toContain('Purchased Supermarket');
    expect(player.cash).toBeLessThan(200000);
    expect(player.cash).toBe(200000 - Number((22000 * 0.98).toFixed(2)));
  });
});
