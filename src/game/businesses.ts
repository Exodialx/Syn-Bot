/**
 * Full business catalog — 5 tiers, upgrades, idle cap, insurance, perks.
 * UI style preserved (━━━, *bold*, ▸).
 */
import { Player, savePlayer, addXp, addClassXp } from './player.js';
import { illegalIncomeMult, addCityHeat } from './city.js';
import { getDb, saveDb } from '../db/database.js';
import { isPremium } from './shop.js';

const COLLECT_CD = 5 * 60 * 60 * 1000; // 5 hours — income accrues hourly
const IDLE_CAP = 5 * 60 * 60 * 1000; // 5h accrual cap

export type BizTier = 'legal' | 'grey' | 'criminal' | 'digital' | 'property';

export type BizDef = {
  id: string;
  name: string;
  icon: string;
  tier: BizTier;
  cost: number;
  baseIncome: number;
  heat: number;       // personal heat on collect (0 = clean)
  cityHeat: number;   // city heat contribution
  minLevel: number;
  exclusive?: 'Businessman';
  flagged?: boolean;  // police attention
  unique?: boolean;   // one per server
};

export const BUSINESS_CATALOG: BizDef[] = [
  // TIER 1 — LEGAL FRONTS
  { id: 'corner-store', name: 'Corner Store', icon: '🏪', tier: 'legal', cost: 8000, baseIncome: 400, heat: 0, cityHeat: 0, minLevel: 1 },
  { id: 'barbershop', name: 'Barbershop', icon: '💈', tier: 'legal', cost: 12000, baseIncome: 600, heat: 0, cityHeat: 0, minLevel: 1 },
  { id: 'food-truck', name: 'Food Truck', icon: '🌮', tier: 'legal', cost: 15000, baseIncome: 750, heat: 0, cityHeat: 0, minLevel: 1 },
  { id: 'laundromat', name: 'Laundromat', icon: '🧺', tier: 'legal', cost: 18000, baseIncome: 900, heat: 0, cityHeat: 0, minLevel: 1 },
  { id: 'car-wash', name: 'Car Wash', icon: '🚿', tier: 'legal', cost: 20000, baseIncome: 1000, heat: 0, cityHeat: 0, minLevel: 2 },
  { id: 'pawn-shop', name: 'Pawn Shop', icon: '💍', tier: 'legal', cost: 25000, baseIncome: 1200, heat: 0, cityHeat: 0, minLevel: 2 },
  { id: 'taxi-dispatch', name: 'Taxi Dispatch', icon: '🚕', tier: 'legal', cost: 30000, baseIncome: 1500, heat: 0, cityHeat: 0, minLevel: 3 },
  { id: 'print-shop', name: 'Print Shop', icon: '🖨️', tier: 'legal', cost: 35000, baseIncome: 1700, heat: 0, cityHeat: 0, minLevel: 3 },
  { id: 'convenience-chain', name: 'Convenience Chain', icon: '🛒', tier: 'legal', cost: 40000, baseIncome: 2000, heat: 0, cityHeat: 0, minLevel: 4 },
  { id: 'gym-fitness', name: 'Gym & Fitness', icon: '🏋️', tier: 'legal', cost: 50000, baseIncome: 2500, heat: 0, cityHeat: 0, minLevel: 4 },
  { id: 'barber-chain', name: 'Barbershop Chain', icon: '💈', tier: 'legal', cost: 60000, baseIncome: 3000, heat: 0, cityHeat: 0, minLevel: 5 },
  { id: 'used-car-lot', name: 'Used Car Lot', icon: '🚗', tier: 'legal', cost: 70000, baseIncome: 3500, heat: 0, cityHeat: 0, minLevel: 5 },
  { id: 'courier', name: 'Courier Service', icon: '📦', tier: 'legal', cost: 80000, baseIncome: 4000, heat: 0, cityHeat: 0, minLevel: 6 },
  { id: 'storage', name: 'Storage Facility', icon: '🏭', tier: 'legal', cost: 90000, baseIncome: 4500, heat: 0, cityHeat: 0, minLevel: 6 },
  { id: 'bail-bonds', name: 'Bail Bonds Office', icon: '⚖️', tier: 'legal', cost: 100000, baseIncome: 5000, heat: 0, cityHeat: 0, minLevel: 7 },

  // TIER 2 — GREY MARKET
  { id: 'nightclub', name: 'Nightclub', icon: '🎧', tier: 'grey', cost: 120000, baseIncome: 6500, heat: 2, cityHeat: 1, minLevel: 8 },
  { id: 'strip-club', name: 'Strip Club', icon: '💃', tier: 'grey', cost: 140000, baseIncome: 7500, heat: 2, cityHeat: 1, minLevel: 8 },
  { id: 'underground-casino', name: 'Underground Casino', icon: '🎰', tier: 'grey', cost: 160000, baseIncome: 8500, heat: 3, cityHeat: 2, minLevel: 9 },
  { id: 'chop-shop', name: 'Chop Shop', icon: '🔧', tier: 'grey', cost: 180000, baseIncome: 9500, heat: 3, cityHeat: 2, minLevel: 9 },
  { id: 'black-pharmacy', name: 'Black Market Pharmacy', icon: '💊', tier: 'grey', cost: 200000, baseIncome: 11000, heat: 4, cityHeat: 2, minLevel: 10 },
  { id: 'bootleg-liquor', name: 'Bootleg Liquor Distillery', icon: '🥃', tier: 'grey', cost: 220000, baseIncome: 12000, heat: 3, cityHeat: 2, minLevel: 10 },
  { id: 'fight-club', name: 'Unlicensed Fight Club', icon: '🥊', tier: 'grey', cost: 240000, baseIncome: 13000, heat: 4, cityHeat: 3, minLevel: 11 },
  { id: 'counterfeit', name: 'Counterfeit Goods Factory', icon: '👕', tier: 'grey', cost: 260000, baseIncome: 14500, heat: 4, cityHeat: 2, minLevel: 11 },
  { id: 'identity-forge', name: 'Identity Forge', icon: '🪪', tier: 'grey', cost: 280000, baseIncome: 15500, heat: 5, cityHeat: 3, minLevel: 12 },
  { id: 'smuggling-port', name: 'Smuggling Port', icon: '🚢', tier: 'grey', cost: 300000, baseIncome: 17000, heat: 5, cityHeat: 3, minLevel: 12 },
  { id: 'loan-shark-office', name: 'Loan Shark Office', icon: '💰', tier: 'grey', cost: 320000, baseIncome: 18500, heat: 4, cityHeat: 2, minLevel: 12 },
  { id: 'bookie', name: 'Bookie Operation', icon: '🎲', tier: 'grey', cost: 340000, baseIncome: 20000, heat: 3, cityHeat: 2, minLevel: 13 },
  { id: 'freight-hub', name: 'Hijacked Freight Hub', icon: '🚛', tier: 'grey', cost: 360000, baseIncome: 21500, heat: 5, cityHeat: 3, minLevel: 13 },
  { id: 'auction-house', name: 'Underground Auction House', icon: '🏛️', tier: 'grey', cost: 380000, baseIncome: 23000, heat: 4, cityHeat: 2, minLevel: 14 },
  { id: 'money-exchange', name: 'Money Exchange Front', icon: '💱', tier: 'grey', cost: 400000, baseIncome: 25000, heat: 3, cityHeat: 2, minLevel: 14 },

  // TIER 3 — CRIMINAL ENTERPRISE
  { id: 'arms-depot', name: 'Arms Depot', icon: '🔫', tier: 'criminal', cost: 500000, baseIncome: 30000, heat: 8, cityHeat: 5, minLevel: 15 },
  { id: 'drug-lab', name: 'Drug Processing Lab', icon: '🧪', tier: 'criminal', cost: 600000, baseIncome: 36000, heat: 10, cityHeat: 6, minLevel: 16 },
  { id: 'hacking-farm', name: 'Hacking Farm', icon: '💻', tier: 'criminal', cost: 700000, baseIncome: 42000, heat: 6, cityHeat: 4, minLevel: 16 },
  { id: 'trafficking', name: 'Human Trafficking Network', icon: '⚠️', tier: 'criminal', cost: 800000, baseIncome: 48000, heat: 15, cityHeat: 10, minLevel: 18, flagged: true },
  { id: 'offshore-shell', name: 'Offshore Shell Corp', icon: '🏢', tier: 'criminal', cost: 900000, baseIncome: 55000, heat: 5, cityHeat: 3, minLevel: 17 },
  { id: 'merc-barracks', name: 'Mercenary Barracks', icon: '🪖', tier: 'criminal', cost: 1000000, baseIncome: 62000, heat: 7, cityHeat: 5, minLevel: 18 },
  { id: 'biochem', name: 'Bio-Chem Lab', icon: '🧬', tier: 'criminal', cost: 1200000, baseIncome: 70000, heat: 12, cityHeat: 7, minLevel: 19 },
  { id: 'crypto-wash', name: 'Crypto Washing Desk', icon: '🪙', tier: 'criminal', cost: 1400000, baseIncome: 80000, heat: 4, cityHeat: 2, minLevel: 18 },
  { id: 'black-bank', name: 'Black Bank', icon: '🏦', tier: 'criminal', cost: 1600000, baseIncome: 90000, heat: 6, cityHeat: 4, minLevel: 20 },
  { id: 'ghost-fleet', name: 'Ghost Fleet', icon: '⚓', tier: 'criminal', cost: 1800000, baseIncome: 100000, heat: 8, cityHeat: 5, minLevel: 20 },
  { id: 'weapons-plant', name: 'Weapons Manufacturing', icon: '⚙️', tier: 'criminal', cost: 2000000, baseIncome: 115000, heat: 10, cityHeat: 6, minLevel: 21 },
  { id: 'cartel-supply', name: 'Cartel Supply Chain', icon: '🌐', tier: 'criminal', cost: 2500000, baseIncome: 135000, heat: 12, cityHeat: 8, minLevel: 22 },
  { id: 'gov-ghost', name: 'Government Contract Ghost Firm', icon: '🏛️', tier: 'criminal', cost: 3000000, baseIncome: 160000, heat: 7, cityHeat: 4, minLevel: 23 },
  { id: 'shadow-broker', name: 'Shadow Brokerage', icon: '🕴️', tier: 'criminal', cost: 4000000, baseIncome: 190000, heat: 8, cityHeat: 5, minLevel: 24 },
  { id: 'syndicate-hq', name: 'The Syndicate HQ', icon: '⚜️', tier: 'criminal', cost: 5000000, baseIncome: 250000, heat: 10, cityHeat: 6, minLevel: 25, unique: true },

  // EXPANSION — more fronts & endgame
  { id: 'bubble-tea', name: 'Bubble Tea Chain', icon: '🧋', tier: 'legal', cost: 22000, baseIncome: 1100, heat: 0, cityHeat: 0, minLevel: 2 },
  { id: 'auto-repair', name: 'Auto Repair Bay', icon: '🔧', tier: 'legal', cost: 45000, baseIncome: 2200, heat: 0, cityHeat: 0, minLevel: 4 },
  { id: 'night-pharmacy', name: '24h Pharmacy', icon: '💊', tier: 'legal', cost: 55000, baseIncome: 2700, heat: 0, cityHeat: 0, minLevel: 5 },
  { id: 'esports-cafe', name: 'Esports Cafe', icon: '🎮', tier: 'legal', cost: 70000, baseIncome: 3400, heat: 0, cityHeat: 0, minLevel: 6 },
  { id: 'luxury-car-rental', name: 'Luxury Car Rental', icon: '🏎️', tier: 'legal', cost: 120000, baseIncome: 5500, heat: 0, cityHeat: 0, minLevel: 8 },
  { id: 'private-clinic', name: 'Private Clinic', icon: '🏥', tier: 'legal', cost: 180000, baseIncome: 8000, heat: 0, cityHeat: 0, minLevel: 10 },
  { id: 'art-gallery', name: 'Art Gallery Front', icon: '🖼️', tier: 'grey', cost: 220000, baseIncome: 11000, heat: 2, cityHeat: 1, minLevel: 10 },
  { id: 'import-export', name: 'Import/Export Desk', icon: '📦', tier: 'grey', cost: 300000, baseIncome: 15000, heat: 3, cityHeat: 2, minLevel: 12 },
  { id: 'loan-shark-office', name: 'Loan Shark Office', icon: '💸', tier: 'grey', cost: 380000, baseIncome: 19000, heat: 4, cityHeat: 2, minLevel: 13 },
  { id: 'chop-shop', name: 'Chop Shop', icon: '🚙', tier: 'grey', cost: 450000, baseIncome: 23000, heat: 5, cityHeat: 3, minLevel: 14 },
  { id: 'counterfeit-press', name: 'Counterfeit Press', icon: '💵', tier: 'criminal', cost: 650000, baseIncome: 38000, heat: 9, cityHeat: 5, minLevel: 16 },
  { id: 'smuggle-railway', name: 'Smuggle Railway', icon: '🚂', tier: 'criminal', cost: 1100000, baseIncome: 68000, heat: 8, cityHeat: 5, minLevel: 18 },
  { id: 'data-brokers', name: 'Data Broker Ring', icon: '📡', tier: 'criminal', cost: 1500000, baseIncome: 88000, heat: 6, cityHeat: 3, minLevel: 19 },
  { id: 'private-military', name: 'Private Military Co.', icon: '🛡️', tier: 'criminal', cost: 2800000, baseIncome: 150000, heat: 9, cityHeat: 6, minLevel: 22 },
  { id: 'deep-web-market', name: 'Deep Web Market', icon: '🕸️', tier: 'digital', cost: 900000, baseIncome: 52000, heat: 5, cityHeat: 3, minLevel: 17 },
  { id: 'ai-scam-farm', name: 'AI Scam Farm', icon: '🤖', tier: 'digital', cost: 1300000, baseIncome: 75000, heat: 4, cityHeat: 2, minLevel: 18 },
  { id: 'satellite-tap', name: 'Satellite Tap', icon: '🛰️', tier: 'digital', cost: 2200000, baseIncome: 120000, heat: 7, cityHeat: 4, minLevel: 21 },
  { id: 'sky-penthouse', name: 'Sky Penthouse', icon: '🌃', tier: 'property', cost: 3500000, baseIncome: 170000, heat: 1, cityHeat: 0, minLevel: 22 },
  { id: 'island-estate', name: 'Island Estate', icon: '🏝️', tier: 'property', cost: 6000000, baseIncome: 260000, heat: 2, cityHeat: 1, minLevel: 24 },
  { id: 'underworld-bourse', name: 'Underworld Bourse', icon: '📈', tier: 'criminal', cost: 7500000, baseIncome: 300000, heat: 11, cityHeat: 7, minLevel: 26 },
  { id: 'crown-syndicate', name: 'Crown of the City', icon: '👑', tier: 'criminal', cost: 10000000, baseIncome: 400000, heat: 12, cityHeat: 8, minLevel: 28, unique: true },


  // TIER 4 — DIGITAL / CRYPTO (cyber heat via personal heat, no street heat flag)
  { id: 'nft-scam', name: 'NFT Scam Studio', icon: '🖼️', tier: 'digital', cost: 150000, baseIncome: 9000, heat: 2, cityHeat: 0, minLevel: 10 },
  { id: 'phishing', name: 'Phishing Operation', icon: '🎣', tier: 'digital', cost: 200000, baseIncome: 12000, heat: 3, cityHeat: 0, minLevel: 11 },
  { id: 'ransomware', name: 'Ransomware Collective', icon: '🔒', tier: 'digital', cost: 350000, baseIncome: 22000, heat: 5, cityHeat: 1, minLevel: 13 },
  { id: 'darkweb-market', name: 'Dark Web Marketplace', icon: '🌑', tier: 'digital', cost: 500000, baseIncome: 32000, heat: 4, cityHeat: 1, minLevel: 14 },
  { id: 'crypto-pump', name: 'Crypto Pump Desk', icon: '📈', tier: 'digital', cost: 750000, baseIncome: 48000, heat: 3, cityHeat: 0, minLevel: 15 },
  { id: 'deepfake', name: 'Deepfake Studio', icon: '🎭', tier: 'digital', cost: 400000, baseIncome: 26000, heat: 3, cityHeat: 0, minLevel: 13 },
  { id: 'ghost-exchange', name: 'Ghost Exchange', icon: '👻', tier: 'digital', cost: 1000000, baseIncome: 65000, heat: 4, cityHeat: 1, minLevel: 17 },
  { id: 'botnet', name: 'Botnet Farm', icon: '🤖', tier: 'digital', cost: 600000, baseIncome: 40000, heat: 5, cityHeat: 1, minLevel: 14 },
  { id: 'social-eng', name: 'Social Engineering Firm', icon: '🗣️', tier: 'digital', cost: 300000, baseIncome: 19000, heat: 2, cityHeat: 0, minLevel: 12 },
  { id: 'data-broker', name: 'Data Broker Black Market', icon: '📊', tier: 'digital', cost: 450000, baseIncome: 29000, heat: 3, cityHeat: 0, minLevel: 13 },

  // TIER 5 — PROPERTY FRONTS (Businessman exclusive, zero heat)
  { id: 'apartment-block', name: 'Apartment Block', icon: '🏢', tier: 'property', cost: 250000, baseIncome: 14000, heat: 0, cityHeat: 0, minLevel: 12, exclusive: 'Businessman' },
  { id: 'commercial-plaza', name: 'Commercial Plaza', icon: '🏬', tier: 'property', cost: 500000, baseIncome: 28000, heat: 0, cityHeat: 0, minLevel: 15, exclusive: 'Businessman' },
  { id: 'hotel-chain', name: 'Hotel Chain', icon: '🏨', tier: 'property', cost: 800000, baseIncome: 45000, heat: 0, cityHeat: 0, minLevel: 17, exclusive: 'Businessman' },
  { id: 'industrial-wh', name: 'Industrial Warehouse', icon: '🏭', tier: 'property', cost: 1000000, baseIncome: 58000, heat: 0, cityHeat: 0, minLevel: 18, exclusive: 'Businessman' },
  { id: 'island-resort', name: 'Private Island Resort', icon: '🏝️', tier: 'property', cost: 5000000, baseIncome: 280000, heat: 0, cityHeat: 0, minLevel: 25, exclusive: 'Businessman' },
  { id: 'penthouse', name: 'Penthouse Portfolio', icon: '🏙️', tier: 'property', cost: 2000000, baseIncome: 110000, heat: 0, cityHeat: 0, minLevel: 20, exclusive: 'Businessman' },
  { id: 'marina', name: 'Marina & Docks', icon: '⚓', tier: 'property', cost: 1500000, baseIncome: 85000, heat: 0, cityHeat: 0, minLevel: 19, exclusive: 'Businessman' },
  { id: 'airport-hangar', name: 'Airport Hangar', icon: '✈️', tier: 'property', cost: 2500000, baseIncome: 140000, heat: 0, cityHeat: 0, minLevel: 22, exclusive: 'Businessman' },
  { id: 'oil-platform', name: 'Offshore Oil Platform', icon: '🛢️', tier: 'property', cost: 4000000, baseIncome: 220000, heat: 0, cityHeat: 0, minLevel: 24, exclusive: 'Businessman' },
  { id: 'pmc-compound', name: 'Private Military Compound', icon: '🏰', tier: 'property', cost: 6000000, baseIncome: 320000, heat: 0, cityHeat: 0, minLevel: 26, exclusive: 'Businessman' }
];

