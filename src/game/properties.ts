import { chargeMoney, grantMoney, createLoan, withdrawFromBank } from './economy.js';
import type { Player } from './player.js';
import { getPropertyIncomeModifier, grantClassXp, grantXp } from './progression.js';

export type PropertyCategory = 'RESIDENTIAL' | 'COMMERCIAL' | 'HOSPITALITY' | 'INDUSTRIAL' | 'DEVELOPMENT' | 'CORPORATE' | 'LUXURY' | 'WATERFRONT' | 'ENTERTAINMENT' | 'TRANSPORT' | 'PORT' | 'HEALTHCARE' | 'EDUCATION' | 'FINANCIAL' | 'LAND' | 'TECHNOLOGY';
export type PropertyTier = 'TIER 1' | 'TIER 2' | 'TIER 3' | 'TIER 4' | 'TIER 5' | 'TIER 6';
export type PropertyCondition = 'EXCELLENT' | 'GOOD' | 'WORN' | 'POOR' | 'CRITICAL';
export type PropertyStatus = 'ACTIVE' | 'PAYMENT_DUE' | 'DELINQUENT' | 'DEFAULT_RISK' | 'SOLD' | 'LOCKED';
export type PropertyUpgradeType = 'DEVELOPMENT' | 'RENTAL' | 'SECURITY' | 'LUXURY' | 'MAINTENANCE' | 'AMENITIES';

export type PropertyDefinition = {
  id: string;
  name: string;
  category: PropertyCategory;
  tier: PropertyTier;
  location: string;
  purchasePrice: number;
  baseValue: number;
  baseIncome: number;
  appreciationRate: number;
  maintenanceCost: number;
  taxRate: number;
  securityRequirement: number;
  prestige: number;
  rentalPotential: number;
  developmentPotential: number;
  businessCompatibility: number;
  risk: number;
  demand: number;
  scarcity: number;
  maxLevel: number;
  tags: string[];
  unique?: boolean;
};

export type PropertyMortgage = {
  principal: number;
  outstandingBalance: number;
  downPayment: number;
  rate: number;
  termMonths: number;
  paymentAmount: number;
  createdAt: number;
  nextPaymentAt: number;
  status: 'ACTIVE' | 'PAID' | 'DELINQUENT' | 'DEFAULT';
};

export type PropertyState = {
  propertyId: string;
  level: number;
  purchasePrice: number;
  purchaseDate: number;
  currentValue: number;
  totalUpgradeCost: number;
  accumulatedIncome: number;
  lifetimeIncome: number;
  lifetimeExpenses: number;
  lifetimeProfit: number;
  maintenanceCondition: PropertyCondition;
  securityLevel: number;
  developmentLevel: number;
  rentalLevel: number;
  luxuryLevel: number;
  amenitiesLevel: number;
  occupancy: number;
  mortgage?: PropertyMortgage;
  lastIncomeAt: number;
  status: PropertyStatus;
  lastMaintenanceAt: number;
  lastTaxAt: number;
};

