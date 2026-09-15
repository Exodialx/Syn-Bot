import { describe, expect, it } from 'vitest';
import { handleCommand } from '../src/commands/commandRegistry.js';
import { createPlayer } from '../src/game/player.js';
import {
  BUSINESS_CATALOG,
  calculateBusinessOperatingSnapshot,
  createBusinessRuntime,
  hireBusinessStaff,
  fireBusinessStaff,
  collectBusinessRevenue,
  calculateSupplyChainBonus,
  getBusinessCondition,
  getPlayerBusinessPortfolio,
  type BusinessRuntimeState
} from '../src/game/businessSystem.js';

describe('business phase 2', () => {
  it('builds operating snapshots with bounded capacity and profit', () => {
    const template = BUSINESS_CATALOG.find(entry => entry.name === 'Coffee Shop')!;
    const runtime = createBusinessRuntime(template);
    const snapshot = calculateBusinessOperatingSnapshot(template, runtime);

    expect(snapshot.baseCapacity).toBeGreaterThan(0);
    expect(snapshot.effectiveCapacity).toBeGreaterThan(0);
    expect(snapshot.capacityUtilization).toBeGreaterThanOrEqual(0);
    expect(snapshot.capacityUtilization).toBeLessThanOrEqual(1);
    expect(snapshot.grossRevenue).toBeGreaterThanOrEqual(0);
    expect(snapshot.netProfit).toBeLessThanOrEqual(snapshot.grossRevenue);
    expect(snapshot.efficiencyScore).toBeGreaterThan(0);
    expect(snapshot.efficiencyScore).toBeLessThanOrEqual(100);
  });

  it('hiring and firing staff affect output, costs, and revenue', () => {
    const player = createPlayer('biz-ops-1', 'Operator', 'Businessman');
    const template = BUSINESS_CATALOG.find(entry => entry.name === 'Factory')!;
    const runtime = createBusinessRuntime(template);

    player.cash = 250000;
    const hired = hireBusinessStaff(player, template.name, 'workers', 8, true);
    expect(hired).toBe(true);
    expect(runtime.staff.workers).toBeGreaterThanOrEqual(8);

    const fired = fireBusinessStaff(player, template.name, 'workers', 4);
    expect(fired).toBe(true);

    const result = collectBusinessRevenue(player, template.name);
    expect(result.grossRevenue).toBeGreaterThanOrEqual(0);
    expect(result.netProfit).toBeGreaterThanOrEqual(0);
  });

  it('supply-chain bonuses stay bounded and portfolio metrics are meaningful', () => {
    const bonus = calculateSupplyChainBonus(['Factory', 'Logistics Corporation']);
    expect(bonus).toBeGreaterThan(1);
    expect(bonus).toBeLessThan(1.5);

    const portfolio = getPlayerBusinessPortfolio(['Factory', 'Coffee Shop', 'Software Company']);
    expect(portfolio.totalBusinesses).toBe(3);
    expect(portfolio.typeMix.industrial).toBeGreaterThanOrEqual(0);
    expect(portfolio.typeMix.retail).toBeGreaterThanOrEqual(0);
    expect(portfolio.typeMix.technology).toBeGreaterThanOrEqual(0);
    expect(portfolio.highestRevenue).toBeGreaterThanOrEqual(0);
  });

  it('business conditions degrade gracefully and never become impossible', () => {
    const template = BUSINESS_CATALOG.find(entry => entry.name === 'Coffee Shop')!;
    const runtime = createBusinessRuntime(template);
    const condition = getBusinessCondition(runtime);

    expect(['OPTIMAL', 'NORMAL', 'STRUGGLING', 'CRITICAL']).toContain(condition);
    expect(runtime.condition).toBe(condition);
  });

  it('awards xp on successful purchase and collection for businessmen', () => {
    const player = createPlayer('biz-progression-1', 'Businessman', 'Businessman');
    const template = BUSINESS_CATALOG.find(entry => entry.name === 'Convenience Store')!;
    player.cash = template.purchaseCost * 5;

    const purchase = handleCommand(`.biz buy ${template.name}`, player.id);
    expect(purchase).toContain('Purchased');
    expect(player.lifetimeXp).toBeGreaterThan(0);
    expect(player.classXp).toBeGreaterThan(0);

    const preCollection = player.cash;
    const result = collectBusinessRevenue(player, template.name);
    expect(result.netProfit).toBeGreaterThanOrEqual(0);
    expect(player.lifetimeXp).toBeGreaterThan(100);
    expect(player.classXp).toBeGreaterThan(50);
    expect(player.cash).toBeGreaterThanOrEqual(preCollection);
  });

  it('does not award business xp on failed purchase', () => {
    const player = createPlayer('biz-fail', 'Businessman', 'Businessman');
    const template = BUSINESS_CATALOG.find(entry => entry.name === 'Convenience Store')!;
    player.cash = 1000;

    const beforeLifetime = player.lifetimeXp;
    const beforeClassXp = player.classXp;
    const result = handleCommand(`.biz buy ${template.name}`, player.id);
    expect(result).toContain('Not enough cash');
    expect(player.lifetimeXp).toBe(beforeLifetime);
    expect(player.classXp).toBe(beforeClassXp);
  });
});