/** Per-player business runtime: level + last earn timestamp */
type BizRuntime = Record<string, { level: number; lastEarn: number; insured: boolean }>;

function getRuntime(p: Player): BizRuntime {
  const db = getDb() as any;
  if (!db.bizRuntime) db.bizRuntime = {};
  if (!db.bizRuntime[p.id]) db.bizRuntime[p.id] = {};
  return db.bizRuntime[p.id];
}

function saveRuntime() { saveDb(); }

function slotsFor(p: Player): number {
  // No slot limits — own the whole catalog
  return BUSINESS_CATALOG.length;
}

const PAGE_SIZE = 10;

/** Short buy codes: b1, b2, … in catalog order (stable index) */
export function bizCode(index: number): string {
  return `b${index + 1}`;
}

export function bizIndexFromCode(raw: string): number | null {
  const m = String(raw || '').trim().toLowerCase().match(/^b(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n || n < 1 || n > BUSINESS_CATALOG.length) return null;
  return n - 1;
}

/** Resolve business by short code (b1), internal id, or name */
export function findBiz(raw: string): BizDef | undefined {
  if (!raw) return undefined;
  const q = raw.trim().toLowerCase();
  const idx = bizIndexFromCode(q);
  if (idx != null) return BUSINESS_CATALOG[idx];
  return BUSINESS_CATALOG.find(
    b => b.id === q || b.id.toLowerCase() === q || b.name.toLowerCase() === q
  );
}

function codeForBiz(biz: BizDef): string {
  const i = BUSINESS_CATALOG.findIndex(b => b.id === biz.id);
  return i >= 0 ? bizCode(i) : biz.id;
}

export function incomeFor(biz: BizDef, level: number, p: Player): number {
  let mult = 1;
  if (level >= 2) mult = 1.4;
  if (level >= 3) mult = 2.0;
  let income = Math.floor(biz.baseIncome * mult);
  if (p.role === 'Businessman') income = Math.floor(income * 1.25);
  income = Math.floor(income * (1 + (p.intelligence || 5) * 0.01));
  if (biz.tier === 'criminal' || biz.tier === 'grey') {
    income = Math.floor(income * illegalIncomeMult());
  }
  return income;
}

function upgradeCost(biz: BizDef, currentLevel: number): number {
  if (currentLevel === 1) return Math.floor(biz.cost * 0.5);  // L2
  if (currentLevel === 2) return Math.floor(biz.cost * 1.5);  // L3
  return 0;
}

const PERKS: Record<string, string> = {
  nightclub: 'Laundering node — cleans 20% dirty cash per collect',
  'chop-shop': 'Free vehicle repairs + stealth bonus on raids',
  'hacking-farm': 'Reveal target bank balance once per day',
  'crypto-wash': 'Immune to market crashes · +5% crypto gains',
  'loan-shark-office': 'Auto-collects debts with interest',
  'underground-casino': 'House cut from players gambling here',
  'arms-depot': 'Crew +15 ATK permanently',
  'black-bank': 'Deposits hidden from leaderboards & rob math',
  'merc-barracks': 'Hire mercenaries for one-time raid missions',
  'syndicate-hq': 'Server-wide dominance · +10% all income'
};

/**
 * Catalog UI with short codes (b1…) and pagination.
 * .biz / .biz list / .biz list 1  → page 1
 * .biz list 2                    → page 2
 * .biz legal | grey | criminal | digital | property | owned
 * Optional page after tier: .biz legal 2
 */
export function listBusinesses(p: Player, filter?: string, pageRaw?: string): string {
  const slots = slotsFor(p);
  const owned = new Set(p.businesses || []);
  const rt = getRuntime(p);

  let list = BUSINESS_CATALOG;
  let tierLabel = 'ALL';
  let page = 1;

  const f = (filter || '').toLowerCase().trim();
  const pageFromFilter = f && /^\d+$/.test(f) ? parseInt(f, 10) : 0;
  const pageFromArg = pageRaw && /^\d+$/.test(pageRaw) ? parseInt(pageRaw, 10) : 0;

  if (f === 'legal') { list = list.filter(b => b.tier === 'legal'); tierLabel = 'LEGAL'; }
  else if (f === 'grey') { list = list.filter(b => b.tier === 'grey'); tierLabel = 'GREY'; }
  else if (f === 'criminal') { list = list.filter(b => b.tier === 'criminal'); tierLabel = 'CRIMINAL'; }
  else if (f === 'digital') { list = list.filter(b => b.tier === 'digital'); tierLabel = 'DIGITAL'; }
  else if (f === 'property') { list = list.filter(b => b.tier === 'property'); tierLabel = 'PROPERTY'; }
  else if (f === 'owned' || f === 'mine') { list = list.filter(b => owned.has(b.id)); tierLabel = 'OWNED'; }
  else if (f === 'list' || f === '' || pageFromFilter > 0) {
    // full catalog; page may come from filter number or pageRaw
  } else if (f) {
    // unknown filter — treat as no filter
  }

  if (pageFromArg > 0) page = pageFromArg;
  else if (pageFromFilter > 0) page = pageFromFilter;

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);

  const slotLabel = `${owned.size} owned` + (isPremium(p) ? ' ⭐' : '');
  let out = `💼 *BUSINESS CATALOG* · ${tierLabel}
━━━━━━━━━━━━━━━━━━━━
Slots ${slotLabel}  ·  Page ${page}/${totalPages}
`;

  for (const b of slice) {
    const globalIdx = BUSINESS_CATALOG.findIndex(x => x.id === b.id);
    const code = bizCode(globalIdx);
    const lock = p.level < b.minLevel ? '🔒' : owned.has(b.id) ? '✅' : '·';
    const costK = b.cost >= 1000 ? `$${(b.cost / 1000).toFixed(0)}k` : `$${b.cost}`;
    out += `${lock} ${b.icon} *${b.name}*\n   \`${code}\`  ${costK} · $${b.baseIncome}/c · Lv${b.minLevel}+\n`;
  }

  if (!slice.length) {
    out += `   — empty —\n`;
  }

  out += `━━━━━━━━━━━━━━━━━━━━
.biz list ${page < totalPages ? page + 1 : 1}  ·  .biz list <page>
.biz legal|grey|criminal|digital|property|owned
.biz buy b1  ·  .biz upgrade b1  ·  .collect`;
  return out;
}