export const PROPERTY_LOCATIONS = {
  Downtown: { demand: 88, appreciation: 1.12, rentMultiplier: 1.22, security: 68, prestige: 82, developmentPotential: 80 },
  'Financial District': { demand: 92, appreciation: 1.18, rentMultiplier: 1.3, security: 78, prestige: 94, developmentPotential: 86 },
  'Night District': { demand: 70, appreciation: 1.08, rentMultiplier: 1.12, security: 55, prestige: 64, developmentPotential: 60 },
  'Industrial Zone': { demand: 74, appreciation: 1.06, rentMultiplier: 1.1, security: 48, prestige: 42, developmentPotential: 84 },
  'Port District': { demand: 78, appreciation: 1.1, rentMultiplier: 1.18, security: 52, prestige: 58, developmentPotential: 82 },
  'Airport District': { demand: 82, appreciation: 1.15, rentMultiplier: 1.2, security: 60, prestige: 70, developmentPotential: 78 },
  Waterfront: { demand: 86, appreciation: 1.17, rentMultiplier: 1.28, security: 72, prestige: 90, developmentPotential: 76 },
  Suburbs: { demand: 72, appreciation: 1.09, rentMultiplier: 1.08, security: 68, prestige: 56, developmentPotential: 70 },
  Uptown: { demand: 80, appreciation: 1.13, rentMultiplier: 1.16, security: 74, prestige: 79, developmentPotential: 75 },
  'Luxury District': { demand: 90, appreciation: 1.2, rentMultiplier: 1.38, security: 84, prestige: 98, developmentPotential: 72 }
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const roundMoney = (value: number): number => Number(Math.round((value + Number.EPSILON) * 100) / 100);

function getPropertyConditionMultiplier(condition: PropertyCondition): number {
  switch (condition) {
    case 'EXCELLENT': return 1.12;
    case 'GOOD': return 1;
    case 'WORN': return 0.86;
    case 'POOR': return 0.7;
    case 'CRITICAL': return 0.52;
    default: return 1;
  }
}

function getLocationProfile(locationName: string) {
  return PROPERTY_LOCATIONS[locationName as keyof typeof PROPERTY_LOCATIONS] ?? PROPERTY_LOCATIONS.Downtown;
}

function getPropertyConditionFromScore(score: number): PropertyCondition {
  if (score >= 88) return 'EXCELLENT';
  if (score >= 68) return 'GOOD';
  if (score >= 48) return 'WORN';
  if (score >= 28) return 'POOR';
  return 'CRITICAL';
}

export function getPropertyLocation(name: string) {
  return PROPERTY_LOCATIONS[name as keyof typeof PROPERTY_LOCATIONS] ?? PROPERTY_LOCATIONS.Downtown;
}

export const PROPERTY_CATALOG: PropertyDefinition[] = [
  { id: 'studio-apartment', name: 'Studio Apartment', category: 'RESIDENTIAL', tier: 'TIER 1', location: 'Downtown', purchasePrice: 82000, baseValue: 82000, baseIncome: 1200, appreciationRate: 0.04, maintenanceCost: 420, taxRate: 0.012, securityRequirement: 12, prestige: 20, rentalPotential: 16, developmentPotential: 12, businessCompatibility: 22, risk: 12, demand: 62, scarcity: 18, maxLevel: 8, tags: ['residential', 'entry', 'urban'], unique: false },
  { id: 'small-apartment', name: 'Small Apartment', category: 'RESIDENTIAL', tier: 'TIER 1', location: 'Suburbs', purchasePrice: 126000, baseValue: 126000, baseIncome: 1850, appreciationRate: 0.042, maintenanceCost: 560, taxRate: 0.013, securityRequirement: 14, prestige: 25, rentalPotential: 20, developmentPotential: 16, businessCompatibility: 24, risk: 10, demand: 68, scarcity: 21, maxLevel: 8, tags: ['residential', 'starter', 'tenant'], unique: false },
  { id: 'city-apartment', name: 'City Apartment', category: 'RESIDENTIAL', tier: 'TIER 2', location: 'Uptown', purchasePrice: 210000, baseValue: 210000, baseIncome: 3200, appreciationRate: 0.048, maintenanceCost: 880, taxRate: 0.014, securityRequirement: 18, prestige: 36, rentalPotential: 28, developmentPotential: 18, businessCompatibility: 30, risk: 14, demand: 74, scarcity: 26, maxLevel: 9, tags: ['residential', 'urban', 'rental'], unique: false },
  { id: 'luxury-apartment', name: 'Luxury Apartment', category: 'RESIDENTIAL', tier: 'TIER 3', location: 'Luxury District', purchasePrice: 420000, baseValue: 420000, baseIncome: 6200, appreciationRate: 0.052, maintenanceCost: 1500, taxRate: 0.017, securityRequirement: 28, prestige: 62, rentalPotential: 46, developmentPotential: 24, businessCompatibility: 36, risk: 18, demand: 84, scarcity: 36, maxLevel: 10, tags: ['residential', 'luxury', 'prestige'], unique: false },
  { id: 'penthouse', name: 'Penthouse', category: 'RESIDENTIAL', tier: 'TIER 4', location: 'Downtown', purchasePrice: 680000, baseValue: 680000, baseIncome: 9800, appreciationRate: 0.056, maintenanceCost: 2200, taxRate: 0.019, securityRequirement: 34, prestige: 84, rentalPotential: 58, developmentPotential: 28, businessCompatibility: 38, risk: 22, demand: 79, scarcity: 42, maxLevel: 10, tags: ['residential', 'luxury', 'skyline'], unique: false },
  { id: 'townhouse', name: 'Townhouse', category: 'RESIDENTIAL', tier: 'TIER 2', location: 'Suburbs', purchasePrice: 260000, baseValue: 260000, baseIncome: 4100, appreciationRate: 0.05, maintenanceCost: 980, taxRate: 0.015, securityRequirement: 20, prestige: 44, rentalPotential: 35, developmentPotential: 21, businessCompatibility: 28, risk: 16, demand: 72, scarcity: 25, maxLevel: 9, tags: ['residential', 'family', 'suburban'], unique: false },
  { id: 'suburban-house', name: 'Suburban House', category: 'RESIDENTIAL', tier: 'TIER 2', location: 'Suburbs', purchasePrice: 340000, baseValue: 340000, baseIncome: 5400, appreciationRate: 0.05, maintenanceCost: 1180, taxRate: 0.016, securityRequirement: 22, prestige: 48, rentalPotential: 40, developmentPotential: 24, businessCompatibility: 30, risk: 16, demand: 74, scarcity: 28, maxLevel: 10, tags: ['residential', 'family', 'suburban'], unique: false },
  { id: 'large-family-house', name: 'Large Family House', category: 'RESIDENTIAL', tier: 'TIER 3', location: 'Uptown', purchasePrice: 480000, baseValue: 480000, baseIncome: 7600, appreciationRate: 0.053, maintenanceCost: 1500, taxRate: 0.018, securityRequirement: 25, prestige: 58, rentalPotential: 52, developmentPotential: 30, businessCompatibility: 36, risk: 18, demand: 78, scarcity: 32, maxLevel: 10, tags: ['residential', 'family', 'premium'], unique: false },
  { id: 'mansion', name: 'Mansion', category: 'RESIDENTIAL', tier: 'TIER 4', location: 'Uptown', purchasePrice: 820000, baseValue: 820000, baseIncome: 12800, appreciationRate: 0.058, maintenanceCost: 2600, taxRate: 0.021, securityRequirement: 38, prestige: 90, rentalPotential: 68, developmentPotential: 34, businessCompatibility: 42, risk: 22, demand: 81, scarcity: 46, maxLevel: 11, tags: ['residential', 'luxury', 'prestige'], unique: false },
  { id: 'luxury-mansion', name: 'Luxury Mansion', category: 'LUXURY', tier: 'TIER 4', location: 'Luxury District', purchasePrice: 1400000, baseValue: 1400000, baseIncome: 20400, appreciationRate: 0.062, maintenanceCost: 4200, taxRate: 0.023, securityRequirement: 46, prestige: 112, rentalPotential: 82, developmentPotential: 38, businessCompatibility: 44, risk: 26, demand: 84, scarcity: 52, maxLevel: 12, tags: ['luxury', 'estate', 'prestige'], unique: false },
  { id: 'estate', name: 'Estate', category: 'LUXURY', tier: 'TIER 4', location: 'Luxury District', purchasePrice: 1850000, baseValue: 1850000, baseIncome: 26800, appreciationRate: 0.064, maintenanceCost: 5000, taxRate: 0.024, securityRequirement: 49, prestige: 118, rentalPotential: 90, developmentPotential: 42, businessCompatibility: 46, risk: 28, demand: 85, scarcity: 56, maxLevel: 12, tags: ['luxury', 'estate', 'status'], unique: false },
  { id: 'private-estate', name: 'Private Estate', category: 'LUXURY', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 2600000, baseValue: 2600000, baseIncome: 34000, appreciationRate: 0.066, maintenanceCost: 6200, taxRate: 0.026, securityRequirement: 58, prestige: 140, rentalPotential: 100, developmentPotential: 48, businessCompatibility: 48, risk: 30, demand: 86, scarcity: 64, maxLevel: 12, tags: ['luxury', 'exclusive', 'prestige'], unique: true },
  { id: 'gated-estate', name: 'Gated Estate', category: 'LUXURY', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 3250000, baseValue: 3250000, baseIncome: 39200, appreciationRate: 0.068, maintenanceCost: 7600, taxRate: 0.027, securityRequirement: 62, prestige: 150, rentalPotential: 105, developmentPotential: 52, businessCompatibility: 50, risk: 32, demand: 90, scarcity: 70, maxLevel: 12, tags: ['luxury', 'gated', 'private'], unique: true },
  { id: 'presidential-estate', name: 'Presidential Estate', category: 'LUXURY', tier: 'TIER 6', location: 'Luxury District', purchasePrice: 5200000, baseValue: 5200000, baseIncome: 54000, appreciationRate: 0.071, maintenanceCost: 11000, taxRate: 0.029, securityRequirement: 76, prestige: 190, rentalPotential: 122, developmentPotential: 60, businessCompatibility: 56, risk: 36, demand: 92, scarcity: 82, maxLevel: 13, tags: ['luxury', 'elite', 'status'], unique: true },
  { id: 'private-island-estate', name: 'Private Island Estate', category: 'WATERFRONT', tier: 'TIER 6', location: 'Waterfront', purchasePrice: 8800000, baseValue: 8800000, baseIncome: 61000, appreciationRate: 0.075, maintenanceCost: 14500, taxRate: 0.031, securityRequirement: 82, prestige: 220, rentalPotential: 150, developmentPotential: 68, businessCompatibility: 60, risk: 38, demand: 94, scarcity: 90, maxLevel: 13, tags: ['waterfront', 'island', 'elite'], unique: true },
  { id: 'small-retail-unit', name: 'Small Retail Unit', category: 'COMMERCIAL', tier: 'TIER 1', location: 'Downtown', purchasePrice: 145000, baseValue: 145000, baseIncome: 2400, appreciationRate: 0.048, maintenanceCost: 620, taxRate: 0.014, securityRequirement: 14, prestige: 28, rentalPotential: 26, developmentPotential: 18, businessCompatibility: 92, risk: 16, demand: 68, scarcity: 18, maxLevel: 9, tags: ['retail', 'commercial', 'neighborhood'], unique: false },
  { id: 'downtown-retail-unit', name: 'Downtown Retail Unit', category: 'COMMERCIAL', tier: 'TIER 2', location: 'Downtown', purchasePrice: 280000, baseValue: 280000, baseIncome: 4700, appreciationRate: 0.05, maintenanceCost: 1100, taxRate: 0.016, securityRequirement: 18, prestige: 44, rentalPotential: 42, developmentPotential: 22, businessCompatibility: 96, risk: 18, demand: 74, scarcity: 24, maxLevel: 10, tags: ['retail', 'urban', 'commercial'], unique: false },
  { id: 'office-suite', name: 'Office Suite', category: 'COMMERCIAL', tier: 'TIER 1', location: 'Financial District', purchasePrice: 240000, baseValue: 240000, baseIncome: 3900, appreciationRate: 0.05, maintenanceCost: 970, taxRate: 0.016, securityRequirement: 18, prestige: 40, rentalPotential: 34, developmentPotential: 22, businessCompatibility: 94, risk: 14, demand: 75, scarcity: 20, maxLevel: 9, tags: ['office', 'commercial', 'business'], unique: false },
  { id: 'small-office-building', name: 'Small Office Building', category: 'COMMERCIAL', tier: 'TIER 2', location: 'Financial District', purchasePrice: 420000, baseValue: 420000, baseIncome: 7600, appreciationRate: 0.053, maintenanceCost: 1800, taxRate: 0.019, securityRequirement: 22, prestige: 58, rentalPotential: 54, developmentPotential: 28, businessCompatibility: 98, risk: 18, demand: 79, scarcity: 28, maxLevel: 10, tags: ['office', 'commercial', 'corporate'], unique: false },
  { id: 'business-center', name: 'Business Center', category: 'COMMERCIAL', tier: 'TIER 3', location: 'Financial District', purchasePrice: 700000, baseValue: 700000, baseIncome: 12800, appreciationRate: 0.056, maintenanceCost: 2400, taxRate: 0.021, securityRequirement: 30, prestige: 75, rentalPotential: 70, developmentPotential: 36, businessCompatibility: 100, risk: 25, demand: 81, scarcity: 34, maxLevel: 11, tags: ['office', 'commercial', 'hub'], unique: false },
  { id: 'office-tower', name: 'Office Tower', category: 'CORPORATE', tier: 'TIER 4', location: 'Financial District', purchasePrice: 1420000, baseValue: 1420000, baseIncome: 24500, appreciationRate: 0.061, maintenanceCost: 4200, taxRate: 0.024, securityRequirement: 42, prestige: 120, rentalPotential: 92, developmentPotential: 46, businessCompatibility: 102, risk: 28, demand: 86, scarcity: 48, maxLevel: 12, tags: ['corporate', 'office', 'prestige'], unique: false },
  { id: 'shopping-center', name: 'Shopping Center', category: 'COMMERCIAL', tier: 'TIER 3', location: 'Downtown', purchasePrice: 980000, baseValue: 980000, baseIncome: 18400, appreciationRate: 0.057, maintenanceCost: 3000, taxRate: 0.022, securityRequirement: 32, prestige: 94, rentalPotential: 86, developmentPotential: 42, businessCompatibility: 102, risk: 24, demand: 82, scarcity: 40, maxLevel: 11, tags: ['retail', 'commercial', 'shopping'], unique: false },
  { id: 'shopping-mall', name: 'Shopping Mall', category: 'COMMERCIAL', tier: 'TIER 4', location: 'Downtown', purchasePrice: 2100000, baseValue: 2100000, baseIncome: 32000, appreciationRate: 0.06, maintenanceCost: 5200, taxRate: 0.026, securityRequirement: 40, prestige: 130, rentalPotential: 118, developmentPotential: 50, businessCompatibility: 104, risk: 26, demand: 87, scarcity: 52, maxLevel: 12, tags: ['retail', 'mall', 'destination'], unique: false },
  { id: 'luxury-mall', name: 'Luxury Mall', category: 'LUXURY', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 3600000, baseValue: 3600000, baseIncome: 44000, appreciationRate: 0.065, maintenanceCost: 7600, taxRate: 0.028, securityRequirement: 50, prestige: 180, rentalPotential: 130, developmentPotential: 54, businessCompatibility: 110, risk: 32, demand: 90, scarcity: 66, maxLevel: 12, tags: ['luxury', 'retail', 'flagship'], unique: false },
  { id: 'commercial-plaza', name: 'Commercial Plaza', category: 'COMMERCIAL', tier: 'TIER 3', location: 'Uptown', purchasePrice: 820000, baseValue: 820000, baseIncome: 14600, appreciationRate: 0.055, maintenanceCost: 2800, taxRate: 0.019, securityRequirement: 28, prestige: 82, rentalPotential: 78, developmentPotential: 38, businessCompatibility: 100, risk: 22, demand: 80, scarcity: 36, maxLevel: 11, tags: ['retail', 'commercial', 'mixed-use'], unique: false },
  { id: 'corporate-campus', name: 'Corporate Campus', category: 'CORPORATE', tier: 'TIER 5', location: 'Financial District', purchasePrice: 4800000, baseValue: 4800000, baseIncome: 56000, appreciationRate: 0.068, maintenanceCost: 9800, taxRate: 0.03, securityRequirement: 60, prestige: 210, rentalPotential: 138, developmentPotential: 62, businessCompatibility: 112, risk: 34, demand: 90, scarcity: 72, maxLevel: 13, tags: ['corporate', 'campus', 'business'], unique: true },
  { id: 'motel', name: 'Motel', category: 'HOSPITALITY', tier: 'TIER 1', location: 'Airport District', purchasePrice: 220000, baseValue: 220000, baseIncome: 3600, appreciationRate: 0.045, maintenanceCost: 900, taxRate: 0.014, securityRequirement: 18, prestige: 32, rentalPotential: 32, developmentPotential: 20, businessCompatibility: 60, risk: 18, demand: 70, scarcity: 18, maxLevel: 9, tags: ['hospitality', 'travel', 'budget'], unique: false },
  { id: 'budget-hotel', name: 'Budget Hotel', category: 'HOSPITALITY', tier: 'TIER 2', location: 'Airport District', purchasePrice: 360000, baseValue: 360000, baseIncome: 6400, appreciationRate: 0.047, maintenanceCost: 1400, taxRate: 0.016, securityRequirement: 22, prestige: 42, rentalPotential: 48, developmentPotential: 26, businessCompatibility: 70, risk: 18, demand: 74, scarcity: 22, maxLevel: 10, tags: ['hospitality', 'travel', 'entry'], unique: false },
  { id: 'city-hotel', name: 'City Hotel', category: 'HOSPITALITY', tier: 'TIER 2', location: 'Downtown', purchasePrice: 540000, baseValue: 540000, baseIncome: 10200, appreciationRate: 0.05, maintenanceCost: 2000, taxRate: 0.018, securityRequirement: 26, prestige: 58, rentalPotential: 62, developmentPotential: 30, businessCompatibility: 78, risk: 20, demand: 78, scarcity: 28, maxLevel: 10, tags: ['hospitality', 'city', 'occupancy'], unique: false },
  { id: 'business-hotel', name: 'Business Hotel', category: 'HOSPITALITY', tier: 'TIER 3', location: 'Financial District', purchasePrice: 900000, baseValue: 900000, baseIncome: 16800, appreciationRate: 0.055, maintenanceCost: 3000, taxRate: 0.02, securityRequirement: 32, prestige: 78, rentalPotential: 86, developmentPotential: 36, businessCompatibility: 86, risk: 24, demand: 82, scarcity: 34, maxLevel: 11, tags: ['hospitality', 'business', 'travel'], unique: false },
  { id: 'resort', name: 'Resort', category: 'HOSPITALITY', tier: 'TIER 4', location: 'Waterfront', purchasePrice: 1700000, baseValue: 1700000, baseIncome: 24400, appreciationRate: 0.06, maintenanceCost: 4200, taxRate: 0.022, securityRequirement: 40, prestige: 110, rentalPotential: 110, developmentPotential: 44, businessCompatibility: 92, risk: 26, demand: 86, scarcity: 46, maxLevel: 12, tags: ['hospitality', 'waterfront', 'luxury'], unique: false },
  { id: 'luxury-resort', name: 'Luxury Resort', category: 'HOSPITALITY', tier: 'TIER 5', location: 'Waterfront', purchasePrice: 3000000, baseValue: 3000000, baseIncome: 36000, appreciationRate: 0.065, maintenanceCost: 6200, taxRate: 0.026, securityRequirement: 52, prestige: 175, rentalPotential: 132, developmentPotential: 56, businessCompatibility: 96, risk: 30, demand: 90, scarcity: 68, maxLevel: 12, tags: ['hospitality', 'waterfront', 'elite'], unique: false },
  { id: 'boutique-hotel', name: 'Boutique Hotel', category: 'HOSPITALITY', tier: 'TIER 3', location: 'Night District', purchasePrice: 760000, baseValue: 760000, baseIncome: 13200, appreciationRate: 0.055, maintenanceCost: 2600, taxRate: 0.02, securityRequirement: 28, prestige: 82, rentalPotential: 72, developmentPotential: 30, businessCompatibility: 80, risk: 22, demand: 80, scarcity: 32, maxLevel: 11, tags: ['hospitality', 'boutique', 'nightlife'], unique: false },
  { id: 'grand-hotel', name: 'Grand Hotel', category: 'HOSPITALITY', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 4200000, baseValue: 4200000, baseIncome: 48000, appreciationRate: 0.068, maintenanceCost: 8400, taxRate: 0.028, securityRequirement: 60, prestige: 200, rentalPotential: 148, developmentPotential: 64, businessCompatibility: 100, risk: 32, demand: 90, scarcity: 72, maxLevel: 13, tags: ['hospitality', 'luxury', 'flagship'], unique: false },
  { id: 'casino-hotel', name: 'Casino Hotel', category: 'ENTERTAINMENT', tier: 'TIER 5', location: 'Night District', purchasePrice: 5100000, baseValue: 5100000, baseIncome: 52000, appreciationRate: 0.069, maintenanceCost: 9800, taxRate: 0.03, securityRequirement: 72, prestige: 220, rentalPotential: 156, developmentPotential: 66, businessCompatibility: 108, risk: 38, demand: 92, scarcity: 74, maxLevel: 13, tags: ['entertainment', 'gambling', 'prestige'], unique: true },
  { id: 'waterfront-resort', name: 'Waterfront Resort', category: 'WATERFRONT', tier: 'TIER 5', location: 'Waterfront', purchasePrice: 4700000, baseValue: 4700000, baseIncome: 50000, appreciationRate: 0.07, maintenanceCost: 9200, taxRate: 0.029, securityRequirement: 58, prestige: 188, rentalPotential: 144, developmentPotential: 62, businessCompatibility: 100, risk: 34, demand: 90, scarcity: 70, maxLevel: 13, tags: ['waterfront', 'resort', 'luxury'], unique: false },
  { id: 'storage-yard', name: 'Storage Yard', category: 'INDUSTRIAL', tier: 'TIER 1', location: 'Industrial Zone', purchasePrice: 160000, baseValue: 160000, baseIncome: 2400, appreciationRate: 0.045, maintenanceCost: 680, taxRate: 0.013, securityRequirement: 14, prestige: 22, rentalPotential: 25, developmentPotential: 18, businessCompatibility: 88, risk: 16, demand: 68, scarcity: 20, maxLevel: 9, tags: ['industrial', 'storage', 'logistics'], unique: false },
  { id: 'small-warehouse', name: 'Small Warehouse', category: 'INDUSTRIAL', tier: 'TIER 2', location: 'Industrial Zone', purchasePrice: 280000, baseValue: 280000, baseIncome: 4600, appreciationRate: 0.047, maintenanceCost: 1200, taxRate: 0.015, securityRequirement: 18, prestige: 32, rentalPotential: 36, developmentPotential: 24, businessCompatibility: 90, risk: 18, demand: 75, scarcity: 26, maxLevel: 10, tags: ['industrial', 'warehouse', 'logistics'], unique: false },
  { id: 'warehouse', name: 'Warehouse', category: 'INDUSTRIAL', tier: 'TIER 2', location: 'Port District', purchasePrice: 520000, baseValue: 520000, baseIncome: 8200, appreciationRate: 0.049, maintenanceCost: 1900, taxRate: 0.017, securityRequirement: 24, prestige: 42, rentalPotential: 58, developmentPotential: 30, businessCompatibility: 92, risk: 20, demand: 78, scarcity: 30, maxLevel: 11, tags: ['industrial', 'warehouse', 'distribution'], unique: false },
  { id: 'large-warehouse', name: 'Large Warehouse', category: 'INDUSTRIAL', tier: 'TIER 3', location: 'Port District', purchasePrice: 870000, baseValue: 870000, baseIncome: 14800, appreciationRate: 0.053, maintenanceCost: 2600, taxRate: 0.019, securityRequirement: 30, prestige: 56, rentalPotential: 74, developmentPotential: 38, businessCompatibility: 96, risk: 24, demand: 80, scarcity: 36, maxLevel: 11, tags: ['industrial', 'warehouse', 'bulk'], unique: false },
  { id: 'distribution-center', name: 'Distribution Center', category: 'INDUSTRIAL', tier: 'TIER 4', location: 'Airport District', purchasePrice: 1500000, baseValue: 1500000, baseIncome: 24600, appreciationRate: 0.057, maintenanceCost: 3600, taxRate: 0.022, securityRequirement: 38, prestige: 70, rentalPotential: 88, developmentPotential: 48, businessCompatibility: 98, risk: 26, demand: 83, scarcity: 42, maxLevel: 12, tags: ['industrial', 'logistics', 'distribution'], unique: false },
  { id: 'industrial-building', name: 'Industrial Building', category: 'INDUSTRIAL', tier: 'TIER 3', location: 'Industrial Zone', purchasePrice: 940000, baseValue: 940000, baseIncome: 15800, appreciationRate: 0.055, maintenanceCost: 2700, taxRate: 0.02, securityRequirement: 30, prestige: 60, rentalPotential: 80, developmentPotential: 40, businessCompatibility: 94, risk: 24, demand: 82, scarcity: 34, maxLevel: 11, tags: ['industrial', 'production', 'space'], unique: false },
  { id: 'industrial-park', name: 'Industrial Park', category: 'INDUSTRIAL', tier: 'TIER 4', location: 'Industrial Zone', purchasePrice: 2100000, baseValue: 2100000, baseIncome: 32600, appreciationRate: 0.059, maintenanceCost: 4600, taxRate: 0.023, securityRequirement: 42, prestige: 74, rentalPotential: 96, developmentPotential: 56, businessCompatibility: 100, risk: 28, demand: 84, scarcity: 46, maxLevel: 12, tags: ['industrial', 'park', 'logistics'], unique: false },
  { id: 'factory-site', name: 'Factory Site', category: 'INDUSTRIAL', tier: 'TIER 4', location: 'Industrial Zone', purchasePrice: 2300000, baseValue: 2300000, baseIncome: 35000, appreciationRate: 0.059, maintenanceCost: 5000, taxRate: 0.024, securityRequirement: 46, prestige: 84, rentalPotential: 100, developmentPotential: 58, businessCompatibility: 102, risk: 30, demand: 84, scarcity: 48, maxLevel: 12, tags: ['industrial', 'manufacturing', 'scale'], unique: false },
  { id: 'manufacturing-complex', name: 'Manufacturing Complex', category: 'INDUSTRIAL', tier: 'TIER 5', location: 'Industrial Zone', purchasePrice: 3800000, baseValue: 3800000, baseIncome: 47000, appreciationRate: 0.063, maintenanceCost: 7200, taxRate: 0.027, securityRequirement: 54, prestige: 100, rentalPotential: 120, developmentPotential: 64, businessCompatibility: 108, risk: 30, demand: 88, scarcity: 58, maxLevel: 13, tags: ['industrial', 'manufacturing', 'major'], unique: false },
  { id: 'logistics-hub', name: 'Logistics Hub', category: 'INDUSTRIAL', tier: 'TIER 5', location: 'Port District', purchasePrice: 4300000, baseValue: 4300000, baseIncome: 50000, appreciationRate: 0.064, maintenanceCost: 8200, taxRate: 0.028, securityRequirement: 58, prestige: 110, rentalPotential: 126, developmentPotential: 68, businessCompatibility: 110, risk: 32, demand: 88, scarcity: 60, maxLevel: 13, tags: ['industrial', 'logistics', 'transport'], unique: false },
  { id: 'executive-office', name: 'Executive Office', category: 'CORPORATE', tier: 'TIER 2', location: 'Financial District', purchasePrice: 330000, baseValue: 330000, baseIncome: 5200, appreciationRate: 0.051, maintenanceCost: 1300, taxRate: 0.017, securityRequirement: 20, prestige: 52, rentalPotential: 42, developmentPotential: 24, businessCompatibility: 95, risk: 16, demand: 74, scarcity: 22, maxLevel: 10, tags: ['corporate', 'executive', 'office'], unique: false },
  { id: 'corporate-office', name: 'Corporate Office', category: 'CORPORATE', tier: 'TIER 3', location: 'Financial District', purchasePrice: 620000, baseValue: 620000, baseIncome: 9800, appreciationRate: 0.055, maintenanceCost: 2200, taxRate: 0.019, securityRequirement: 28, prestige: 78, rentalPotential: 68, developmentPotential: 32, businessCompatibility: 98, risk: 20, demand: 80, scarcity: 30, maxLevel: 11, tags: ['corporate', 'office', 'business'], unique: false },
  { id: 'business-tower', name: 'Business Tower', category: 'CORPORATE', tier: 'TIER 4', location: 'Financial District', purchasePrice: 1200000, baseValue: 1200000, baseIncome: 19600, appreciationRate: 0.06, maintenanceCost: 3400, taxRate: 0.023, securityRequirement: 38, prestige: 110, rentalPotential: 92, developmentPotential: 42, businessCompatibility: 100, risk: 24, demand: 83, scarcity: 42, maxLevel: 12, tags: ['corporate', 'office', 'tower'], unique: false },
  { id: 'corporate-headquarters', name: 'Corporate Headquarters', category: 'CORPORATE', tier: 'TIER 5', location: 'Financial District', purchasePrice: 2200000, baseValue: 2200000, baseIncome: 30000, appreciationRate: 0.064, maintenanceCost: 5000, taxRate: 0.026, securityRequirement: 48, prestige: 150, rentalPotential: 118, developmentPotential: 52, businessCompatibility: 104, risk: 28, demand: 86, scarcity: 58, maxLevel: 12, tags: ['corporate', 'headquarters', 'prestige'], unique: false },
  { id: 'premium-tower', name: 'Premium Tower', category: 'CORPORATE', tier: 'TIER 5', location: 'Downtown', purchasePrice: 2600000, baseValue: 2600000, baseIncome: 33600, appreciationRate: 0.066, maintenanceCost: 6200, taxRate: 0.027, securityRequirement: 54, prestige: 170, rentalPotential: 126, developmentPotential: 58, businessCompatibility: 106, risk: 30, demand: 88, scarcity: 62, maxLevel: 13, tags: ['corporate', 'premium', 'tower'], unique: false },
  { id: 'financial-tower', name: 'Financial Tower', category: 'FINANCIAL', tier: 'TIER 6', location: 'Financial District', purchasePrice: 7200000, baseValue: 7200000, baseIncome: 68000, appreciationRate: 0.072, maintenanceCost: 11800, taxRate: 0.032, securityRequirement: 82, prestige: 240, rentalPotential: 172, developmentPotential: 72, businessCompatibility: 120, risk: 36, demand: 94, scarcity: 86, maxLevel: 13, tags: ['financial', 'tower', 'elite'], unique: true },
  { id: 'international-business-center', name: 'International Business Center', category: 'CORPORATE', tier: 'TIER 6', location: 'Downtown', purchasePrice: 9500000, baseValue: 9500000, baseIncome: 82000, appreciationRate: 0.074, maintenanceCost: 15000, taxRate: 0.034, securityRequirement: 90, prestige: 270, rentalPotential: 190, developmentPotential: 76, businessCompatibility: 122, risk: 40, demand: 96, scarcity: 92, maxLevel: 13, tags: ['corporate', 'international', 'mega'], unique: true },
  { id: 'skyscraper', name: 'Skyscraper', category: 'CORPORATE', tier: 'TIER 6', location: 'Downtown', purchasePrice: 10400000, baseValue: 10400000, baseIncome: 89000, appreciationRate: 0.075, maintenanceCost: 16800, taxRate: 0.035, securityRequirement: 92, prestige: 295, rentalPotential: 200, developmentPotential: 78, businessCompatibility: 124, risk: 42, demand: 97, scarcity: 94, maxLevel: 14, tags: ['corporate', 'skyscraper', 'endgame'], unique: true },
  { id: 'mega-tower', name: 'Mega Tower', category: 'CORPORATE', tier: 'TIER 6', location: 'Downtown', purchasePrice: 11800000, baseValue: 11800000, baseIncome: 98000, appreciationRate: 0.076, maintenanceCost: 18200, taxRate: 0.036, securityRequirement: 96, prestige: 320, rentalPotential: 214, developmentPotential: 80, businessCompatibility: 126, risk: 44, demand: 98, scarcity: 96, maxLevel: 14, tags: ['corporate', 'mega', 'endgame'], unique: true },
  { id: 'skyline-penthouse', name: 'Skyline Penthouse', category: 'LUXURY', tier: 'TIER 5', location: 'Downtown', purchasePrice: 2200000, baseValue: 2200000, baseIncome: 26000, appreciationRate: 0.068, maintenanceCost: 4300, taxRate: 0.027, securityRequirement: 52, prestige: 182, rentalPotential: 108, developmentPotential: 48, businessCompatibility: 54, risk: 28, demand: 88, scarcity: 64, maxLevel: 12, tags: ['luxury', 'penthouse', 'skyline'], unique: false },
  { id: 'mansion-estate', name: 'Mansion Estate', category: 'LUXURY', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 2800000, baseValue: 2800000, baseIncome: 31200, appreciationRate: 0.07, maintenanceCost: 5600, taxRate: 0.029, securityRequirement: 58, prestige: 198, rentalPotential: 118, developmentPotential: 54, businessCompatibility: 58, risk: 30, demand: 90, scarcity: 68, maxLevel: 12, tags: ['luxury', 'estate', 'status'], unique: false },
  { id: 'ultra-luxury-mansion', name: 'Ultra-Luxury Mansion', category: 'LUXURY', tier: 'TIER 6', location: 'Luxury District', purchasePrice: 6400000, baseValue: 6400000, baseIncome: 64000, appreciationRate: 0.073, maintenanceCost: 12000, taxRate: 0.032, securityRequirement: 82, prestige: 235, rentalPotential: 160, developmentPotential: 70, businessCompatibility: 62, risk: 36, demand: 92, scarcity: 78, maxLevel: 13, tags: ['luxury', 'mansion', 'elite'], unique: true },
  { id: 'private-compound', name: 'Private Compound', category: 'LUXURY', tier: 'TIER 5', location: 'Waterfront', purchasePrice: 4100000, baseValue: 4100000, baseIncome: 42000, appreciationRate: 0.069, maintenanceCost: 8100, taxRate: 0.028, securityRequirement: 64, prestige: 202, rentalPotential: 136, developmentPotential: 60, businessCompatibility: 60, risk: 32, demand: 90, scarcity: 72, maxLevel: 13, tags: ['luxury', 'compound', 'security'], unique: false },
  { id: 'luxury-waterfront-estate', name: 'Luxury Waterfront Estate', category: 'WATERFRONT', tier: 'TIER 5', location: 'Waterfront', purchasePrice: 5300000, baseValue: 5300000, baseIncome: 54000, appreciationRate: 0.071, maintenanceCost: 10200, taxRate: 0.03, securityRequirement: 68, prestige: 215, rentalPotential: 146, developmentPotential: 64, businessCompatibility: 64, risk: 34, demand: 92, scarcity: 76, maxLevel: 13, tags: ['waterfront', 'luxury', 'prestige'], unique: false },
  { id: 'island-villa', name: 'Island Villa', category: 'WATERFRONT', tier: 'TIER 5', location: 'Waterfront', purchasePrice: 3600000, baseValue: 3600000, baseIncome: 39000, appreciationRate: 0.069, maintenanceCost: 7200, taxRate: 0.028, securityRequirement: 56, prestige: 172, rentalPotential: 124, developmentPotential: 58, businessCompatibility: 58, risk: 30, demand: 88, scarcity: 68, maxLevel: 13, tags: ['waterfront', 'villa', 'private'], unique: false },
  { id: 'private-island', name: 'Private Island', category: 'WATERFRONT', tier: 'TIER 6', location: 'Waterfront', purchasePrice: 11800000, baseValue: 11800000, baseIncome: 98000, appreciationRate: 0.078, maintenanceCost: 18000, taxRate: 0.034, securityRequirement: 96, prestige: 330, rentalPotential: 220, developmentPotential: 82, businessCompatibility: 72, risk: 44, demand: 98, scarcity: 97, maxLevel: 14, tags: ['waterfront', 'island', 'elite'], unique: true },
  { id: 'billionaire-estate', name: 'Billionaire Estate', category: 'LUXURY', tier: 'TIER 6', location: 'Luxury District', purchasePrice: 14600000, baseValue: 14600000, baseIncome: 110000, appreciationRate: 0.079, maintenanceCost: 22000, taxRate: 0.036, securityRequirement: 100, prestige: 360, rentalPotential: 236, developmentPotential: 84, businessCompatibility: 74, risk: 46, demand: 98, scarcity: 98, maxLevel: 14, tags: ['luxury', 'elite', 'billionaire'], unique: true },
  { id: 'private-clinic', name: 'Private Clinic Building', category: 'HEALTHCARE', tier: 'TIER 3', location: 'Uptown', purchasePrice: 460000, baseValue: 460000, baseIncome: 7200, appreciationRate: 0.051, maintenanceCost: 1700, taxRate: 0.018, securityRequirement: 24, prestige: 62, rentalPotential: 54, developmentPotential: 30, businessCompatibility: 72, risk: 18, demand: 76, scarcity: 26, maxLevel: 10, tags: ['healthcare', 'clinic', 'service'], unique: false },
  { id: 'medical-center', name: 'Medical Center', category: 'HEALTHCARE', tier: 'TIER 4', location: 'Downtown', purchasePrice: 980000, baseValue: 980000, baseIncome: 15800, appreciationRate: 0.056, maintenanceCost: 2900, taxRate: 0.021, securityRequirement: 32, prestige: 92, rentalPotential: 82, developmentPotential: 40, businessCompatibility: 80, risk: 20, demand: 80, scarcity: 34, maxLevel: 11, tags: ['healthcare', 'medical', 'community'], unique: false },
  { id: 'school-complex', name: 'School Complex', category: 'EDUCATION', tier: 'TIER 3', location: 'Suburbs', purchasePrice: 740000, baseValue: 740000, baseIncome: 11200, appreciationRate: 0.053, maintenanceCost: 2200, taxRate: 0.019, securityRequirement: 26, prestige: 68, rentalPotential: 66, developmentPotential: 36, businessCompatibility: 70, risk: 18, demand: 76, scarcity: 28, maxLevel: 11, tags: ['education', 'school', 'community'], unique: false },
  { id: 'university-campus', name: 'University Campus', category: 'EDUCATION', tier: 'TIER 5', location: 'Uptown', purchasePrice: 3600000, baseValue: 3600000, baseIncome: 42000, appreciationRate: 0.065, maintenanceCost: 7600, taxRate: 0.028, securityRequirement: 52, prestige: 180, rentalPotential: 138, developmentPotential: 56, businessCompatibility: 78, risk: 24, demand: 86, scarcity: 52, maxLevel: 13, tags: ['education', 'campus', 'prestige'], unique: false },
  { id: 'arena', name: 'Arena', category: 'ENTERTAINMENT', tier: 'TIER 4', location: 'Downtown', purchasePrice: 2400000, baseValue: 2400000, baseIncome: 30000, appreciationRate: 0.061, maintenanceCost: 5200, taxRate: 0.025, securityRequirement: 48, prestige: 120, rentalPotential: 110, developmentPotential: 54, businessCompatibility: 82, risk: 28, demand: 82, scarcity: 42, maxLevel: 12, tags: ['entertainment', 'arena', 'events'], unique: false },
  { id: 'concert-venue', name: 'Concert Venue', category: 'ENTERTAINMENT', tier: 'TIER 4', location: 'Night District', purchasePrice: 2100000, baseValue: 2100000, baseIncome: 28000, appreciationRate: 0.06, maintenanceCost: 4600, taxRate: 0.024, securityRequirement: 44, prestige: 118, rentalPotential: 103, developmentPotential: 52, businessCompatibility: 80, risk: 24, demand: 80, scarcity: 38, maxLevel: 12, tags: ['entertainment', 'venue', 'nightlife'], unique: false },
  { id: 'recording-complex', name: 'Recording Complex', category: 'ENTERTAINMENT', tier: 'TIER 3', location: 'Night District', purchasePrice: 860000, baseValue: 860000, baseIncome: 15400, appreciationRate: 0.055, maintenanceCost: 2900, taxRate: 0.02, securityRequirement: 30, prestige: 72, rentalPotential: 78, developmentPotential: 34, businessCompatibility: 76, risk: 20, demand: 76, scarcity: 26, maxLevel: 11, tags: ['entertainment', 'studio', 'media'], unique: false },
  { id: 'film-studio', name: 'Film Studio', category: 'ENTERTAINMENT', tier: 'TIER 5', location: 'Downtown', purchasePrice: 4200000, baseValue: 4200000, baseIncome: 45000, appreciationRate: 0.067, maintenanceCost: 8400, taxRate: 0.029, securityRequirement: 56, prestige: 190, rentalPotential: 145, developmentPotential: 60, businessCompatibility: 88, risk: 28, demand: 85, scarcity: 56, maxLevel: 13, tags: ['entertainment', 'studio', 'media'], unique: false },
  { id: 'data-center-property', name: 'Data Center Property', category: 'TECHNOLOGY', tier: 'TIER 5', location: 'Financial District', purchasePrice: 5400000, baseValue: 5400000, baseIncome: 56000, appreciationRate: 0.07, maintenanceCost: 9100, taxRate: 0.029, securityRequirement: 66, prestige: 184, rentalPotential: 150, developmentPotential: 64, businessCompatibility: 120, risk: 26, demand: 88, scarcity: 62, maxLevel: 13, tags: ['technology', 'data', 'infrastructure'], unique: false },
  { id: 'research-campus', name: 'Research Campus', category: 'EDUCATION', tier: 'TIER 5', location: 'Uptown', purchasePrice: 4400000, baseValue: 4400000, baseIncome: 52000, appreciationRate: 0.068, maintenanceCost: 8300, taxRate: 0.029, securityRequirement: 58, prestige: 176, rentalPotential: 140, developmentPotential: 60, businessCompatibility: 84, risk: 22, demand: 88, scarcity: 60, maxLevel: 13, tags: ['research', 'campus', 'innovation'], unique: false },
  { id: 'private-hangar', name: 'Private Hangar', category: 'TRANSPORT', tier: 'TIER 4', location: 'Airport District', purchasePrice: 1500000, baseValue: 1500000, baseIncome: 24000, appreciationRate: 0.058, maintenanceCost: 3600, taxRate: 0.022, securityRequirement: 36, prestige: 88, rentalPotential: 72, developmentPotential: 40, businessCompatibility: 76, risk: 22, demand: 76, scarcity: 30, maxLevel: 11, tags: ['transport', 'air', 'private'], unique: false },
  { id: 'airport-facility', name: 'Airport Facility', category: 'TRANSPORT', tier: 'TIER 5', location: 'Airport District', purchasePrice: 5200000, baseValue: 5200000, baseIncome: 58000, appreciationRate: 0.067, maintenanceCost: 9200, taxRate: 0.029, securityRequirement: 60, prestige: 186, rentalPotential: 152, developmentPotential: 64, businessCompatibility: 84, risk: 26, demand: 87, scarcity: 58, maxLevel: 13, tags: ['transport', 'airport', 'hub'], unique: false },
  { id: 'port-facility', name: 'Port Facility', category: 'PORT', tier: 'TIER 4', location: 'Port District', purchasePrice: 2800000, baseValue: 2800000, baseIncome: 36000, appreciationRate: 0.062, maintenanceCost: 6200, taxRate: 0.024, securityRequirement: 42, prestige: 92, rentalPotential: 104, developmentPotential: 52, businessCompatibility: 88, risk: 28, demand: 82, scarcity: 44, maxLevel: 12, tags: ['port', 'shipping', 'trade'], unique: false },
  { id: 'marina', name: 'Marina', category: 'WATERFRONT', tier: 'TIER 4', location: 'Waterfront', purchasePrice: 2400000, baseValue: 2400000, baseIncome: 33000, appreciationRate: 0.065, maintenanceCost: 5800, taxRate: 0.025, securityRequirement: 46, prestige: 120, rentalPotential: 114, developmentPotential: 52, businessCompatibility: 86, risk: 24, demand: 84, scarcity: 50, maxLevel: 12, tags: ['waterfront', 'marina', 'luxury'], unique: false },
  { id: 'waterfront-development', name: 'Waterfront Development', category: 'DEVELOPMENT', tier: 'TIER 4', location: 'Waterfront', purchasePrice: 3100000, baseValue: 3100000, baseIncome: 37000, appreciationRate: 0.067, maintenanceCost: 6600, taxRate: 0.026, securityRequirement: 48, prestige: 124, rentalPotential: 118, developmentPotential: 90, businessCompatibility: 78, risk: 26, demand: 86, scarcity: 54, maxLevel: 12, tags: ['development', 'waterfront', 'site'], unique: false },
  { id: 'construction-site', name: 'Construction Site', category: 'DEVELOPMENT', tier: 'TIER 2', location: 'Industrial Zone', purchasePrice: 560000, baseValue: 560000, baseIncome: 6000, appreciationRate: 0.05, maintenanceCost: 2000, taxRate: 0.01, securityRequirement: 18, prestige: 32, rentalPotential: 26, developmentPotential: 82, businessCompatibility: 60, risk: 35, demand: 68, scarcity: 22, maxLevel: 10, tags: ['development', 'land', 'infrastructure'], unique: false },
  { id: 'development-parcel', name: 'Development Parcel', category: 'LAND', tier: 'TIER 2', location: 'Suburbs', purchasePrice: 700000, baseValue: 700000, baseIncome: 7800, appreciationRate: 0.055, maintenanceCost: 2200, taxRate: 0.012, securityRequirement: 16, prestige: 36, rentalPotential: 30, developmentPotential: 90, businessCompatibility: 62, risk: 20, demand: 74, scarcity: 28, maxLevel: 10, tags: ['land', 'development', 'future'], unique: false },
  { id: 'vacant-land', name: 'Vacant Land', category: 'LAND', tier: 'TIER 1', location: 'Suburbs', purchasePrice: 260000, baseValue: 260000, baseIncome: 2000, appreciationRate: 0.048, maintenanceCost: 800, taxRate: 0.011, securityRequirement: 12, prestige: 18, rentalPotential: 18, developmentPotential: 86, businessCompatibility: 48, risk: 18, demand: 64, scarcity: 18, maxLevel: 8, tags: ['land', 'development', 'entry'], unique: false },
  { id: 'residential-project', name: 'Residential Project', category: 'DEVELOPMENT', tier: 'TIER 3', location: 'Suburbs', purchasePrice: 1200000, baseValue: 1200000, baseIncome: 17000, appreciationRate: 0.058, maintenanceCost: 3400, taxRate: 0.019, securityRequirement: 30, prestige: 84, rentalPotential: 90, developmentPotential: 88, businessCompatibility: 68, risk: 22, demand: 80, scarcity: 40, maxLevel: 11, tags: ['development', 'residential', 'growth'], unique: false },
  { id: 'luxury-complex', name: 'Luxury Complex', category: 'DEVELOPMENT', tier: 'TIER 5', location: 'Luxury District', purchasePrice: 4200000, baseValue: 4200000, baseIncome: 46000, appreciationRate: 0.07, maintenanceCost: 8400, taxRate: 0.03, securityRequirement: 58, prestige: 205, rentalPotential: 138, developmentPotential: 92, businessCompatibility: 80, risk: 30, demand: 88, scarcity: 64, maxLevel: 13, tags: ['development', 'luxury', 'high-rise'], unique: false },
  { id: 'high-rise-development', name: 'High-Rise Development', category: 'DEVELOPMENT', tier: 'TIER 5', location: 'Downtown', purchasePrice: 6000000, baseValue: 6000000, baseIncome: 61000, appreciationRate: 0.071, maintenanceCost: 9800, taxRate: 0.031, securityRequirement: 62, prestige: 210, rentalPotential: 160, developmentPotential: 96, businessCompatibility: 84, risk: 30, demand: 90, scarcity: 70, maxLevel: 13, tags: ['development', 'high-rise', 'urban'], unique: false },
  { id: 'tower-development', name: 'Tower Development', category: 'DEVELOPMENT', tier: 'TIER 6', location: 'Downtown', purchasePrice: 9200000, baseValue: 9200000, baseIncome: 78000, appreciationRate: 0.075, maintenanceCost: 15000, taxRate: 0.033, securityRequirement: 84, prestige: 250, rentalPotential: 198, developmentPotential: 98, businessCompatibility: 88, risk: 36, demand: 92, scarcity: 82, maxLevel: 14, tags: ['development', 'tower', 'mega'], unique: true },
  { id: 'downtown-skyscraper', name: 'Downtown Skyscraper', category: 'CORPORATE', tier: 'TIER 6', location: 'Downtown', purchasePrice: 15000000, baseValue: 15000000, baseIncome: 112000, appreciationRate: 0.08, maintenanceCost: 22000, taxRate: 0.038, securityRequirement: 98, prestige: 420, rentalPotential: 240, developmentPotential: 84, businessCompatibility: 128, risk: 46, demand: 98, scarcity: 98, maxLevel: 14, tags: ['endgame', 'downtown', 'prestige'], unique: true },
  { id: 'financial-district-tower', name: 'Financial District Tower', category: 'FINANCIAL', tier: 'TIER 6', location: 'Financial District', purchasePrice: 17400000, baseValue: 17400000, baseIncome: 126000, appreciationRate: 0.082, maintenanceCost: 24000, taxRate: 0.039, securityRequirement: 100, prestige: 450, rentalPotential: 256, developmentPotential: 88, businessCompatibility: 130, risk: 48, demand: 99, scarcity: 99, maxLevel: 14, tags: ['endgame', 'financial', 'elite'], unique: true },
  { id: 'mega-shopping-complex', name: 'Mega Shopping Complex', category: 'COMMERCIAL', tier: 'TIER 6', location: 'Downtown', purchasePrice: 16200000, baseValue: 16200000, baseIncome: 118000, appreciationRate: 0.079, maintenanceCost: 23000, taxRate: 0.037, securityRequirement: 96, prestige: 410, rentalPotential: 236, developmentPotential: 86, businessCompatibility: 128, risk: 42, demand: 96, scarcity: 96, maxLevel: 14, tags: ['endgame', 'shopping', 'destination'], unique: true },
  { id: 'international-hotel', name: 'International Hotel', category: 'HOSPITALITY', tier: 'TIER 6', location: 'Downtown', purchasePrice: 16800000, baseValue: 16800000, baseIncome: 120000, appreciationRate: 0.08, maintenanceCost: 24000, taxRate: 0.038, securityRequirement: 98, prestige: 430, rentalPotential: 244, developmentPotential: 88, businessCompatibility: 126, risk: 42, demand: 97, scarcity: 96, maxLevel: 14, tags: ['endgame', 'hospitality', 'global'], unique: true },
  { id: 'luxury-marina', name: 'Luxury Marina', category: 'WATERFRONT', tier: 'TIER 6', location: 'Waterfront', purchasePrice: 14500000, baseValue: 14500000, baseIncome: 108000, appreciationRate: 0.08, maintenanceCost: 22000, taxRate: 0.037, securityRequirement: 94, prestige: 405, rentalPotential: 232, developmentPotential: 84, businessCompatibility: 116, risk: 40, demand: 96, scarcity: 96, maxLevel: 14, tags: ['endgame', 'waterfront', 'marina'], unique: true },
  { id: 'airport-complex', name: 'Airport Complex', category: 'TRANSPORT', tier: 'TIER 6', location: 'Airport District', purchasePrice: 19200000, baseValue: 19200000, baseIncome: 136000, appreciationRate: 0.081, maintenanceCost: 26000, taxRate: 0.04, securityRequirement: 100, prestige: 440, rentalPotential: 260, developmentPotential: 90, businessCompatibility: 122, risk: 44, demand: 97, scarcity: 98, maxLevel: 14, tags: ['endgame', 'transport', 'airport'], unique: true },
  { id: 'port-complex', name: 'Port Complex', category: 'PORT', tier: 'TIER 6', location: 'Port District', purchasePrice: 18500000, baseValue: 18500000, baseIncome: 132000, appreciationRate: 0.08, maintenanceCost: 25000, taxRate: 0.039, securityRequirement: 96, prestige: 420, rentalPotential: 252, developmentPotential: 89, businessCompatibility: 120, risk: 42, demand: 96, scarcity: 96, maxLevel: 14, tags: ['endgame', 'port', 'trade'], unique: true },
  { id: 'corporate-city-campus', name: 'Corporate City Campus', category: 'CORPORATE', tier: 'TIER 6', location: 'Financial District', purchasePrice: 20500000, baseValue: 20500000, baseIncome: 146000, appreciationRate: 0.083, maintenanceCost: 28000, taxRate: 0.041, securityRequirement: 104, prestige: 470, rentalPotential: 266, developmentPotential: 92, businessCompatibility: 132, risk: 48, demand: 99, scarcity: 99, maxLevel: 14, tags: ['endgame', 'corporate', 'campus'], unique: true },
  { id: 'mega-development-zone', name: 'Mega Development Zone', category: 'DEVELOPMENT', tier: 'TIER 6', location: 'Downtown', purchasePrice: 21600000, baseValue: 21600000, baseIncome: 152000, appreciationRate: 0.084, maintenanceCost: 29000, taxRate: 0.042, securityRequirement: 108, prestige: 490, rentalPotential: 274, developmentPotential: 100, businessCompatibility: 134, risk: 50, demand: 99, scarcity: 99, maxLevel: 14, tags: ['endgame', 'development', 'mega'], unique: true }
];

export function getPropertyById(propertyId: string): PropertyDefinition | undefined {
  return PROPERTY_CATALOG.find(entry => entry.id.toLowerCase() === propertyId.toLowerCase());
}

export function getPropertyByName(name: string): PropertyDefinition | undefined {
  return PROPERTY_CATALOG.find(entry => entry.name.toLowerCase() === name.toLowerCase());
}

export function getDefaultPropertyState(propertyDef: PropertyDefinition, purchasePrice = propertyDef.purchasePrice, now = Date.now()): PropertyState {
  const condition = 'GOOD';
  const currentValue = calculatePropertyValue(propertyDef, {
    propertyId: propertyDef.id,
    level: 1,
    purchasePrice,
    purchaseDate: now,
    currentValue: propertyDef.baseValue,
    totalUpgradeCost: 0,
    accumulatedIncome: 0,
    lifetimeIncome: 0,
    lifetimeExpenses: 0,
    lifetimeProfit: 0,
    maintenanceCondition: condition,
    securityLevel: 1,
    developmentLevel: 0,
    rentalLevel: 0,
    luxuryLevel: 0,
    amenitiesLevel: 0,
    occupancy: 0.75,
    lastIncomeAt: now,
    status: 'ACTIVE',
    lastMaintenanceAt: now,
    lastTaxAt: now
  });

  return {
    propertyId: propertyDef.id,
    level: 1,
    purchasePrice,
    purchaseDate: now,
    currentValue,
    totalUpgradeCost: 0,
    accumulatedIncome: 0,
    lifetimeIncome: 0,
    lifetimeExpenses: 0,
    lifetimeProfit: 0,
    maintenanceCondition: condition,
    securityLevel: 1,
    developmentLevel: 0,
    rentalLevel: 0,
    luxuryLevel: 0,
    amenitiesLevel: 0,
    occupancy: 0.75,
    lastIncomeAt: now,
    status: 'ACTIVE',
    lastMaintenanceAt: now,
    lastTaxAt: now
  };
}

export function calculatePropertyValue(property: PropertyDefinition, state: Partial<PropertyState> = {}): number {
  const location = getLocationProfile(property.location);
  const level = Math.max(1, state.level ?? 1);
  const securityLevel = Math.max(1, state.securityLevel ?? 1);
  const developmentLevel = Math.max(0, state.developmentLevel ?? 0);
  const luxuryLevel = Math.max(0, state.luxuryLevel ?? 0);
  const maintenanceFactor = getPropertyConditionMultiplier(state.maintenanceCondition ?? 'GOOD');
  const value = property.baseValue * location.appreciation * (1 + (level - 1) * 0.13) * (1 + developmentLevel * 0.09) * (1 + securityLevel * 0.04) * (1 + luxuryLevel * 0.06) * maintenanceFactor;
  return roundMoney(Math.max(property.baseValue * 0.4, value));
}

export function getPropertyExpenses(player: Player, propertyId: string): { maintenance: number; mortgage: number; taxes: number; security: number; management: number; totalExpenses: number } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { maintenance: 0, mortgage: 0, taxes: 0, security: 0, management: 0, totalExpenses: 0 };
  }
  const state = player.propertyState?.[propertyId] ?? getDefaultPropertyState(property, property.purchasePrice, Date.now());
  const currentValue = calculatePropertyValue(property, state);
  const maintenance = property.maintenanceCost * (1 + state.level * 0.09) * getPropertyConditionMultiplier(state.maintenanceCondition);
  const mortgage = state.mortgage ? state.mortgage.paymentAmount : 0;
  const taxes = currentValue * property.taxRate * 0.4;
  const security = property.securityRequirement * 35 + state.securityLevel * 80;
  const management = 200 + property.businessCompatibility * 12 + state.level * 35;
  const total = maintenance + mortgage + taxes + security + management;
  return {
    maintenance: roundMoney(maintenance),
    mortgage: roundMoney(mortgage),
    taxes: roundMoney(taxes),
    security: roundMoney(security),
    management: roundMoney(management),
    totalExpenses: roundMoney(total)
  };
}

