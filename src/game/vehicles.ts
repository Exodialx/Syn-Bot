import { chargeMoney, grantMoney } from './economy.js';
import type { Player } from './player.js';
import { grantXp } from './progression.js';

export type VehicleCategory =
  | 'SEDAN'
  | 'SUV'
  | 'SPORTS'
  | 'LUXURY'
  | 'TRUCK'
  | 'VAN'
  | 'MOTORCYCLE'
  | 'OFFROAD'
  | 'COUPE'
  | 'EXECUTIVE'
  | 'SUPER'
  | 'HELICOPTER'
  | 'JET'
  | 'UTILITY';

export type Vehicle = {
  id: string;
  name: string;
  category: VehicleCategory;
  purchasePrice: number;
  bonus: string;
  speed: number;
  acceleration: number;
  handling: number;
  durability: number;
  comfort: number;
  prestige: number;
  utility: number;
  description: string;
};

export type VehicleRuntimeState = {
  instanceId: string;
  vehicleId: string;
  name: string;
  condition: number;
  mileage: number;
  purchasePrice: number;
  purchaseDate: number;
  lastUsedAt: number;
  lastMaintenanceAt: number;
  timesServiced: number;
  serviceHistory: string[];
};

export type VehiclePurchaseResult = {
  owned: boolean;
  instanceId: string;
  reason: string;
  vehicle?: VehicleRuntimeState;
};

export type VehicleUseResult = {
  used: boolean;
  distance: number;
  cost: number;
  conditionBefore: number;
  conditionAfter: number;
  reason?: string;
};

export type VehicleMaintenanceResult = {
  success: boolean;
  maintenanceCost: number;
  condition: number;
  reason?: string;
};