export function buyBusiness(p: Player, id: string): string {
  const biz = findBiz(id);
  if (!biz) return '❌ Unknown business. .biz list  ·  use codes like b1';
  if (p.level < biz.minLevel) return `◆ Need Level ${biz.minLevel}`;
  if (biz.exclusive && p.role !== biz.exclusive) return `❌ ${biz.name} is Businessman exclusive.`;
  if (!p.businesses) p.businesses = [];
  if (p.businesses.includes(biz.id)) return '❌ Already owned.';
  if (p.businesses.length >= BUSINESS_CATALOG.length) {
    return '❌ You already own every business in the catalog.';
  }
  if (biz.unique) {
    const db = getDb() as any;
    if (db.uniqueBiz?.[biz.id]) return '❌ Already claimed on this server.';
  }
  if (p.cash < biz.cost) return `❌ Need $${biz.cost.toLocaleString()}`;

  p.cash -= biz.cost;
  p.businesses.push(biz.id);
  const rt = getRuntime(p);
  rt[biz.id] = { level: 1, lastEarn: Date.now(), insured: false };
  if (biz.unique) {
    const db = getDb() as any;
    if (!db.uniqueBiz) db.uniqueBiz = {};
    db.uniqueBiz[biz.id] = p.id;
  }
  const notes = addXp(p, Math.floor(biz.cost / 250));
  if (p.role === 'Businessman') notes.push(...addClassXp(p, Math.floor(biz.cost / 2000), 'biz'));
  savePlayer(p);
  saveRuntime();
  return `▸ *PURCHASED* ${biz.icon} ${biz.name} (\`${codeForBiz(biz)}\`)
━━━━━━━━━━━━━━━━━━━━
Cost $${biz.cost.toLocaleString()}
Income ~$${biz.baseIncome}/collect
${notes.join('\n')}`.trim();
}