export function calculatePropertyIncome(player: Player, propertyId: string, now = Date.now()): { propertyId: string; occupancy: number; grossIncome: number; expenses: number; netIncome: number; marketValue: number; condition: PropertyCondition } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { propertyId, occupancy: 0, grossIncome: 0, expenses: 0, netIncome: 0, marketValue: 0, condition: 'CRITICAL' };
  }
  const state = player.propertyState?.[propertyId] ?? getDefaultPropertyState(property, property.purchasePrice, now);
  const marketValue = calculatePropertyValue(property, state);
  const location = getLocationProfile(property.location);
  const timeSinceLastIncome = Math.max(0, now - (state.lastIncomeAt || now));
  const boundedWindow = Math.min(timeSinceLastIncome, 30 * 24 * 60 * 60 * 1000);
  const elapsedDays = boundedWindow / (24 * 60 * 60 * 1000);
  const occupancy = clamp(0.35 + (property.demand / 220) + (location.demand / 260) + (state.rentalLevel * 0.05) + (state.amenitiesLevel * 0.04) + (state.level * 0.015) - (property.risk / 400), 0.2, 1);
  const grossIncome = property.baseIncome * location.rentMultiplier * (0.5 + occupancy * 0.7) * (1 + state.rentalLevel * 0.12) * (1 + state.developmentLevel * 0.08) * getPropertyConditionMultiplier(state.maintenanceCondition) * (1 + (elapsedDays / 30) * 0.2);
  const expenses = getPropertyExpenses(player, propertyId).totalExpenses;
  const netIncome = Math.max(grossIncome - expenses, grossIncome * 0.18);
  return {
    propertyId,
    occupancy: Number((occupancy * 100).toFixed(1)),
    grossIncome: roundMoney(grossIncome),
    expenses: roundMoney(expenses),
    netIncome: roundMoney(netIncome),
    marketValue: roundMoney(marketValue),
    condition: getPropertyConditionFromScore((state.level * 12) + state.securityLevel * 8 + state.rentalLevel * 6 + state.developmentLevel * 5 + (state.maintenanceCondition === 'EXCELLENT' ? 20 : state.maintenanceCondition === 'GOOD' ? 12 : state.maintenanceCondition === 'WORN' ? 6 : state.maintenanceCondition === 'POOR' ? 2 : 0))
  };
}

