import { chargeMoney, grantMoney } from './economy.js';
import type { Player } from './player.js';
import { getBusinessCollectionModifier, getBusinessEfficiencyModifier, getBusinessPurchaseCostModifier, grantClassXp, grantXp } from './progression.js';

export type BusinessTier = 'Starter' | 'Medium' | 'Large' | 'Mega' | 'Illegal';
export type BusinessStaffRole = 'workers' | 'managers' | 'security' | 'logistics' | 'tech';
export type BusinessCondition = 'OPTIMAL' | 'NORMAL' | 'STRUGGLING' | 'CRITICAL';

export type Business = {
  id: string;
  name: string;
  tier: BusinessTier;
  category: string;
  level: number;
  purchaseCost: number;
  upgradeCost: number;
  income: number;
  production: number;
  staff: number;
  maintenance: number;
  security: number;
  marketing: number;
  logistics: number;
  technology: number;
  capacity: number;
  reputation: number;
  operatingExpenses: number;
  heatRisk: number;
};

export type BusinessRuntimeState = {
  businessName: string;
  staff: Record<BusinessStaffRole, number>;
  staffTotal: number;
  demand: number;
  supply: number;
  condition: BusinessCondition;
  baseCapacity: number;
  effectiveCapacity: number;
  capacityUtilization: number;
  maintenance: number;
  output: number;
  lastRevenue: number;
  lastProfit: number;
  efficiencyScore: number;
};