export function upgradeBusiness(p: Player, id: string): string {
  const biz = findBiz(id);
  if (!biz) return '❌ Unknown business. Use code e.g. b1';
  if (!p.businesses?.includes(biz.id)) return '❌ You do not own that.';
  const rt = getRuntime(p);
  const state = rt[biz.id] || { level: 1, lastEarn: Date.now(), insured: false };
  if (state.level >= 3) return '❌ Already Level 3.';
  const cost = upgradeCost(biz, state.level);
  if (p.cash < cost) return `❌ Need $${cost.toLocaleString()} for Level ${state.level + 1}`;
  p.cash -= cost;
  state.level += 1;
  rt[biz.id] = state;
  const perk = state.level === 3 && PERKS[biz.id] ? `\nPerk: ${PERKS[biz.id]}` : '';
  savePlayer(p);
  saveRuntime();
  return `▸ *UPGRADED* ${biz.icon} ${biz.name} → L${state.level}
━━━━━━━━━━━━━━━━━━━━
−$${cost.toLocaleString()}
Income now ~$${incomeFor(biz, state.level, p).toLocaleString()}/collect${perk}`;
}

export function insureBusiness(p: Player, id: string): string {
  if (p.role !== 'Businessman') return '❌ Insurance is Businessman exclusive.';
  const biz = findBiz(id);
  if (!biz || !p.businesses?.includes(biz.id)) return '❌ Own that business first.';
  const rt = getRuntime(p);
  const state = rt[biz.id] || { level: 1, lastEarn: Date.now(), insured: false };
  if (state.insured) return '✅ Already insured.';
  const cost = Math.floor(biz.cost * 0.15);
  if (p.cash < cost) return `❌ Insurance costs $${cost.toLocaleString()}`;
  p.cash -= cost;
  state.insured = true;
  rt[biz.id] = state;
  savePlayer(p);
  saveRuntime();
  return `🛡️ *INSURED* ${biz.name}
Survives one raid without loss.
−$${cost.toLocaleString()}`;
}