export function collectPropertyIncome(player: Player, propertyId: string, now = Date.now()): { propertyId: string; grossIncome: number; expenses: number; netIncome: number; occupancy: number; condition: PropertyCondition; collected: boolean } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { propertyId, grossIncome: 0, expenses: 0, netIncome: 0, occupancy: 0, condition: 'CRITICAL', collected: false };
  }
  const state = player.propertyState?.[propertyId];
  if (!state || !player.properties.includes(propertyId)) {
    return { propertyId, grossIncome: 0, expenses: 0, netIncome: 0, occupancy: 0, condition: 'CRITICAL', collected: false };
  }

  const snapshot = calculatePropertyIncome(player, propertyId, now);
  if (snapshot.netIncome <= 0) {
    state.lastIncomeAt = now;
    return { ...snapshot, collected: false };
  }

  const modifier = getPropertyIncomeModifier(player);
  const payout = Number((snapshot.netIncome * (1 + modifier)).toFixed(2));
  grantMoney({
    player,
    amount: payout,
    source: 'PROPERTY_RENT',
    reason: `Property rental income: ${property.name}`,
    metadata: { propertyId, grossIncome: snapshot.grossIncome, expenses: snapshot.expenses, modifier }
  });

  grantXp(player, 25, 'PROPERTY', `property-income:${player.id}:${propertyId}:${now}`);

  state.accumulatedIncome = roundMoney(state.accumulatedIncome + snapshot.grossIncome);
  state.lifetimeIncome = roundMoney(state.lifetimeIncome + snapshot.grossIncome);
  state.lifetimeExpenses = roundMoney(state.lifetimeExpenses + snapshot.expenses);
  state.lifetimeProfit = roundMoney(state.lifetimeProfit + payout);
  state.lastIncomeAt = now;
  state.occupancy = clamp(snapshot.occupancy / 100, 0.2, 1);
  state.maintenanceCondition = snapshot.condition;
  state.currentValue = calculatePropertyValue(property, state);
  return { ...snapshot, collected: true };
}