export type BusinessOperatingSnapshot = {
  businessName: string;
  baseCapacity: number;
  effectiveCapacity: number;
  capacityUtilization: number;
  grossRevenue: number;
  operatingCost: number;
  netProfit: number;
  efficiencyScore: number;
  demand: number;
  supply: number;
  condition: BusinessCondition;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeStaffRole(role: string): BusinessStaffRole {
  const lower = role.toLowerCase();
  if (lower === 'manager' || lower === 'managers') return 'managers';
  if (lower === 'security') return 'security';
  if (lower === 'logistics') return 'logistics';
  if (lower === 'tech' || lower === 'technology') return 'tech';
  return 'workers';
}

function getStaffCost(template: Business, role: BusinessStaffRole, count: number): number {
  const roleWeights: Record<BusinessStaffRole, number> = {
    workers: 1,
    managers: 1.7,
    security: 1.5,
    logistics: 1.4,
    tech: 1.9
  };
  return count * (template.maintenance * 0.04 * roleWeights[role] + 140);
}

export function createBusinessRuntime(template: Business): BusinessRuntimeState {
  const staff = {
    workers: Math.max(1, Math.round(template.staff * 0.55)),
    managers: Math.max(1, Math.round(template.staff * 0.18)),
    security: Math.max(1, Math.round(template.security * 0.6)),
    logistics: Math.max(1, Math.round(template.logistics * 0.6)),
    tech: Math.max(1, Math.round(template.technology * 0.7))
  };
  const totalStaff = Object.values(staff).reduce((sum, value) => sum + value, 0);
  const baseCapacity = template.capacity;
  const effectiveCapacity = Math.max(baseCapacity, baseCapacity * (0.8 + totalStaff / (baseCapacity * 1.5 + 1)));
  const capacityUtilization = clamp(totalStaff / Math.max(1, template.staff * 2.4), 0, 1);
  const demand = clamp(25 + template.reputation * 0.7 + template.marketing * 1.1 - template.heatRisk * 0.2, 0, 100);
  const supply = clamp((template.production * 0.7) + (template.logistics * 0.8) + (template.technology * 0.9), 0, 100);
  const efficiencyScore = clamp((template.technology * 2.2 + template.logistics * 1.8 + template.security * 1.6 + template.marketing * 1.3 + template.reputation * 0.8 + capacityUtilization * 100) / 6, 0, 100);
  const condition = getBusinessCondition({
    businessName: template.name,
    staff,
    staffTotal: totalStaff,
    demand,
    supply,
    condition: 'NORMAL',
    baseCapacity,
    effectiveCapacity,
    capacityUtilization,
    maintenance: template.maintenance,
    output: template.production,
    lastRevenue: 0,
    lastProfit: 0,
    efficiencyScore
  });

  return {
    businessName: template.name,
    staff,
    staffTotal: totalStaff,
    demand,
    supply,
    condition,
    baseCapacity,
    effectiveCapacity,
    capacityUtilization,
    maintenance: template.maintenance,
    output: template.production,
    lastRevenue: 0,
    lastProfit: 0,
    efficiencyScore
  };
}

export function calculateBusinessOperatingSnapshot(template: Business, runtime: BusinessRuntimeState): BusinessOperatingSnapshot {
  const staffFactor = clamp(runtime.staffTotal / Math.max(1, template.staff * 2.4), 0, 1.4);
  const demandFactor = clamp(runtime.demand / 100, 0, 1);
  const efficiencyFactor = clamp(runtime.efficiencyScore / 100, 0, 1);
  const productionFactor = clamp(runtime.effectiveCapacity / Math.max(1, template.capacity), 0.5, 1.6);
  const chainBoost = calculateSupplyChainBonus([template.name]);
  const grossRevenue = Number((template.income * (0.8 + efficiencyFactor * 0.8 + demandFactor * 0.5) * (0.9 + staffFactor * 0.9) * productionFactor * chainBoost).toFixed(2));
  const operatingCost = Number((template.maintenance + template.operatingExpenses * (0.8 + (1 - efficiencyFactor) * 0.5) + runtime.staffTotal * 55).toFixed(2));
  const netProfit = Math.max(0, Number((grossRevenue - operatingCost).toFixed(2)));

  return {
    businessName: template.name,
    baseCapacity: runtime.baseCapacity,
    effectiveCapacity: runtime.effectiveCapacity,
    capacityUtilization: runtime.capacityUtilization,
    grossRevenue,
    operatingCost,
    netProfit,
    efficiencyScore: runtime.efficiencyScore,
    demand: runtime.demand,
    supply: runtime.supply,
    condition: runtime.condition
  };
}

export function getBusinessCondition(runtime: BusinessRuntimeState): BusinessCondition {
  if (runtime.efficiencyScore >= 80 && runtime.capacityUtilization >= 0.7) return 'OPTIMAL';
  if (runtime.efficiencyScore >= 55 && runtime.capacityUtilization >= 0.45) return 'NORMAL';
  if (runtime.efficiencyScore >= 30 && runtime.capacityUtilization >= 0.2) return 'STRUGGLING';
  return 'CRITICAL';
}

export function calculateSupplyChainBonus(ownedBusinessNames: string[]): number {
  const uniqueNames = [...new Set(ownedBusinessNames.map(name => name.trim()).filter(Boolean))];
  let bonus = 1;
  for (let i = 0; i < uniqueNames.length; i += 1) {
    const current = uniqueNames[i];
    for (let j = 0; j < uniqueNames.length; j += 1) {
      if (i === j) continue;
      const neighborMap = BUSINESS_CHAIN_BONUSES[current];
      if (neighborMap && neighborMap[uniqueNames[j]]) {
        bonus *= neighborMap[uniqueNames[j]];
      }
    }
  }
  return Number(clamp(bonus, 1.01, 1.45).toFixed(3));
}

export function getPlayerBusinessPortfolio(ownedBusinessNames: string[]): {
  totalBusinesses: number;
  highestRevenue: number;
  typeMix: Record<string, number>;
} {
  const results = {
    industrial: 0,
    retail: 0,
    technology: 0,
    hospitality: 0,
    logistics: 0,
    finance: 0,
    service: 0,
    entertainment: 0,
    other: 0
  };

  let highestRevenue = 0;
  for (const name of ownedBusinessNames) {
    const business = getBusinessByName(name);
    if (!business) continue;
    highestRevenue = Math.max(highestRevenue, business.income);

    const normalized = business.category.toLowerCase();
    if (normalized.includes('industrial')) results.industrial += 1;
    else if (normalized.includes('retail')) results.retail += 1;
    else if (normalized.includes('technology')) results.technology += 1;
    else if (normalized.includes('hospitality')) results.hospitality += 1;
    else if (normalized.includes('logistics')) results.logistics += 1;
    else if (normalized.includes('finance')) results.finance += 1;
    else if (normalized.includes('service')) results.service += 1;
    else if (normalized.includes('entertainment')) results.entertainment += 1;
    else results.other += 1;
  }

  return {
    totalBusinesses: ownedBusinessNames.length,
    highestRevenue,
    typeMix: results
  };
}

export function hireBusinessStaff(player: Player, businessName: string, role: string, count: number, dryRun = false): boolean {
  const template = getBusinessByName(businessName);
  if (!template) return false;
  const normalizedRole = normalizeStaffRole(role);
  const total = Math.max(1, Math.round(count));
  const cost = getStaffCost(template, normalizedRole, total);
  const runtime = player.businessRuntime?.[template.name] ?? createBusinessRuntime(template);

  if (!dryRun) {
    if (player.cash < cost) return false;
    chargeMoney({ player, amount: cost, source: 'BUSINESS', reason: `Staff hiring: ${template.name} (${normalizedRole})`, metadata: { business: template.name, role: normalizedRole, count: total } });
  }

  runtime.staff[normalizedRole] += total;
  runtime.staffTotal = Object.values(runtime.staff).reduce((sum, value) => sum + value, 0);
  runtime.efficiencyScore = clamp(runtime.efficiencyScore + total * 1.6, 0, 100);
  runtime.condition = getBusinessCondition(runtime);
  if (!player.businessRuntime) player.businessRuntime = {};
  player.businessRuntime[template.name] = runtime;
  return true;
}

export function fireBusinessStaff(player: Player, businessName: string, role: string, count: number): boolean {
  const template = getBusinessByName(businessName);
  if (!template) return false;
  const runtime = player.businessRuntime?.[template.name];
  if (!runtime) return false;

  const normalizedRole = normalizeStaffRole(role);
  const total = Math.max(1, Math.round(count));
  if (runtime.staff[normalizedRole] < total) return false;

  runtime.staff[normalizedRole] -= total;
  runtime.staffTotal = Object.values(runtime.staff).reduce((sum, value) => sum + value, 0);
  runtime.efficiencyScore = clamp(runtime.efficiencyScore - total * 1.2, 0, 100);
  runtime.condition = getBusinessCondition(runtime);
  player.businessRuntime![template.name] = runtime;
  return true;
}

export function collectBusinessRevenue(player: Player, businessName: string): { businessName: string; grossRevenue: number; operatingCost: number; netProfit: number; condition: BusinessCondition; } {
  const template = getBusinessByName(businessName);
  if (!template) {
    return { businessName, grossRevenue: 0, operatingCost: 0, netProfit: 0, condition: 'CRITICAL' };
  }

  const runtime = player.businessRuntime?.[template.name] ?? createBusinessRuntime(template);
  const snapshot = calculateBusinessOperatingSnapshot(template, runtime);
  const efficiencyModifier = getBusinessEfficiencyModifier(player);
  const collectionModifier = getBusinessCollectionModifier(player);
  const adjustedGrossRevenue = Number((snapshot.grossRevenue * (1 + efficiencyModifier)).toFixed(2));
  const adjustedNetProfit = Number((Math.max(0, adjustedGrossRevenue - snapshot.operatingCost) * (1 + collectionModifier)).toFixed(2));

  runtime.lastRevenue = adjustedGrossRevenue;
  runtime.lastProfit = adjustedNetProfit;
  runtime.condition = snapshot.condition;
  runtime.efficiencyScore = clamp(snapshot.efficiencyScore + (efficiencyModifier * 100), 0, 100);
  runtime.capacityUtilization = clamp(snapshot.capacityUtilization, 0, 1);

  grantMoney({ player, amount: adjustedNetProfit, source: 'BUSINESS', reason: `Business collection: ${template.name}`, metadata: { business: template.name, grossRevenue: adjustedGrossRevenue, operatingCost: snapshot.operatingCost } });
  grantXp(player, 60, 'BUSINESS', `business-collection:${player.id}:${template.id}`);
  if (player.role === 'Businessman') {
    grantClassXp(player, 35, 'BUSINESS', `business-collection-class:${player.id}:${template.id}`);
  }
  if (!player.businessRuntime) player.businessRuntime = {};
  player.businessRuntime[template.name] = runtime;

  return {
    businessName: template.name,
    grossRevenue: adjustedGrossRevenue,
    operatingCost: snapshot.operatingCost,
    netProfit: adjustedNetProfit,
    condition: snapshot.condition
  };
}

export const BUSINESS_CATALOG: Business[] = [
  { id: 'conv-store', name: 'Convenience Store', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 5000, upgradeCost: 3000, income: 1800, production: 20, staff: 2, maintenance: 250, security: 10, marketing: 8, logistics: 8, technology: 5, capacity: 15, reputation: 10, operatingExpenses: 350, heatRisk: 0 },
  { id: 'coffee-shop', name: 'Coffee Shop', tier: 'Starter', category: 'Hospitality', level: 1, purchaseCost: 6500, upgradeCost: 3200, income: 2200, production: 20, staff: 2, maintenance: 300, security: 6, marketing: 12, logistics: 7, technology: 5, capacity: 18, reputation: 12, operatingExpenses: 420, heatRisk: 0 },
  { id: 'fast-food', name: 'Fast Food Restaurant', tier: 'Starter', category: 'Hospitality', level: 1, purchaseCost: 8500, upgradeCost: 4500, income: 2800, production: 30, staff: 4, maintenance: 420, security: 8, marketing: 15, logistics: 8, technology: 6, capacity: 20, reputation: 18, operatingExpenses: 560, heatRisk: 0 },
  { id: 'pizzeria', name: 'Pizzeria', tier: 'Starter', category: 'Hospitality', level: 1, purchaseCost: 9000, upgradeCost: 4600, income: 3000, production: 32, staff: 4, maintenance: 430, security: 9, marketing: 15, logistics: 8, technology: 6, capacity: 22, reputation: 18, operatingExpenses: 580, heatRisk: 0 },
  { id: 'bakery', name: 'Bakery', tier: 'Starter', category: 'Food', level: 1, purchaseCost: 7800, upgradeCost: 4200, income: 2600, production: 25, staff: 3, maintenance: 360, security: 8, marketing: 14, logistics: 7, technology: 6, capacity: 20, reputation: 15, operatingExpenses: 500, heatRisk: 0 },
  { id: 'barbershop', name: 'Barbershop', tier: 'Starter', category: 'Service', level: 1, purchaseCost: 7200, upgradeCost: 3800, income: 2400, production: 22, staff: 3, maintenance: 340, security: 7, marketing: 13, logistics: 7, technology: 5, capacity: 18, reputation: 14, operatingExpenses: 470, heatRisk: 0 },
  { id: 'salon', name: 'Salon', tier: 'Starter', category: 'Service', level: 1, purchaseCost: 7600, upgradeCost: 3900, income: 2500, production: 24, staff: 3, maintenance: 350, security: 8, marketing: 14, logistics: 7, technology: 6, capacity: 18, reputation: 15, operatingExpenses: 490, heatRisk: 0 },
  { id: 'laundry', name: 'Laundry', tier: 'Starter', category: 'Service', level: 1, purchaseCost: 7000, upgradeCost: 3600, income: 2300, production: 20, staff: 2, maintenance: 330, security: 7, marketing: 11, logistics: 7, technology: 5, capacity: 15, reputation: 12, operatingExpenses: 460, heatRisk: 0 },
  { id: 'repair-shop', name: 'Repair Shop', tier: 'Starter', category: 'Service', level: 1, purchaseCost: 8200, upgradeCost: 4200, income: 2600, production: 26, staff: 3, maintenance: 360, security: 8, marketing: 12, logistics: 8, technology: 7, capacity: 17, reputation: 15, operatingExpenses: 500, heatRisk: 0 },
  { id: 'clothing-store', name: 'Clothing Store', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 9000, upgradeCost: 4700, income: 3100, production: 32, staff: 4, maintenance: 410, security: 9, marketing: 17, logistics: 8, technology: 7, capacity: 25, reputation: 18, operatingExpenses: 560, heatRisk: 0 },
  { id: 'electronics-shop', name: 'Electronics Shop', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 9800, upgradeCost: 5000, income: 3400, production: 35, staff: 4, maintenance: 440, security: 10, marketing: 18, logistics: 9, technology: 8, capacity: 20, reputation: 20, operatingExpenses: 620, heatRisk: 0 },
  { id: 'bookstore', name: 'Bookstore', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 7200, upgradeCost: 3700, income: 2300, production: 20, staff: 2, maintenance: 280, security: 6, marketing: 10, logistics: 6, technology: 5, capacity: 15, reputation: 12, operatingExpenses: 420, heatRisk: 0 },
  { id: 'toy-store', name: 'Toy Store', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 7500, upgradeCost: 4200, income: 2400, production: 22, staff: 3, maintenance: 320, security: 7, marketing: 13, logistics: 6, technology: 6, capacity: 18, reputation: 14, operatingExpenses: 460, heatRisk: 0 },
  { id: 'flower-shop', name: 'Flower Shop', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 7000, upgradeCost: 3600, income: 2200, production: 18, staff: 2, maintenance: 280, security: 6, marketing: 11, logistics: 6, technology: 5, capacity: 15, reputation: 14, operatingExpenses: 420, heatRisk: 0 },
  { id: 'juice-bar', name: 'Juice Bar', tier: 'Starter', category: 'Hospitality', level: 1, purchaseCost: 6800, upgradeCost: 3500, income: 2100, production: 18, staff: 2, maintenance: 270, security: 6, marketing: 12, logistics: 6, technology: 5, capacity: 15, reputation: 13, operatingExpenses: 390, heatRisk: 0 },
  { id: 'parcel-shop', name: 'Parcel Shop', tier: 'Starter', category: 'Logistics', level: 1, purchaseCost: 7100, upgradeCost: 3600, income: 2200, production: 20, staff: 2, maintenance: 300, security: 7, marketing: 10, logistics: 11, technology: 6, capacity: 15, reputation: 12, operatingExpenses: 420, heatRisk: 0 },
  { id: 'cleaning-company', name: 'Cleaning Company', tier: 'Starter', category: 'Service', level: 1, purchaseCost: 7600, upgradeCost: 4000, income: 2500, production: 22, staff: 3, maintenance: 340, security: 7, marketing: 12, logistics: 7, technology: 6, capacity: 18, reputation: 13, operatingExpenses: 500, heatRisk: 0 },
  { id: 'art-shop', name: 'Art Shop', tier: 'Starter', category: 'Creative', level: 1, purchaseCost: 8000, upgradeCost: 4300, income: 2600, production: 25, staff: 3, maintenance: 350, security: 7, marketing: 14, logistics: 7, technology: 7, capacity: 18, reputation: 15, operatingExpenses: 520, heatRisk: 0 },
  { id: 'photography-studio', name: 'Photography Studio', tier: 'Starter', category: 'Creative', level: 1, purchaseCost: 8500, upgradeCost: 4500, income: 2900, production: 28, staff: 3, maintenance: 360, security: 8, marketing: 15, logistics: 7, technology: 7, capacity: 18, reputation: 17, operatingExpenses: 560, heatRisk: 0 },
  { id: 'tailor-shop', name: 'Tailor Shop', tier: 'Starter', category: 'Retail', level: 1, purchaseCost: 7900, upgradeCost: 4100, income: 2500, production: 25, staff: 3, maintenance: 320, security: 7, marketing: 14, logistics: 6, technology: 6, capacity: 17, reputation: 15, operatingExpenses: 500, heatRisk: 0 },
  { id: 'supermarket', name: 'Supermarket', tier: 'Medium', category: 'Retail', level: 1, purchaseCost: 22000, upgradeCost: 12000, income: 9500, production: 80, staff: 8, maintenance: 900, security: 18, marketing: 30, logistics: 24, technology: 17, capacity: 70, reputation: 32, operatingExpenses: 1800, heatRisk: 0 },
  { id: 'restaurant', name: 'Restaurant', tier: 'Medium', category: 'Hospitality', level: 1, purchaseCost: 25000, upgradeCost: 13500, income: 11000, production: 90, staff: 9, maintenance: 1000, security: 20, marketing: 35, logistics: 26, technology: 16, capacity: 75, reputation: 35, operatingExpenses: 2100, heatRisk: 0 },
  { id: 'arcade', name: 'Arcade', tier: 'Medium', category: 'Entertainment', level: 1, purchaseCost: 26000, upgradeCost: 14000, income: 12000, production: 100, staff: 10, maintenance: 1100, security: 22, marketing: 42, logistics: 18, technology: 20, capacity: 80, reputation: 40, operatingExpenses: 2200, heatRisk: 0 },
  { id: 'cinema', name: 'Cinema', tier: 'Medium', category: 'Entertainment', level: 1, purchaseCost: 32000, upgradeCost: 17000, income: 15000, production: 110, staff: 12, maintenance: 1200, security: 24, marketing: 46, logistics: 20, technology: 21, capacity: 90, reputation: 45, operatingExpenses: 2600, heatRisk: 0 },
  { id: 'gym', name: 'Gym', tier: 'Medium', category: 'Wellness', level: 1, purchaseCost: 24000, upgradeCost: 13000, income: 10000, production: 85, staff: 8, maintenance: 860, security: 16, marketing: 32, logistics: 18, technology: 15, capacity: 70, reputation: 30, operatingExpenses: 1700, heatRisk: 0 },
  { id: 'dealership', name: 'Car Dealership', tier: 'Medium', category: 'Automotive', level: 1, purchaseCost: 35000, upgradeCost: 18000, income: 17000, production: 120, staff: 12, maintenance: 1400, security: 26, marketing: 48, logistics: 22, technology: 18, capacity: 100, reputation: 48, operatingExpenses: 3000, heatRisk: 0 },
  { id: 'gas-station', name: 'Gas Station', tier: 'Medium', category: 'Energy', level: 1, purchaseCost: 29000, upgradeCost: 15000, income: 13000, production: 100, staff: 9, maintenance: 1100, security: 21, marketing: 34, logistics: 19, technology: 17, capacity: 75, reputation: 36, operatingExpenses: 2200, heatRisk: 0 },
  { id: 'motel', name: 'Motel', tier: 'Medium', category: 'Hospitality', level: 1, purchaseCost: 27000, upgradeCost: 14500, income: 12000, production: 95, staff: 9, maintenance: 960, security: 20, marketing: 30, logistics: 17, technology: 15, capacity: 80, reputation: 34, operatingExpenses: 2100, heatRisk: 0 },
  { id: 'warehouse', name: 'Warehouse', tier: 'Medium', category: 'Logistics', level: 1, purchaseCost: 37000, upgradeCost: 19000, income: 18000, production: 125, staff: 13, maintenance: 1450, security: 28, marketing: 28, logistics: 40, technology: 20, capacity: 120, reputation: 44, operatingExpenses: 3200, heatRisk: 0 },
  { id: 'delivery-company', name: 'Delivery Company', tier: 'Medium', category: 'Logistics', level: 1, purchaseCost: 30000, upgradeCost: 16000, income: 15000, production: 115, staff: 11, maintenance: 1250, security: 22, marketing: 24, logistics: 34, technology: 18, capacity: 84, reputation: 38, operatingExpenses: 2600, heatRisk: 0 },
  { id: 'taxi-company', name: 'Taxi Company', tier: 'Medium', category: 'Transport', level: 1, purchaseCost: 28000, upgradeCost: 15000, income: 14000, production: 105, staff: 10, maintenance: 1120, security: 18, marketing: 26, logistics: 27, technology: 16, capacity: 82, reputation: 34, operatingExpenses: 2400, heatRisk: 0 },
  { id: 'auto-garage', name: 'Auto Garage', tier: 'Medium', category: 'Automotive', level: 1, purchaseCost: 33000, upgradeCost: 17000, income: 16000, production: 118, staff: 11, maintenance: 1260, security: 24, marketing: 29, logistics: 22, technology: 20, capacity: 88, reputation: 42, operatingExpenses: 2800, heatRisk: 0 },
  { id: 'boutique', name: 'Boutique', tier: 'Medium', category: 'Retail', level: 1, purchaseCost: 24000, upgradeCost: 13000, income: 10000, production: 82, staff: 8, maintenance: 890, security: 17, marketing: 31, logistics: 16, technology: 14, capacity: 70, reputation: 32, operatingExpenses: 1800, heatRisk: 0 },
  { id: 'construction-company', name: 'Construction Company', tier: 'Medium', category: 'Infrastructure', level: 1, purchaseCost: 42000, upgradeCost: 21000, income: 20000, production: 130, staff: 14, maintenance: 1500, security: 30, marketing: 38, logistics: 36, technology: 21, capacity: 100, reputation: 50, operatingExpenses: 3600, heatRisk: 0 },
  { id: 'computer-store', name: 'Computer Store', tier: 'Medium', category: 'Technology', level: 1, purchaseCost: 27000, upgradeCost: 14500, income: 12000, production: 95, staff: 9, maintenance: 980, security: 20, marketing: 32, logistics: 18, technology: 17, capacity: 80, reputation: 35, operatingExpenses: 2100, heatRisk: 0 },
  { id: 'event-company', name: 'Event Company', tier: 'Medium', category: 'Events', level: 1, purchaseCost: 31000, upgradeCost: 16500, income: 15000, production: 110, staff: 10, maintenance: 1200, security: 18, marketing: 49, logistics: 20, technology: 16, capacity: 90, reputation: 42, operatingExpenses: 2600, heatRisk: 0 },
  { id: 'cold-storage', name: 'Cold Storage Facility', tier: 'Medium', category: 'Logistics', level: 1, purchaseCost: 34000, upgradeCost: 18000, income: 17000, production: 118, staff: 12, maintenance: 1320, security: 25, marketing: 18, logistics: 38, technology: 19, capacity: 100, reputation: 40, operatingExpenses: 2900, heatRisk: 0 },
  { id: 'luxury-hotel', name: 'Luxury Hotel', tier: 'Large', category: 'Hospitality', level: 1, purchaseCost: 120000, upgradeCost: 60000, income: 52000, production: 220, staff: 17, maintenance: 4100, security: 42, marketing: 72, logistics: 32, technology: 24, capacity: 180, reputation: 72, operatingExpenses: 8500, heatRisk: 0 },
  { id: 'office-complex', name: 'Office Complex', tier: 'Large', category: 'Commercial', level: 1, purchaseCost: 105000, upgradeCost: 55000, income: 48000, production: 210, staff: 16, maintenance: 3600, security: 38, marketing: 62, logistics: 29, technology: 25, capacity: 170, reputation: 68, operatingExpenses: 7700, heatRisk: 0 },
  { id: 'factory', name: 'Factory', tier: 'Large', category: 'Industrial', level: 1, purchaseCost: 160000, upgradeCost: 75000, income: 62000, production: 280, staff: 22, maintenance: 5000, security: 48, marketing: 58, logistics: 44, technology: 30, capacity: 240, reputation: 80, operatingExpenses: 9800, heatRisk: 0 },
  { id: 'logistics-corp', name: 'Logistics Corporation', tier: 'Large', category: 'Logistics', level: 1, purchaseCost: 175000, upgradeCost: 85000, income: 70000, production: 300, staff: 24, maintenance: 5400, security: 52, marketing: 60, logistics: 62, technology: 32, capacity: 260, reputation: 90, operatingExpenses: 11100, heatRisk: 0 },
  { id: 'shipping-company', name: 'Shipping Company', tier: 'Large', category: 'Transport', level: 1, purchaseCost: 170000, upgradeCost: 82000, income: 68000, production: 290, staff: 23, maintenance: 5200, security: 48, marketing: 56, logistics: 60, technology: 31, capacity: 250, reputation: 86, operatingExpenses: 10000, heatRisk: 0 },
  { id: 'aviation-company', name: 'Aviation Company', tier: 'Large', category: 'Transport', level: 1, purchaseCost: 220000, upgradeCost: 98000, income: 82000, production: 320, staff: 27, maintenance: 7200, security: 56, marketing: 60, logistics: 54, technology: 34, capacity: 300, reputation: 100, operatingExpenses: 13100, heatRisk: 0 },
  { id: 'real-estate-corp', name: 'Real Estate Corporation', tier: 'Large', category: 'Property', level: 1, purchaseCost: 210000, upgradeCost: 94000, income: 78000, production: 310, staff: 26, maintenance: 6500, security: 52, marketing: 65, logistics: 42, technology: 30, capacity: 290, reputation: 95, operatingExpenses: 12400, heatRisk: 0 },
  { id: 'telecom-company', name: 'Telecommunications Company', tier: 'Large', category: 'Technology', level: 1, purchaseCost: 200000, upgradeCost: 90000, income: 76000, production: 300, staff: 25, maintenance: 6300, security: 50, marketing: 68, logistics: 39, technology: 38, capacity: 280, reputation: 90, operatingExpenses: 11800, heatRisk: 0 },
  { id: 'software-company', name: 'Software Company', tier: 'Large', category: 'Technology', level: 1, purchaseCost: 180000, upgradeCost: 85000, income: 70000, production: 290, staff: 24, maintenance: 5800, security: 46, marketing: 66, logistics: 37, technology: 40, capacity: 260, reputation: 88, operatingExpenses: 10600, heatRisk: 0 },
  { id: 'investment-firm', name: 'Investment Firm', tier: 'Large', category: 'Finance', level: 1, purchaseCost: 230000, upgradeCost: 110000, income: 86000, production: 330, staff: 27, maintenance: 7200, security: 54, marketing: 70, logistics: 40, technology: 35, capacity: 320, reputation: 100, operatingExpenses: 13000, heatRisk: 0 },
  { id: 'shopping-mall', name: 'Shopping Mall', tier: 'Large', category: 'Retail', level: 1, purchaseCost: 185000, upgradeCost: 88000, income: 71000, production: 300, staff: 24, maintenance: 5900, security: 49, marketing: 72, logistics: 44, technology: 29, capacity: 270, reputation: 85, operatingExpenses: 11000, heatRisk: 0 },
  { id: 'entertainment-complex', name: 'Entertainment Complex', tier: 'Large', category: 'Entertainment', level: 1, purchaseCost: 195000, upgradeCost: 90000, income: 74000, production: 305, staff: 24, maintenance: 6100, security: 51, marketing: 74, logistics: 41, technology: 30, capacity: 290, reputation: 92, operatingExpenses: 11800, heatRisk: 0 },
  { id: 'automotive-corp', name: 'Automotive Corporation', tier: 'Large', category: 'Automotive', level: 1, purchaseCost: 205000, upgradeCost: 96000, income: 76000, production: 315, staff: 25, maintenance: 6400, security: 53, marketing: 62, logistics: 48, technology: 33, capacity: 300, reputation: 96, operatingExpenses: 12000, heatRisk: 0 },
  { id: 'research-company', name: 'Research Company', tier: 'Large', category: 'Science', level: 1, purchaseCost: 175000, upgradeCost: 83000, income: 68000, production: 290, staff: 23, maintenance: 5500, security: 48, marketing: 63, logistics: 38, technology: 42, capacity: 250, reputation: 84, operatingExpenses: 10100, heatRisk: 0 },
  { id: 'bank', name: 'Bank', tier: 'Mega', category: 'Finance', level: 1, purchaseCost: 500000, upgradeCost: 260000, income: 190000, production: 450, staff: 35, maintenance: 16000, security: 74, marketing: 100, logistics: 60, technology: 50, capacity: 500, reputation: 140, operatingExpenses: 25000, heatRisk: 0 },
  { id: 'industrial-corp', name: 'Industrial Corporation', tier: 'Mega', category: 'Industrial', level: 1, purchaseCost: 560000, upgradeCost: 280000, income: 220000, production: 520, staff: 38, maintenance: 18000, security: 78, marketing: 82, logistics: 66, technology: 52, capacity: 560, reputation: 150, operatingExpenses: 28000, heatRisk: 0 },
  { id: 'energy-empire', name: 'Energy Empire', tier: 'Mega', category: 'Energy', level: 1, purchaseCost: 520000, upgradeCost: 270000, income: 210000, production: 500, staff: 36, maintenance: 17000, security: 76, marketing: 88, logistics: 64, technology: 50, capacity: 540, reputation: 145, operatingExpenses: 26000, heatRisk: 0 },
  { id: 'shipping-empire', name: 'Shipping Empire', tier: 'Mega', category: 'Transport', level: 1, purchaseCost: 540000, upgradeCost: 275000, income: 215000, production: 510, staff: 37, maintenance: 17500, security: 75, marketing: 84, logistics: 72, technology: 52, capacity: 540, reputation: 147, operatingExpenses: 27000, heatRisk: 0 },
  { id: 'property-conglomerate', name: 'Property Conglomerate', tier: 'Mega', category: 'Property', level: 1, purchaseCost: 590000, upgradeCost: 300000, income: 230000, production: 550, staff: 40, maintenance: 19000, security: 80, marketing: 92, logistics: 64, technology: 54, capacity: 620, reputation: 155, operatingExpenses: 29500, heatRisk: 0 },
  { id: 'technology-corp', name: 'Technology Corporation', tier: 'Mega', category: 'Technology', level: 1, purchaseCost: 610000, upgradeCost: 310000, income: 245000, production: 570, staff: 42, maintenance: 20000, security: 82, marketing: 96, logistics: 68, technology: 60, capacity: 630, reputation: 165, operatingExpenses: 31000, heatRisk: 0 },
  { id: 'financial-empire', name: 'Financial Empire', tier: 'Mega', category: 'Finance', level: 1, purchaseCost: 650000, upgradeCost: 340000, income: 260000, production: 590, staff: 44, maintenance: 22000, security: 88, marketing: 105, logistics: 70, technology: 58, capacity: 680, reputation: 170, operatingExpenses: 33000, heatRisk: 0 },
  { id: 'global-trading-corp', name: 'Global Trading Corporation', tier: 'Mega', category: 'Trade', level: 1, purchaseCost: 620000, upgradeCost: 320000, income: 250000, production: 580, staff: 43, maintenance: 20500, security: 84, marketing: 100, logistics: 72, technology: 56, capacity: 640, reputation: 168, operatingExpenses: 31500, heatRisk: 0 },
  { id: 'chemical-lab', name: 'Chemical Laboratory', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 90000, upgradeCost: 42000, income: 35000, production: 150, staff: 12, maintenance: 3600, security: 18, marketing: 15, logistics: 30, technology: 28, capacity: 120, reputation: 25, operatingExpenses: 5500, heatRisk: 60 },
  { id: 'underground-factory', name: 'Underground Factory', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 110000, upgradeCost: 50000, income: 45000, production: 175, staff: 15, maintenance: 4400, security: 20, marketing: 18, logistics: 34, technology: 31, capacity: 150, reputation: 30, operatingExpenses: 7000, heatRisk: 68 },
  { id: 'black-market-warehouse', name: 'Black Market Warehouse', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 125000, upgradeCost: 56000, income: 52000, production: 180, staff: 16, maintenance: 5000, security: 22, marketing: 20, logistics: 36, technology: 30, capacity: 150, reputation: 35, operatingExpenses: 7600, heatRisk: 70 },
  { id: 'smuggling-network', name: 'Smuggling Network', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 140000, upgradeCost: 65000, income: 60000, production: 200, staff: 18, maintenance: 5600, security: 24, marketing: 21, logistics: 40, technology: 32, capacity: 180, reputation: 42, operatingExpenses: 8200, heatRisk: 78 },
  { id: 'hidden-manufacturing', name: 'Hidden Manufacturing', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 165000, upgradeCost: 72000, income: 70000, production: 220, staff: 20, maintenance: 6200, security: 28, marketing: 24, logistics: 42, technology: 36, capacity: 220, reputation: 48, operatingExpenses: 9500, heatRisk: 82 },
  { id: 'chemical-lab', name: 'Chemical Laboratory', tier: 'Illegal', category: 'Shadow', level: 1, purchaseCost: 90000, upgradeCost: 42000, income: 35000, production: 150, staff: 12, maintenance: 3600, security: 18, marketing: 15, logistics: 30, technology: 28, capacity: 120, reputation: 25, operatingExpenses: 5500, heatRisk: 60 }
];

export const BUSINESS_CHAIN_BONUSES: Record<string, Record<string, number>> = {
  Factory: { Warehouse: 1.15, 'Logistics Corporation': 1.12, 'Supermarket': 1.1 },
  Warehouse: { Factory: 1.15, 'Distribution Center': 1.12, 'Delivery Company': 1.1 },
  'Logistics Corporation': { Warehouse: 1.12, 'Shipping Company': 1.1, 'Global Trading Corporation': 1.12 },
  'Supermarket': { Factory: 1.1, 'Warehouse': 1.1, 'Real Estate Corporation': 1.08 }
};

export function getBusinessByName(name: string): Business | undefined {
  return BUSINESS_CATALOG.find(entry => entry.name.toLowerCase() === name.toLowerCase());
}

export function calculateChainBonus(ownedBusinessNames: string[]): number {
  let bonus = 1;
  for (let i = 0; i < ownedBusinessNames.length; i++) {
    const current = ownedBusinessNames[i];
    for (let j = 0; j < ownedBusinessNames.length; j++) {
      if (i === j) continue;
      const chainMap = BUSINESS_CHAIN_BONUSES[current];
      if (chainMap && chainMap[ownedBusinessNames[j]]) {
        bonus *= chainMap[ownedBusinessNames[j]];
      }
    }
  }
  return Number(bonus.toFixed(3));
}

export function upgradeBusiness(business: Business): Business {
  business.level += 1;
  business.income *= 1.12;
  business.production *= 1.09;
  business.reputation += 5;
  return business;
}