export function collectBusinesses(p: Player): string {
  if (!p.businesses?.length) return '❌ No businesses. .biz list → .biz buy b1';
  const last = (p as any).lastCollect || 0;
  const now = Date.now();
  if (now - last < COLLECT_CD) {
    const leftH = ((COLLECT_CD - (now - last)) / 3_600_000).toFixed(1);
    return `⏳ Collect cooldown — ${leftH}h left (5h cycle, hourly income)`;
  }
  (p as any).lastCollect = now;

  const rt = getRuntime(p);
  let total = 0;
  let heat = 0;
  let cityH = 0;
  const lines: string[] = [];
  let hqBonus = false;

  // Hours since last collect (min 1 if never, max 24)
  const hoursRaw = last > 0 ? (now - last) / 3_600_000 : 5;
  const hours = Math.max(1, Math.min(5, hoursRaw));
  const raidUntil = (p as any).raidDebuffUntil || 0;
  const raidMult = raidUntil > now ? 0.55 : 1; // raided → 45% income cut until next collect window

  for (const id of p.businesses) {
    const biz = BUSINESS_CATALOG.find(b => b.id === id);
    if (!biz) continue;
    const state = rt[id] || { level: 1, lastEarn: now, insured: false };
    // baseIncome is treated as per-hour; collect pays hours accrued
    let income = Math.floor(incomeFor(biz, state.level, p) * hours * raidMult);
    if (id === 'syndicate-hq' && state.level >= 3) hqBonus = true;
    total += income;
    heat += biz.heat * (state.level >= 2 ? 1 : 1) + (state.level >= 3 ? 2 : 0);
    cityH += biz.cityHeat;
    state.lastEarn = now;
    rt[id] = state;
    lines.push(`${biz.icon} +$${income.toLocaleString()} L${state.level} (${hours.toFixed(1)}h)`);
  }

  if (hqBonus) total = Math.floor(total * 1.1);
  if (raidMult < 1) {
    lines.unshift('⚠️ Raid damage — income cut 45% this cycle');
    (p as any).raidDebuffUntil = 0; // cleared after collect
  }
  p.cash += total;
  // legal fronts slowly reduce heat
  const legalCount = p.businesses.filter(id => BUSINESS_CATALOG.find(b => b.id === id)?.tier === 'legal').length;
  if (legalCount > 0) p.heat = Math.max(0, p.heat - Math.min(5, legalCount));
  p.heat = Math.min(100, p.heat + heat);
  if (cityH > 0) addCityHeat(cityH * 0.3, 'Illegal businesses collected');
  const notes = addXp(p, Math.floor(total / 120));
  if (p.role === 'Businessman') notes.push(...addClassXp(p, Math.floor(total / 180), 'biz'));
  savePlayer(p);
  saveRuntime();

  return `💵 *COLLECTION REPORT*
━━━━━━━━━━━━━━━━━━━━
${lines.slice(0, 14).join('\n')}
${lines.length > 14 ? `… +${lines.length - 14} more\n` : ''}━━━━━━━━━━━━━━━━━━━━
TOTAL $${total.toLocaleString()}
${heat ? `🔥 Heat +${heat}\n` : ''}💰 Cash $${p.cash.toLocaleString()}
${notes.join('\n')}`.trim();
}