export function createPropertyMortgage(player: Player, propertyId: string, options: { downPayment: number; principal: number; rate: number; termMonths: number }): { success: boolean; message: string; mortgage?: PropertyMortgage } {
  const property = getPropertyById(propertyId);
  if (!property || !player.properties.includes(propertyId)) {
    return { success: false, message: 'You do not own this property.' };
  }
  const state = player.propertyState?.[propertyId];
  if (!state) {
    return { success: false, message: 'Property state is missing.' };
  }
  const { downPayment, principal, rate, termMonths } = options;
  if (!Number.isFinite(downPayment) || !Number.isFinite(principal) || !Number.isFinite(rate) || !Number.isFinite(termMonths)) {
    return { success: false, message: 'Mortgage values must be valid numbers.' };
  }
  if (principal <= 0 || termMonths <= 0 || rate < 0) {
    return { success: false, message: 'Invalid mortgage terms.' };
  }
  if (state.mortgage) {
    return { success: false, message: 'This property already has an active mortgage.' };
  }

  const paymentAmount = rate === 0
    ? roundMoney(principal / termMonths)
    : roundMoney((principal * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -termMonths)));
  const mortgage: PropertyMortgage = {
    principal,
    outstandingBalance: principal,
    downPayment,
    rate,
    termMonths,
    paymentAmount,
    createdAt: Date.now(),
    nextPaymentAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    status: 'ACTIVE'
  };

  state.mortgage = mortgage;
  state.status = 'ACTIVE';
  player.debt = roundMoney((player.debt || 0) + principal);
  return { success: true, message: `Mortgage created for ${property.name}.`, mortgage };
}

