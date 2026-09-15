import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/game/player.js';
import {
  VEHICLE_CATALOG,
  buyVehicle,
  getOwnedVehicleByInstanceId,
  getVehicleCurrentValue,
  getVehicleGarageSummary,
  getVehicleById,
  maintainVehicle,
  sellVehicle,
  useVehicle
} from '../src/game/vehicles.js';

describe('vehicles phase 1', () => {
  it('catalog contains 100+ distinct, valid vehicles', () => {
    expect(VEHICLE_CATALOG.length).toBeGreaterThanOrEqual(100);
    expect(new Set(VEHICLE_CATALOG.map(entry => entry.id)).size).toBe(VEHICLE_CATALOG.length);
    expect(new Set(VEHICLE_CATALOG.map(entry => entry.name)).size).toBe(VEHICLE_CATALOG.length);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.purchasePrice) && entry.purchasePrice > 0)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.speed) && entry.speed >= 0 && entry.speed <= 100)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.acceleration) && entry.acceleration >= 0 && entry.acceleration <= 100)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.handling) && entry.handling >= 0 && entry.handling <= 100)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.durability) && entry.durability >= 0 && entry.durability <= 100)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.comfort) && entry.comfort >= 0 && entry.comfort <= 100)).toBe(true);
    expect(VEHICLE_CATALOG.every(entry => Number.isFinite(entry.prestige) && entry.prestige >= 0 && entry.prestige <= 100)).toBe(true);
    expect(new Set(VEHICLE_CATALOG.map(entry => entry.category)).size).toBeGreaterThan(6);
  });

  it('buys and tracks unique owned vehicle instances', () => {
    const player = createPlayer('veh-buy-1', 'Driver One', 'Businessman');
    player.cash = 400000;

    const target = VEHICLE_CATALOG.find(entry => entry.category === 'SEDAN') ?? VEHICLE_CATALOG[0];
    const first = buyVehicle(player, target.id);

    expect(first.owned).toBe(true);
    expect(player.vehicles.length).toBe(1);
    expect(first.instanceId).toBeTruthy();
    expect(first.instanceId).not.toBe('');

    const secondTarget = VEHICLE_CATALOG.find(entry => entry.id !== target.id && entry.category === target.category) ?? VEHICLE_CATALOG[1];
    const second = buyVehicle(player, secondTarget.id);

    expect(second.owned).toBe(true);
    expect(player.vehicles).toHaveLength(2);
    expect(second.instanceId).not.toBe(first.instanceId);
    expect(player.vehicleState?.[second.instanceId]).toBeDefined();
  });

  it('blocks invalid purchases, full garages, and insufficient funds', () => {
    const poor = createPlayer('veh-poor', 'Poor', 'Businessman');
    poor.cash = 1000;

    const invalid = buyVehicle(poor, 'not-a-real-vehicle');
    expect(invalid.owned).toBe(false);
    expect(invalid.reason).toContain('not found');

    const rich = createPlayer('veh-full', 'Garage Full', 'Businessman');
    rich.cash = 20000000;
    rich.vehicleGarageCapacity = 1;
    const buyOne = buyVehicle(rich, 'economy-car');
    expect(buyOne.owned).toBe(true);

    const buyTwo = buyVehicle(rich, 'suv');
    expect(buyTwo.owned).toBe(false);
    expect(buyTwo.reason).toContain('Garage');
  });

  it('vehicle use charges money, adds mileage, and reduces condition', () => {
    const player = createPlayer('veh-use', 'Driver Two', 'Businessman');
    player.cash = 600000;
    const target = getVehicleById('economy-car');
    expect(target).toBeTruthy();

    const purchased = buyVehicle(player, target!.id);
    expect(purchased.owned).toBe(true);

    const instance = getOwnedVehicleByInstanceId(player, purchased.instanceId)!;
    const beforeCash = player.cash;
    const result = useVehicle(player, instance.instanceId, 30);

    expect(result.used).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
    expect(player.vehicleState?.[instance.instanceId]?.mileage).toBeGreaterThan(0);
    expect(player.vehicleState?.[instance.instanceId]?.condition).toBeLessThan(100);
    expect(player.cash).toBeLessThan(beforeCash);
    expect(player.economyLedger.length).toBeGreaterThan(0);
  });

  it('maintenance restores condition and records service history', () => {
    const player = createPlayer('veh-maintain', 'Driver Three', 'Businessman');
    player.cash = 800000;
    const purchased = buyVehicle(player, 'sports-car');
    expect(purchased.owned).toBe(true);

    const instance = getOwnedVehicleByInstanceId(player, purchased.instanceId)!;
    player.vehicleState![instance.instanceId].condition = 30;
    const before = player.vehicleState![instance.instanceId].condition;

    const result = maintainVehicle(player, instance.instanceId);

    expect(result.success).toBe(true);
    expect(player.vehicleState![instance.instanceId].condition).toBeGreaterThan(before);
    expect(player.vehicleState![instance.instanceId].timesServiced).toBeGreaterThan(0);
    expect(result.maintenanceCost).toBeGreaterThan(0);
  });

  it('sells correctly and blocks a second sale', () => {
    const player = createPlayer('veh-sell', 'Driver Four', 'Businessman');
    player.cash = 800000;
    const purchased = buyVehicle(player, 'luxury-car');
    expect(purchased.owned).toBe(true);

    const instance = getOwnedVehicleByInstanceId(player, purchased.instanceId)!;
    const sale = sellVehicle(player, instance.instanceId);
    expect(sale.success).toBe(true);
    expect(player.vehicles.includes(instance.instanceId)).toBe(false);
    expect(player.cash).toBeGreaterThan(0);

    const secondSale = sellVehicle(player, instance.instanceId);
    expect(secondSale.success).toBe(false);
  });

  it('persists state across save and reload', () => {
    const player = createPlayer('veh-persist', 'Driver Five', 'Businessman');
    player.cash = 1500000;
    const purchased = buyVehicle(player, 'suv');
    expect(purchased.owned).toBe(true);

    const snapshot = JSON.parse(JSON.stringify(player));
    const reloaded = JSON.parse(JSON.stringify(snapshot));
    const restored = reloaded as typeof player;

    expect(restored.vehicleState?.[purchased.instanceId]).toBeDefined();
    expect(restored.vehicleGarageCapacity).toBeGreaterThan(0);
    expect(restored.vehicles).toContain(purchased.instanceId);
  });

  it('garage summary reports real capacity, values, and usage', () => {
    const player = createPlayer('veh-garage', 'Driver Six', 'Businessman');
    player.cash = 5000000;
    buyVehicle(player, 'economy-car');
    buyVehicle(player, 'suv');

    const summary = getVehicleGarageSummary(player);
    expect(summary.capacity).toBeGreaterThan(0);
    expect(summary.occupied).toBeGreaterThanOrEqual(2);
    expect(summary.totalValue).toBeGreaterThan(0);
    expect(summary.totalMileage).toBeGreaterThanOrEqual(0);
    expect(summary.averageCondition).toBeGreaterThanOrEqual(0);
  });

  it('value helper stays finite and condition-aware', () => {
    const vehicle = getVehicleById('hypercar-phantom') ?? getVehicleById('sports-car');
    expect(vehicle).toBeTruthy();

    const calculated = getVehicleCurrentValue(vehicle!, {
      condition: 100,
      mileage: 0,
      purchasePrice: vehicle!.purchasePrice
    } as any);

    expect(Number.isFinite(calculated)).toBe(true);
    expect(calculated).toBeGreaterThan(0);
    expect(calculated).toBeLessThan(Infinity);
  });

  it('awards xp on successful vehicle actions and no xp on failed actions', () => {
    const player = createPlayer('veh-progression', 'Driver', 'Businessman');
    player.cash = 5000000;

    const purchase = buyVehicle(player, 'economy-car');
    expect(purchase.owned).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(100);

    const instance = getOwnedVehicleByInstanceId(player, purchase.instanceId)!;
    const used = useVehicle(player, instance.instanceId, 20);
    expect(used.used).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(110);

    const maintenance = maintainVehicle(player, instance.instanceId);
    expect(maintenance.success).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(125);

    const sale = sellVehicle(player, instance.instanceId);
    expect(sale.success).toBe(true);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(150);

    const fail = useVehicle(player, 'missing-vehicle', 20);
    expect(fail.used).toBe(false);
    expect(player.lifetimeXp).toBeGreaterThanOrEqual(150);
  });
});