/** Raid steals a chunk of hourly income and tags target for next collect cut */
export function raidBusinessIncome(attacker: Player, target: Player): number {
  if (!target.businesses?.length) return 0;
  const rt = getRuntime(target);
  let stolen = 0;
  for (const id of target.businesses) {
    const biz = BUSINESS_CATALOG.find(b => b.id === id);
    if (!biz) continue;
    const state = rt[id] || { level: 1, lastEarn: 0, insured: false };
    if (state.insured) {
      state.insured = false;
      rt[id] = state;
      continue;
    }
    // steal ~4h of income from each biz
    stolen += Math.floor(incomeFor(biz, state.level, target) * 4 * 0.35);
  }
  (target as any).raidDebuffUntil = Date.now() + 24 * 60 * 60 * 1000;
  (target as any).lastRaidedBy = attacker.id;
  (target as any).lastRaidedAt = Date.now();
  saveRuntime();
  return stolen;
}


/** Full 5h collect-cycle income estimate for a player */
export function estimateBizCycleIncome(p: Player): number {
  if (!p.businesses?.length) return 0;
  const rt = getRuntime(p);
  let total = 0;
  for (const id of p.businesses) {
    const biz = BUSINESS_CATALOG.find(b => b.id === id);
    if (!biz) continue;
    const state = rt[id] || { level: 1, lastEarn: 0, insured: false };
    total += incomeFor(biz, state.level, p) * 5;
  }
  return Math.floor(total);
}

export function getBizById(id: string): BizDef | undefined {
  return BUSINESS_CATALOG.find(b => b.id === id);
}