export function payPropertyMortgage(player: Player, propertyId: string, amount: number): { success: boolean; message: string; remaining?: number } {
  const property = getPropertyById(propertyId);
  if (!property || !player.properties.includes(propertyId)) {
    return { success: false, message: 'You do not own this property.' };
  }
  const state = player.propertyState?.[propertyId];
  if (!state?.mortgage) {
    return { success: false, message: 'This property has no mortgage.' };
  }
  const safeAmount = Math.max(0, Number(amount) || 0);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return { success: false, message: 'Mortgage payment must be greater than zero.' };
  }
  if (player.cash < safeAmount) {
    return { success: false, message: 'Insufficient cash for the mortgage payment.' };
  }

  chargeMoney({
    player,
    amount: safeAmount,
    source: 'PROPERTY_MORTGAGE_PAYMENT',
    reason: `Mortgage payment for ${property.name}`,
    metadata: { propertyId, principal: state.mortgage.principal }
  });

  const oldOutstandingBalance = state.mortgage.outstandingBalance;
  const actualApplied = Math.min(safeAmount, oldOutstandingBalance);
  const remaining = Math.max(0, oldOutstandingBalance - actualApplied);
  state.mortgage.outstandingBalance = roundMoney(remaining);
  if (remaining <= 0) {
    state.mortgage.status = 'PAID';
    state.mortgage = undefined;
  } else {
    state.mortgage.status = 'ACTIVE';
  }

  const debtReduction = Math.min(actualApplied, player.debt || 0);
  player.debt = Math.max(0, roundMoney((player.debt || 0) - debtReduction));
  return { success: true, message: `Mortgage payment processed for ${property.name}.`, remaining: remaining <= 0 ? 0 : remaining };
}

