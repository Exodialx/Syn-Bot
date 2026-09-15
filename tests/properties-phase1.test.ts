import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/game/player.js';
import {
  PROPERTY_CATALOG,
  buyProperty,
  calculatePropertyIncome,
  calculatePropertyValue,
  collectPropertyIncome,
  getPortfolioSummary,
  getPropertyById,
  getPropertyByName,
  getPropertyLocation,
  payPropertyMortgage,
  sellProperty,
  upgradeProperty,
  createPropertyMortgage,
  getPropertyExpenses
} from '../src/game/properties.js';

describe('property phase 1', () => {
  it('catalog has at least 75 distinct properties with real identities', () => {
    expect(PROPERTY_CATALOG.length).toBeGreaterThanOrEqual(75);
    expect(new Set(PROPERTY_CATALOG.map(item => item.id)).size).toBe(PROPERTY_CATALOG.length);
    expect(new Set(PROPERTY_CATALOG.map(item => item.name)).size).toBe(PROPERTY_CATALOG.length);
    expect(PROPERTY_CATALOG.every(item => item.location && item.category && item.tier)).toBe(true);
  });

  it('buys, saves, and values a property without direct cash mutation', () => {
    const player = createPlayer('prop-1', 'Investor', 'Businessman');
    player.cash = 500000;

    const property = PROPERTY_CATALOG.find(item => item.category === 'RESIDENTIAL')!;
    const result = buyProperty(player, property.id);

    expect(result.owned).toBe(true);
    expect(result.state).toBeDefined();
    expect(player.properties).toContain(property.id);
    expect(player.cash).toBeLessThan(500000);
    expect(result.state!.currentValue).toBeGreaterThan(0);
    expect(player.propertyState?.[property.id]?.status).toBe('ACTIVE');
  });

  it('duplicate purchase is blocked and sale returns value through economy', () => {
    const player = createPlayer('prop-2', 'Landlord', 'Businessman');
    player.cash = 1000000;

    const property = PROPERTY_CATALOG.find(item => item.category === 'COMMERCIAL')!;
    const first = buyProperty(player, property.id);
    const second = buyProperty(player, property.id);

    expect(first.owned).toBe(true);
    expect(second.owned).toBe(false);

    const sale = sellProperty(player, property.id);
    expect(sale.success).toBe(true);
    expect(player.properties.includes(property.id)).toBe(false);
  });

  it('income, expenses, and portfolio metrics are real and bounded', () => {
    const player = createPlayer('prop-3', 'Investor', 'Businessman');
    player.cash = 750000;
    const property = PROPERTY_CATALOG.find(item => item.category === 'HOSPITALITY')!;
    buyProperty(player, property.id);

    const snapshot = calculatePropertyIncome(player, property.id, Date.now() + 60 * 60 * 1000);
    const expenseSummary = getPropertyExpenses(player, property.id);
    const portfolio = getPortfolioSummary(player);

    expect(snapshot.grossIncome).toBeGreaterThan(0);
    expect(snapshot.netIncome).toBeGreaterThanOrEqual(0);
    expect(expenseSummary.totalExpenses).toBeGreaterThanOrEqual(0);
    expect(portfolio.totalProperties).toBeGreaterThanOrEqual(1);
    expect(portfolio.totalValue).toBeGreaterThan(0);
  });

  it('upgrades and mortgages change the real property state', () => {
    const player = createPlayer('prop-4', 'Developer', 'Businessman');
    player.cash = 1500000;
    const property = PROPERTY_CATALOG.find(item => item.category === 'CORPORATE')!;
    buyProperty(player, property.id);

    const upgraded = upgradeProperty(player, property.id, 'RENTAL');
    expect(upgraded.success).toBe(true);
    expect(player.propertyState?.[property.id]?.rentalLevel).toBeGreaterThan(0);

    const mortgage = createPropertyMortgage(player, property.id, { downPayment: 200000, principal: 600000, rate: 0.09, termMonths: 36 });
    expect(mortgage.success).toBe(true);
    expect(player.propertyState?.[property.id]?.mortgage?.outstandingBalance).toBeGreaterThan(0);

    const payment = payPropertyMortgage(player, property.id, 15000);
    expect(payment.success).toBe(true);
  });

  it('location and value calculations are meaningful and bounded', () => {
    const downtown = getPropertyLocation('Downtown');
    const waterfront = getPropertyLocation('Waterfront');
    const home = getPropertyByName('Studio Apartment');

    expect(downtown).toBeTruthy();
    expect(waterfront).toBeTruthy();
    expect(home).toBeTruthy();

    const value = calculatePropertyValue(home!, { level: 1, securityLevel: 1, developmentLevel: 0, status: 'ACTIVE' } as any);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(Infinity);
    expect(getPropertyById(home!.id)).toBeTruthy();
  });

  it('awards xp on successful property purchase, upgrade, and collection for businessmen', () => {
    const player = createPlayer('prop-progression-1', 'Investor', 'Businessman');
    player.cash = 5000000;
    const property = PROPERTY_CATALOG.find(item => item.category === 'RESIDENTIAL')!;

    const purchased = buyProperty(player, property.id);
    expect(purchased.owned).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(150);
    expect(player.classXp).toBeGreaterThanOrEqual(50);

    const upgraded = upgradeProperty(player, property.id, 'RENTAL');
    expect(upgraded.success).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(250);
    expect(player.classXp).toBeGreaterThanOrEqual(85);

    const beforeIncome = player.cash;
    const collected = collectPropertyIncome(player, property.id, Date.now() + 60 * 60 * 1000);
    expect(collected.collected).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(275);
    expect(player.cash).toBeGreaterThan(beforeIncome);
  });

  it('zero rate mortgages are finite and mortgage payments reduce debt correctly', () => {
    const player = createPlayer('prop-mortgage-1', 'Investor', 'Businessman');
    player.cash = 5000000;
    const property = PROPERTY_CATALOG.find(item => item.category === 'COMMERCIAL')!;
    buyProperty(player, property.id);

    const mortgage = createPropertyMortgage(player, property.id, { downPayment: 100000, principal: 300000, rate: 0, termMonths: 12 });
    expect(mortgage.success).toBe(true);
    expect(Number.isFinite(mortgage.mortgage!.paymentAmount)).toBe(true);
    expect(mortgage.mortgage!.paymentAmount).toBe(25000);

    const oldDebt = player.debt;
    const payment = payPropertyMortgage(player, property.id, 15000);
    expect(payment.success).toBe(true);
    expect(player.debt).toBeLessThan(oldDebt);
    expect(player.debt).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(player.debt)).toBe(true);
  });
});