export type VehicleSaleResult = {
  success: boolean;
  saleValue: number;
  reason?: string;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const vehicleBlueprints: Array<[string, string, VehicleCategory, number, number, number, number, number, number, number, number, string]> = [
  ['economy-car', 'Economy Car', 'SEDAN', 18000, 70, 58, 62, 72, 55, 30, 10, 'Reliable commuter for a clean start.'],
  ['compact-sedan', 'Compact Sedan', 'SEDAN', 22000, 76, 63, 68, 76, 60, 34, 12, 'Balanced and affordable city transport.'],
  ['family-sedan', 'Family Sedan', 'SEDAN', 28000, 80, 66, 70, 80, 64, 38, 14, 'Practical comfort for daily logistics.'],
  ['executive-sedan', 'Executive Sedan', 'EXECUTIVE', 42000, 88, 74, 78, 86, 70, 44, 18, 'Executive travel with a discreet profile.'],
  ['luxury-sedan', 'Luxury Sedan', 'LUXURY', 56000, 92, 80, 81, 88, 74, 52, 22, 'Comfort-first luxury for high-value moves.'],
  ['performance-sedan', 'Performance Sedan', 'SPORTS', 64000, 95, 86, 84, 90, 78, 56, 24, 'Fast and refined, built for pace.'],
  ['suv', 'SUV', 'SUV', 35000, 82, 68, 72, 79, 66, 44, 20, 'All-road flexibility and extra cargo room.'],
  ['compact-suv', 'Compact SUV', 'SUV', 39000, 84, 72, 74, 82, 68, 46, 21, 'Urban cargo efficiency with easy handling.'],
  ['family-suv', 'Family SUV', 'SUV', 52000, 86, 74, 76, 85, 70, 50, 24, 'Utility-first vehicle tuned for heavy use.'],
  ['luxury-suv', 'Luxury SUV', 'LUXURY', 76000, 90, 78, 79, 88, 76, 58, 28, 'Premium utility with elite comfort.'],
  ['offroad-suv', 'Offroad SUV', 'OFFROAD', 62000, 80, 70, 82, 84, 62, 54, 26, 'Built for rough terrain and demanding routes.'],
  ['sports-car', 'Sports Car', 'SPORTS', 80000, 110, 94, 88, 90, 72, 60, 24, 'Low-slung speed machine for prestige.'],
  ['supercar', 'Supercar', 'SUPER', 185000, 118, 98, 92, 94, 80, 68, 30, 'Elite performance with extreme street presence.'],
  ['hypercar-phantom', 'Hypercar Phantom', 'SUPER', 220000, 124, 100, 96, 97, 86, 72, 32, 'A near-mythic machine for status collectors.'],
  ['muscle-car', 'Muscle Car', 'SPORTS', 68000, 108, 92, 86, 80, 62, 52, 21, 'Raw power with a bold road presence.'],
  ['coupe', 'Coupe', 'COUPE', 46000, 98, 82, 78, 86, 68, 50, 18, 'Lightweight luxury for fast city sorties.'],
  ['luxury-coupe', 'Luxury Coupe', 'LUXURY', 90000, 102, 88, 84, 90, 76, 62, 25, 'An urban icon for refined operations.'],
  ['truck', 'Truck', 'TRUCK', 55000, 76, 58, 68, 82, 64, 46, 22, 'Heavy-duty transport with strong utility.'],
  ['cargo-truck', 'Cargo Truck', 'TRUCK', 110000, 78, 60, 72, 84, 68, 50, 28, 'Payload-focused transport for logistics.'],
  ['heavy-duty-truck', 'Heavy Duty Truck', 'TRUCK', 155000, 82, 62, 76, 88, 74, 56, 32, 'Stable, durable, and ideal for freight work.'],
  ['van', 'Van', 'VAN', 42000, 80, 60, 64, 78, 58, 42, 20, 'Flexible transport for crew and cargo.'],
  ['delivery-van', 'Delivery Van', 'VAN', 54000, 82, 62, 68, 82, 60, 46, 24, 'Reliable goods movement in busy districts.'],
  ['cargo-van', 'Cargo Van', 'UTILITY', 72000, 84, 64, 70, 84, 62, 48, 26, 'A practical utility van for operations.'],
  ['luxury-van', 'Luxury Van', 'LUXURY', 96000, 88, 70, 74, 88, 76, 58, 28, 'Luxury utility without sacrificing space.'],
  ['motorcycle', 'Motorcycle', 'MOTORCYCLE', 24000, 96, 84, 74, 70, 52, 44, 14, 'Compact and nimble for quick escapes.'],
  ['sport-bike', 'Sport Bike', 'MOTORCYCLE', 36000, 104, 92, 80, 74, 58, 52, 18, 'Agile and aggressive on high-speed runs.'],
  ['touring-bike', 'Touring Bike', 'MOTORCYCLE', 42000, 98, 86, 82, 84, 64, 50, 20, 'Long-range comfort and dependable control.'],
  ['cruiser', 'Cruiser', 'MOTORCYCLE', 31000, 94, 80, 76, 78, 60, 46, 16, 'Strong road presence and easy handling.'],
  ['dirt-bike', 'Dirt Bike', 'OFFROAD', 22000, 88, 78, 84, 72, 52, 40, 15, 'Built for rough tracks and off-grid use.'],
  ['quad-bike', 'Quad Bike', 'OFFROAD', 18000, 82, 70, 78, 68, 48, 36, 12, 'Utility-focused offroad platform.'],
  ['monster-truck', 'Monster Truck', 'OFFROAD', 180000, 70, 52, 90, 92, 58, 70, 35, 'Heavy-hitting ground presence with serious offroad force.'],
  ['executive-van', 'Executive Van', 'EXECUTIVE', 68000, 86, 68, 70, 86, 76, 52, 24, 'A discreet professional transport base.'],
  ['saloon', 'Saloon', 'SEDAN', 26000, 80, 66, 70, 82, 60, 40, 14, 'Classic form and dependable city reliability.'],
  ['grand-tourer', 'Grand Tourer', 'LUXURY', 116000, 104, 90, 86, 90, 78, 66, 30, 'Luxury performance designed for long-range prestige.'],
  ['rally-car', 'Rally Car', 'SPORTS', 132000, 108, 94, 90, 82, 68, 62, 30, 'Built for grip, acceleration, and tactical control.'],
  ['night-runner', 'Night Runner', 'COUPE', 53000, 100, 86, 82, 84, 72, 56, 22, 'Night-drive specialist with clean aesthetics.'],
  ['hatchback', 'Hatchback', 'SEDAN', 25000, 78, 64, 70, 78, 58, 38, 13, 'Compact utility with quick movement.'],
  ['estate-car', 'Estate Car', 'SEDAN', 47000, 86, 68, 74, 84, 70, 48, 18, 'Flexible storage, comfort, and road presence.'],
  ['luxury-jet', 'Luxury Jet', 'JET', 2300000, 200, 95, 88, 90, 82, 84, 70, 'Private air travel for elite operators.'],
  ['helicopter', 'Helicopter', 'HELICOPTER', 1800000, 150, 90, 82, 84, 72, 78, 52, 'Air support with tactical mobility.'],
  ['private-jet', 'Private Jet', 'JET', 5000000, 220, 98, 92, 88, 86, 90, 80, 'High-end air dominance for elite logistics.'],
  ['copter', 'Copter', 'HELICOPTER', 2100000, 156, 92, 84, 88, 75, 82, 54, 'Fast air support for quick repositioning.'],
  ['luxury-yacht', 'Luxury Yacht', 'UTILITY', 420000, 95, 75, 80, 90, 82, 74, 44, 'High-status marine transport.'],
  ['speedboat', 'Speedboat', 'UTILITY', 140000, 100, 82, 78, 84, 70, 60, 36, 'Fast coastal travel and status lift.'],
  ['sedan-01', 'City Runner', 'SEDAN', 21000, 74, 62, 68, 78, 58, 35, 12, 'Efficient and understated daily driver.'],
  ['sedan-02', 'Metro Glide', 'SEDAN', 24000, 76, 65, 70, 80, 60, 38, 13, 'A clean commuter built for urban pace.'],
  ['sedan-03', 'Golden Avenue', 'SEDAN', 29000, 80, 66, 72, 82, 62, 42, 15, 'Urban confidence with smooth handling.'],
  ['sedan-04', 'Vantage Line', 'SEDAN', 33000, 84, 70, 74, 84, 66, 46, 17, 'Affordable performance for city routes.'],
  ['sedan-05', 'Harbor Swift', 'SEDAN', 37000, 85, 72, 76, 86, 68, 48, 19, 'Balanced and refined under pressure.'],
  ['suv-01', 'Summit Trail', 'SUV', 34000, 80, 68, 72, 80, 62, 42, 18, 'Busy-road strength and utility.'],
  ['suv-02', 'Canyon Crest', 'SUV', 38000, 82, 70, 74, 82, 64, 46, 20, 'Comfort-driven utility for uneven routes.'],
  ['suv-03', 'North Wide', 'SUV', 43000, 84, 72, 76, 84, 66, 48, 22, 'Spacious and resilient for daily loads.'],
  ['suv-04', 'Iron Valley', 'SUV', 47000, 86, 74, 78, 86, 70, 52, 24, 'Durable mechanical confidence.'],
  ['suv-05', 'Black Ridge', 'SUV', 54000, 88, 76, 80, 88, 72, 56, 28, 'Premium utility and cohesive road feel.'],
  ['sport-01', 'Apex Bolt', 'SPORTS', 76000, 108, 92, 86, 88, 72, 60, 23, 'Tuned for acceleration and slick control.'],
  ['sport-02', 'Pulse Echo', 'SPORTS', 82000, 111, 94, 88, 90, 74, 62, 25, 'Fast, agile, and dramatic in motion.'],
  ['sport-03', 'Velvet Reign', 'SPORTS', 93000, 114, 96, 89, 91, 76, 66, 27, 'Luxury speed for controlled aggression.'],
  ['sport-04', 'Redline Drift', 'SPORTS', 101000, 116, 98, 90, 93, 78, 68, 29, 'A distinct road weapon for elite drivers.'],
  ['sport-05', 'Solar Torque', 'SPORTS', 110000, 118, 100, 92, 94, 80, 70, 31, 'High-output vehicle tuned for speed.'],
  ['lux-01', 'Imperial Crest', 'LUXURY', 98000, 96, 82, 84, 90, 78, 62, 25, 'Confident luxury without excess noise.'],
  ['lux-02', 'Velvet Horizon', 'LUXURY', 108000, 98, 84, 86, 92, 80, 64, 27, 'Sophisticated road presence and comfort.'],
  ['lux-03', 'Royal Arc', 'LUXURY', 125000, 101, 86, 88, 94, 82, 68, 30, 'Premium comfort that feels elite.'],
  ['lux-04', 'Calm Ember', 'LUXURY', 140000, 104, 88, 90, 95, 84, 70, 33, 'Prepared for premium operations and status.'],
  ['lux-05', 'Silver Crown', 'LUXURY', 160000, 108, 90, 92, 96, 86, 74, 35, 'Elite prestige with a stable high-end ride.'],
  ['truck-01', 'Peak Hauler', 'TRUCK', 60000, 78, 58, 70, 84, 66, 48, 22, 'Heavy-use hauling with steady control.'],
  ['truck-02', 'Iron Freight', 'TRUCK', 72000, 82, 60, 74, 86, 70, 52, 24, 'Logistics-friendly utility with good durability.'],
  ['truck-03', 'Granite Load', 'TRUCK', 87000, 84, 62, 76, 88, 72, 56, 26, 'A dependable wide-load workhorse.'],
  ['truck-04', 'Atlas Runner', 'TRUCK', 98000, 86, 64, 78, 90, 74, 58, 28, 'Wide profile and dependable cargo power.'],
  ['truck-05', 'Titan Verge', 'TRUCK', 118000, 88, 66, 82, 92, 76, 62, 30, 'High-output cargo platform with real weight.'],
  ['van-01', 'Carrier One', 'VAN', 44000, 78, 60, 66, 80, 60, 42, 18, 'Flexible move for crew and supplies.'],
  ['van-02', 'Fleetline', 'VAN', 52000, 80, 62, 68, 82, 62, 46, 20, 'Steady urban transport for real workloads.'],
  ['van-03', 'Harbor Box', 'VAN', 61000, 82, 64, 70, 84, 64, 48, 22, 'Utility-first transport for dense routes.'],
  ['van-04', 'Summit Cargo', 'VAN', 70000, 84, 66, 72, 86, 66, 52, 24, 'Solid cargo management with long reach.'],
  ['van-05', 'Marrow Vector', 'VAN', 78000, 86, 68, 74, 88, 68, 54, 26, 'Structured utility for larger team operations.'],
  ['bike-01', 'Shadow Pulse', 'MOTORCYCLE', 26000, 96, 82, 74, 72, 54, 44, 15, 'Compact and efficient for tight routes.'],
  ['bike-02', 'Night Sprint', 'MOTORCYCLE', 34000, 100, 86, 78, 76, 58, 48, 17, 'Strong acceleration and dependable control.'],
  ['bike-03', 'Pacific Foam', 'MOTORCYCLE', 39000, 102, 88, 80, 80, 60, 50, 18, 'A balanced touring machine.'],
  ['bike-04', 'Violet Chase', 'MOTORCYCLE', 46000, 104, 90, 82, 82, 62, 54, 20, 'Built to move quickly under pressure.'],
  ['bike-05', 'Cinder Run', 'MOTORCYCLE', 54000, 106, 92, 84, 84, 64, 58, 22, 'Tuned for long-range fast movement.'],
  ['offroad-01', 'Dustline', 'OFFROAD', 24000, 84, 70, 80, 72, 52, 38, 14, 'Reliable rough-terrain utility.'],
  ['offroad-02', 'Frost Rumble', 'OFFROAD', 28000, 86, 72, 82, 74, 54, 42, 15, 'Confident control across unstable ground.'],
  ['offroad-03', 'Ridge Heat', 'OFFROAD', 36000, 88, 74, 84, 78, 58, 46, 18, 'A steady performer in demanding regions.'],
  ['offroad-04', 'Dryline X', 'OFFROAD', 42000, 90, 76, 86, 80, 60, 52, 20, 'Bad-surface specialist and hard worker.'],
  ['offroad-05', 'Granite Run', 'OFFROAD', 52000, 92, 80, 88, 82, 64, 58, 22, 'A heavy-duty trail specialist.'],
  ['coupe-01', 'Mason Line', 'COUPE', 42000, 98, 82, 78, 84, 66, 48, 18, 'Quick and stylish with clean lines.'],
  ['coupe-02', 'Signal Arc', 'COUPE', 50000, 100, 84, 80, 86, 68, 52, 20, 'Balanced comfort and confident handling.'],
  ['coupe-03', 'Eclipse Mark', 'COUPE', 57000, 102, 86, 82, 88, 70, 56, 22, 'Low-profile performance and premium feel.'],
  ['coupe-04', 'Velvet Wire', 'COUPE', 65000, 104, 88, 84, 90, 72, 60, 24, 'A more refined coupe for prestige-driven ops.'],
  ['coupe-05', 'Ember ID', 'COUPE', 76000, 106, 90, 86, 92, 74, 64, 26, 'Strong identity and premium on-road performance.'],
  ['exec-01', 'Northline Pro', 'EXECUTIVE', 48000, 88, 74, 76, 86, 72, 52, 19, 'A clean choice for professional movement.'],
  ['exec-02', 'Crest Ledger', 'EXECUTIVE', 56000, 90, 76, 80, 88, 74, 56, 22, 'A measured executive commuter.'],
  ['exec-03', 'Pine Vector', 'EXECUTIVE', 65000, 92, 78, 82, 90, 76, 60, 24, 'Quiet confidence and consistent utility.'],
  ['exec-04', 'Glass Panel', 'EXECUTIVE', 76000, 94, 80, 84, 92, 78, 64, 26, 'Executive presence with premium stability.'],
  ['exec-05', 'Summit Gate', 'EXECUTIVE', 84000, 96, 82, 86, 94, 80, 68, 28, 'High-value executive transport built for control.'],
  ['utility-01', 'Fleet Mule', 'UTILITY', 40000, 72, 60, 68, 80, 58, 40, 16, 'A practical utility platform.'],
  ['utility-02', 'Stablebrake', 'UTILITY', 47000, 74, 62, 70, 82, 60, 44, 18, 'Proven value with strong work use.'],
  ['utility-03', 'Loadline', 'UTILITY', 54000, 76, 64, 72, 84, 62, 48, 20, 'Carrying capacity and road steadiness.'],
  ['utility-04', 'Depot Echo', 'UTILITY', 61000, 78, 66, 74, 86, 64, 52, 22, 'Simplified reliability for repeat use.'],
  ['utility-05', 'Gravel Verge', 'UTILITY', 73000, 80, 68, 76, 88, 66, 56, 24, 'A steady utility workhorse.']
];

const legacyVehicleBlueprints: Array<[string, string, VehicleCategory, number, number, number, number, number, number, number, number, string]> = [
  ['luxury-car', 'Luxury Car', 'LUXURY', 150000, 95, 84, 86, 90, 80, 72, 30, 'Prestige-focused comfort with elite presence.'],
  ['yacht', 'Yacht', 'UTILITY', 500000, 88, 70, 74, 92, 84, 76, 42, 'Luxury marine transport for status-driven operations.'],
  ['classic-muscle', 'Classic Muscle', 'SPORTS', 76000, 92, 84, 82, 86, 68, 60, 24, 'Timeless power and unmistakable street energy.']
];

export const VEHICLE_CATALOG: Vehicle[] = [...vehicleBlueprints, ...legacyVehicleBlueprints].map(([id, name, category, purchasePrice, speed, acceleration, handling, durability, comfort, prestige, utility, description]) => ({
  id,
  name,
  category,
  purchasePrice,
  bonus: description,
  speed: clamp(speed, 0, 100),
  acceleration: clamp(acceleration, 0, 100),
  handling: clamp(handling, 0, 100),
  durability: clamp(durability, 0, 100),
  comfort: clamp(comfort, 0, 100),
  prestige: clamp(prestige, 0, 100),
  utility: clamp(utility, 0, 100),
  description
}));

export function getVehicleById(vehicleId: string): Vehicle | undefined {
  return VEHICLE_CATALOG.find(entry => entry.id.toLowerCase() === vehicleId.toLowerCase());
}

export function getVehicleByName(name: string): Vehicle | undefined {
  return VEHICLE_CATALOG.find(entry => entry.name.toLowerCase() === name.toLowerCase());
}

function ensureVehicleState(player: Player): Record<string, VehicleRuntimeState> {
  if (!player.vehicleState) player.vehicleState = {};
  return player.vehicleState;
}

export function getOwnedVehicleByInstanceId(player: Player, instanceId: string): VehicleRuntimeState | undefined {
  if (!instanceId) return undefined;
  const state = ensureVehicleState(player)[instanceId];
  return state ?? undefined;
}

export function getVehicleCurrentValue(vehicle: Vehicle, runtime?: Partial<VehicleRuntimeState> | null): number {
  const condition = clamp(Number(runtime?.condition ?? 100), 0, 100);
  const mileage = Math.max(0, Number(runtime?.mileage ?? 0));
  const purchasePrice = Number(runtime?.purchasePrice ?? vehicle.purchasePrice ?? 0);
  const value = purchasePrice * (0.22 + (condition / 100) * 0.78) * clamp(1 - mileage / 260000, 0.1, 1) * (1 + vehicle.prestige / 260);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

export function getVehicleGarageSummary(player: Player): {
  capacity: number;
  occupied: number;
  totalValue: number;
  totalMileage: number;
  averageCondition: number;
} {
  const garageState = ensureVehicleState(player);
  const ownedVehicles = player.vehicles
    .map(instanceId => garageState[instanceId])
    .filter((vehicle): vehicle is VehicleRuntimeState => Boolean(vehicle));

  const capacity = Number.isFinite(player.vehicleGarageCapacity) ? Math.max(1, player.vehicleGarageCapacity) : 3;
  const totalValue = ownedVehicles.reduce((sum, vehicle) => {
    const definition = getVehicleById(vehicle.vehicleId);
    return sum + (definition ? getVehicleCurrentValue(definition, vehicle) : 0);
  }, 0);
  const totalMileage = ownedVehicles.reduce((sum, vehicle) => sum + vehicle.mileage, 0);
  const averageCondition = ownedVehicles.length
    ? ownedVehicles.reduce((sum, vehicle) => sum + vehicle.condition, 0) / ownedVehicles.length
    : 0;

  return {
    capacity,
    occupied: ownedVehicles.length,
    totalValue: Number(totalValue.toFixed(2)),
    totalMileage,
    averageCondition: Number(averageCondition.toFixed(2))
  };
}

export function buyVehicle(player: Player, vehicleId: string): VehiclePurchaseResult {
  const definition = getVehicleById(vehicleId) ?? getVehicleByName(vehicleId);
  if (!definition) {
    return { owned: false, instanceId: '', reason: `Vehicle not found: ${vehicleId}.` };
  }

  const garageState = ensureVehicleState(player);
  const garageLimit = Number.isFinite(player.vehicleGarageCapacity) ? Math.max(1, player.vehicleGarageCapacity) : 3;
  const occupied = player.vehicles.filter(instanceId => Boolean(garageState[instanceId])).length;
  if (occupied >= garageLimit) {
    return { owned: false, instanceId: '', reason: `Garage full. ${garageLimit} vehicle slots in use.` };
  }

  if (player.cash < definition.purchasePrice) {
    return { owned: false, instanceId: '', reason: `Insufficient cash. ${definition.name} costs $${definition.purchasePrice.toLocaleString()}.` };
  }

  try {
    chargeMoney({
      player,
      amount: definition.purchasePrice,
      source: 'VEHICLE',
      reason: `Purchased ${definition.name}`,
      metadata: { vehicleId: definition.id, purchasePrice: definition.purchasePrice, category: definition.category }
    });
  } catch (error) {
    return { owned: false, instanceId: '', reason: error instanceof Error ? error.message : `Failed to buy ${definition.name}.` };
  }

  const instanceId = `${definition.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const state: VehicleRuntimeState = {
    instanceId,
    vehicleId: definition.id,
    name: definition.name,
    condition: 100,
    mileage: 0,
    purchasePrice: definition.purchasePrice,
    purchaseDate: Date.now(),
    lastUsedAt: Date.now(),
    lastMaintenanceAt: Date.now(),
    timesServiced: 0,
    serviceHistory: [`Purchased ${definition.name} for $${definition.purchasePrice.toLocaleString()}.`]
  };

  garageState[instanceId] = state;
  player.vehicles.push(instanceId);
  player.history.push(`Bought vehicle: ${definition.name}.`);

  grantXp(player, 100, 'VEHICLE', `vehicle-buy:${player.id}:${definition.id}:${instanceId}`);

  return { owned: true, instanceId, vehicle: state, reason: `Purchased ${definition.name}.` };
}

export function useVehicle(player: Player, instanceId: string, distanceKm = 20): VehicleUseResult {
  const state = getOwnedVehicleByInstanceId(player, instanceId);
  if (!state) {
    return { used: false, distance: 0, cost: 0, conditionBefore: 0, conditionAfter: 0, reason: 'Vehicle not found in garage.' };
  }

  const definition = getVehicleById(state.vehicleId);
  if (!definition) {
    return { used: false, distance: 0, cost: 0, conditionBefore: state.condition, conditionAfter: state.condition, reason: 'Vehicle definition missing.' };
  }

  const distance = Number(distanceKm) || 0;
  if (distance <= 0) {
    return { used: false, distance: 0, cost: 0, conditionBefore: state.condition, conditionAfter: state.condition, reason: 'Distance must be greater than zero.' };
  }

  const cost = Number((distance * (10 + definition.purchasePrice / 25000) * (1.4 - definition.utility / 150)).toFixed(2));
  const conditionBefore = state.condition;

  try {
    chargeMoney({
      player,
      amount: cost,
      source: 'VEHICLE',
      reason: `Vehicle use: ${definition.name}`,
      metadata: { instanceId, distanceKm: distance, vehicleId: definition.id }
    });
  } catch (error) {
    return {
      used: false,
      distance: 0,
      cost: 0,
      conditionBefore,
      conditionAfter: state.condition,
      reason: error instanceof Error ? error.message : 'Insufficient cash for vehicle use.'
    };
  }

  state.mileage += distance;
  state.condition = clamp(state.condition - distance * (0.06 + (100 - definition.durability) / 350), 0, 100);
  state.lastUsedAt = Date.now();
  state.serviceHistory.push(`Used for ${distance} km.`);

  grantXp(player, 10, 'VEHICLE', `vehicle-use:${player.id}:${state.instanceId}:${Math.round(distance)}`);

  return {
    used: true,
    distance,
    cost,
    conditionBefore,
    conditionAfter: state.condition,
    reason: `${definition.name} used for ${distance} km.`
  };
}

export function maintainVehicle(player: Player, instanceId: string): VehicleMaintenanceResult {
  const state = getOwnedVehicleByInstanceId(player, instanceId);
  if (!state) {
    return { success: false, maintenanceCost: 0, condition: 0, reason: 'Vehicle not found in garage.' };
  }

  const definition = getVehicleById(state.vehicleId);
  if (!definition) {
    return { success: false, maintenanceCost: 0, condition: state.condition, reason: 'Vehicle definition missing.' };
  }

  const maintenanceCost = Math.max(1500, Math.round((100 - state.condition) * (definition.purchasePrice / 2800) * 0.7));
  try {
    chargeMoney({
      player,
      amount: maintenanceCost,
      source: 'VEHICLE',
      reason: `Serviced ${definition.name}`,
      metadata: { instanceId, vehicleId: definition.id, serviceCost: maintenanceCost }
    });
  } catch (error) {
    return {
      success: false,
      maintenanceCost: 0,
      condition: state.condition,
      reason: error instanceof Error ? error.message : 'Insufficient cash for maintenance.'
    };
  }

  const before = state.condition;
  state.condition = clamp(state.condition + 35 + definition.durability * 0.2, 0, 100);
  state.lastMaintenanceAt = Date.now();
  state.timesServiced += 1;
  state.serviceHistory.push(`Maintenance completed. Condition ${before} -> ${state.condition}.`);
  player.history.push(`Maintained vehicle: ${definition.name}.`);

  grantXp(player, 15, 'VEHICLE', `vehicle-maintenance:${player.id}:${state.instanceId}`);

  return { success: true, maintenanceCost, condition: state.condition, reason: `${definition.name} serviced successfully.` };
}

export function sellVehicle(player: Player, instanceId: string): VehicleSaleResult {
  const state = getOwnedVehicleByInstanceId(player, instanceId);
  if (!state) {
    return { success: false, saleValue: 0, reason: 'Vehicle not found in garage.' };
  }

  const definition = getVehicleById(state.vehicleId);
  if (!definition) {
    return { success: false, saleValue: 0, reason: 'Vehicle definition missing.' };
  }

  const saleValue = Math.max(0, getVehicleCurrentValue(definition, state));
  grantMoney({
    player,
    amount: saleValue,
    source: 'VEHICLE',
    reason: `Sold ${definition.name}`,
    metadata: { instanceId, vehicleId: definition.id, saleValue }
  });

  grantXp(player, 25, 'VEHICLE', `vehicle-sale:${player.id}:${instanceId}`);

  player.vehicles = player.vehicles.filter(entry => entry !== instanceId);
  delete ensureVehicleState(player)[instanceId];
  player.history.push(`Sold vehicle: ${definition.name} for $${saleValue.toLocaleString()}.`);

  return { success: true, saleValue, reason: `${definition.name} sold for $${saleValue.toLocaleString()}.` };
}

export function getVehicleByQuery(player: Player, query: string): VehicleRuntimeState | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  return Object.values(ensureVehicleState(player)).find(vehicle =>
    vehicle.instanceId.toLowerCase().includes(normalized)
    || vehicle.name.toLowerCase().includes(normalized)
    || vehicle.vehicleId.toLowerCase().includes(normalized)
  );
}