export function buyProperty(player: Player, propertyId: string): { owned: boolean; property?: PropertyDefinition; state?: PropertyState; reason?: string } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { owned: false, reason: 'Property not found.' };
  }
  if (player.properties.includes(property.id)) {
    return { owned: false, reason: `You already own ${property.name}.` };
  }
  if (player.cash < property.purchasePrice) {
    return { owned: false, reason: `Not enough cash for ${property.name}.` };
  }

  chargeMoney({
    player,
    amount: property.purchasePrice,
    source: 'PROPERTY_PURCHASE',
    reason: `Purchased ${property.name}`,
    metadata: { propertyId: property.id, category: property.category, location: property.location }
  });

  const state = getDefaultPropertyState(property, property.purchasePrice, Date.now());
  if (!player.propertyState) player.propertyState = {};
  player.propertyState[property.id] = state;
  player.properties.push(property.id);

  grantXp(player, 150, 'PROPERTY', `property-purchase:${player.id}:${property.id}`);
  if (player.role === 'Businessman') {
    grantClassXp(player, 50, 'PROPERTY', `property-purchase-class:${player.id}:${property.id}`);
  }

  return { owned: true, property, state };
}

export function sellProperty(player: Player, propertyId: string): { success: boolean; amount: number; message: string } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { success: false, amount: 0, message: 'Property not found.' };
  }
  if (!player.properties.includes(propertyId)) {
    return { success: false, amount: 0, message: `You do not own ${property.name}.` };
  }

  const state = player.propertyState?.[propertyId] ?? getDefaultPropertyState(property, property.purchasePrice, Date.now());
  const saleValue = calculatePropertyValue(property, state);
  const finalValue = state.mortgage ? Math.max(0, saleValue - state.mortgage.outstandingBalance) : saleValue;

  grantMoney({
    player,
    amount: finalValue,
    source: 'PROPERTY_SALE',
    reason: `Sold ${property.name}`,
    metadata: { propertyId, saleValue: finalValue }
  });

  player.properties = player.properties.filter(item => item !== propertyId);
  delete player.propertyState?.[propertyId];
  if (state.mortgage) {
    state.mortgage.status = 'PAID';
  }
  return { success: true, amount: finalValue, message: `Sold ${property.name} for ${formatMoney(finalValue)}.` };
}

