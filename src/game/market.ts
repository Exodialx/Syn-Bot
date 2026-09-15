export type MarketItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  supply: number;
  demand: number;
  volatility: number;
};

export const MARKET_CATALOG: MarketItem[] = [
  { id: 'steel', name: 'Steel', category: 'Materials', price: 220, supply: 200, demand: 160, volatility: 0.12 },
  { id: 'lumber', name: 'Lumber', category: 'Materials', price: 180, supply: 250, demand: 170, volatility: 0.15 },
  { id: 'grain', name: 'Grain', category: 'Agriculture', price: 140, supply: 300, demand: 220, volatility: 0.11 },
  { id: 'tech-chip', name: 'Tech Chip', category: 'Technology', price: 680, supply: 150, demand: 200, volatility: 0.22 },
  { id: 'luxury-watch', name: 'Luxury Watch', category: 'Luxury Goods', price: 950, supply: 80, demand: 120, volatility: 0.18 },
  { id: 'energy-core', name: 'Energy Core', category: 'Energy', price: 1400, supply: 90, demand: 160, volatility: 0.24 },
  { id: 'vehicle-part', name: 'Vehicle Part', category: 'Vehicles', price: 420, supply: 200, demand: 175, volatility: 0.14 },
  { id: 'property-bond', name: 'Property Bond', category: 'Properties', price: 2100, supply: 120, demand: 140, volatility: 0.19 }
];

export function getMarketByName(name: string): MarketItem | undefined {
  return MARKET_CATALOG.find(item => item.name.toLowerCase() === name.toLowerCase());
}

export function calculateMarketPrice(item: MarketItem, eventModifier = 1): number {
  const price = item.price * (1 + ((item.demand - item.supply) / Math.max(100, item.supply)) + ((item.volatility * eventModifier) / 10));
  return Math.max(1, Math.round(price));
}