export function upgradeProperty(player: Player, propertyId: string, type: PropertyUpgradeType): { success: boolean; message: string; state?: PropertyState } {
  const property = getPropertyById(propertyId);
  if (!property) {
    return { success: false, message: 'Property not found.' };
  }
  const state = player.propertyState?.[propertyId];
  if (!state) {
    return { success: false, message: 'You do not own this property.' };
  }

  const cost = property.baseValue * (type === 'DEVELOPMENT' ? 0.035 : type === 'RENTAL' ? 0.025 : type === 'SECURITY' ? 0.02 : type === 'LUXURY' ? 0.03 : type === 'MAINTENANCE' ? 0.015 : 0.02);
  if (player.cash < cost) {
    // Try to cover from bank first
    const available = roundMoney((player.cash || 0) + (player.bank || 0));
    if (available < cost) {
      // try to create a loan to cover shortfall if credit score permits
      const shortfall = roundMoney(cost - available);
      try {
        createLoan(player as any, shortfall);
      } catch (err) {
        return { success: false, message: `Not enough cash to upgrade ${property.name}.` };
      }
    }

    // withdraw from bank as needed to fund the upgrade
    const neededFromBank = Math.max(0, roundMoney(cost - (player.cash || 0)));
    if (neededFromBank > 0) {
      try {
        withdrawFromBank({ player: player as any, amount: neededFromBank, reason: `Funding property upgrade: ${property.name}`, source: 'PROPERTY_UPGRADE' });
      } catch (err) {
        return { success: false, message: `Failed to fund upgrade for ${property.name}.` };
      }
    }
  }

  chargeMoney({
    player,
    amount: cost,
    source: 'PROPERTY_UPGRADE',
    reason: `Upgraded ${property.name} (${type})`,
    metadata: { propertyId, type }
  });

  state.totalUpgradeCost = roundMoney(state.totalUpgradeCost + cost);
  state.level = Math.min(property.maxLevel, state.level + 1);
  if (type === 'DEVELOPMENT') state.developmentLevel += 1;
  if (type === 'RENTAL') state.rentalLevel += 1;
  if (type === 'SECURITY') state.securityLevel += 1;
  if (type === 'LUXURY') state.luxuryLevel += 1;
  if (type === 'AMENITIES') state.amenitiesLevel += 1;
  if (type === 'MAINTENANCE') state.maintenanceCondition = 'GOOD';
  state.currentValue = calculatePropertyValue(property, state);

  const generalXp = type === 'MAINTENANCE' ? 20 : 100;
  const classXp = type === 'MAINTENANCE' ? 10 : 35;
  grantXp(player, generalXp, 'PROPERTY', `property-upgrade:${player.id}:${property.id}:${type}`);
  if (player.role === 'Businessman') {
    grantClassXp(player, classXp, 'PROPERTY', `property-upgrade-class:${player.id}:${property.id}:${type}`);
  }

  return { success: true, message: `${property.name} upgraded (${type}).`, state };
}

export function getPortfolioSummary(player: Player): { totalProperties: number; totalValue: number; totalIncome: number; totalExpenses: number; totalProfit: number; totalPrestige: number; averageCondition: string; highestValueProperty?: string; highestProfitProperty?: string; totalDebt: number; totalEquity: number } {
  const properties = player.properties || [];
  let totalValue = 0;
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalProfit = 0;
  let totalPrestige = 0;
  let highestValue = 0;
  let highestValueName: string | undefined;
  let highestProfit = 0;
  let highestProfitName: string | undefined;
  let totalDebt = 0;
  let conditions: PropertyCondition[] = [];

  for (const propertyId of properties) {
    const property = getPropertyById(propertyId);
    if (!property) continue;
    const state = player.propertyState?.[propertyId] ?? getDefaultPropertyState(property, property.purchasePrice, Date.now());
    const income = calculatePropertyIncome(player, propertyId, Date.now());
    const expenses = getPropertyExpenses(player, propertyId);
    const value = calculatePropertyValue(property, state);
    totalValue += value;
    totalIncome += income.netIncome;
    totalExpenses += expenses.totalExpenses;
    totalProfit += income.netIncome;
    totalPrestige += property.prestige + (state.luxuryLevel * 14) + (state.level * 4);
    totalDebt += state.mortgage?.outstandingBalance ?? 0;
    conditions.push(state.maintenanceCondition);
    if (value > highestValue) {
      highestValue = value;
      highestValueName = property.name;
    }
    if (income.netIncome > highestProfit) {
      highestProfit = income.netIncome;
      highestProfitName = property.name;
    }
  }

  const average = conditions.length ? conditions.reduce((acc, condition) => acc + (condition === 'EXCELLENT' ? 5 : condition === 'GOOD' ? 4 : condition === 'WORN' ? 3 : condition === 'POOR' ? 2 : 1), 0) / conditions.length : 0;
  return {
    totalProperties: properties.length,
    totalValue: roundMoney(totalValue),
    totalIncome: roundMoney(totalIncome),
    totalExpenses: roundMoney(totalExpenses),
    totalProfit: roundMoney(totalProfit),
    totalPrestige: roundMoney(totalPrestige),
    averageCondition: average >= 4.5 ? 'EXCELLENT' : average >= 3.5 ? 'GOOD' : average >= 2.5 ? 'WORN' : average >= 1.5 ? 'POOR' : 'CRITICAL',
    highestValueProperty: highestValueName,
    highestProfitProperty: highestProfitName,
    totalDebt: roundMoney(totalDebt),
    totalEquity: roundMoney(Math.max(0, totalValue - totalDebt))
  };
}

function formatMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function renderPropertyDashboard(player: Player): string {
  const summary = getPortfolioSummary(player);
  return [
    '━━━━━━━━━━━━━━━━━━━━',
    '🏙️ PROPERTY EMPIRE                         ',
    '━━━━━━━━━━━━━━━━━━━━',
    `🏠 Properties: ${String(summary.totalProperties).padEnd(20, ' ')}`,
    `💰 Portfolio Value: ${formatMoney(summary.totalValue).padEnd(16, ' ')}`,
    `📈 Rental Income: ${formatMoney(summary.totalIncome).padEnd(16, ' ')}`,
    `💸 Expenses: ${formatMoney(summary.totalExpenses).padEnd(18, ' ')}`,
    `💵 Net Profit: ${formatMoney(summary.totalProfit).padEnd(17, ' ')}`,
    `⭐ Prestige: ${String(summary.totalPrestige).padEnd(21, ' ')}`,
    '━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
}
