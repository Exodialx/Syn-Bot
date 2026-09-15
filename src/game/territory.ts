export type Territory = {
  id: string;
  name: string;
  bonus: string;
  incomeBoost: number;
  defenseBonus: number;
  control: number;
};

export const TERRITORIES: Territory[] = [
  { id: 'downtown', name: 'Downtown', bonus: 'business traffic', incomeBoost: 1.12, defenseBonus: 1.02, control: 0 },
  { id: 'industrial-district', name: 'Industrial District', bonus: 'production boost', incomeBoost: 1.17, defenseBonus: 1.05, control: 0 },
  { id: 'harbor', name: 'Harbor', bonus: 'logistics and trade', incomeBoost: 1.2, defenseBonus: 1.08, control: 0 },
  { id: 'airport', name: 'Airport District', bonus: 'travel and smuggling routes', incomeBoost: 1.18, defenseBonus: 1.06, control: 0 },
  { id: 'market-district', name: 'Market District', bonus: 'retail and market gains', incomeBoost: 1.22, defenseBonus: 1.03, control: 0 },
  { id: 'luxury-district', name: 'Luxury District', bonus: 'premium reputation', incomeBoost: 1.28, defenseBonus: 1.04, control: 0 },
  { id: 'financial-district', name: 'Financial District', bonus: 'finance leverage', incomeBoost: 1.3, defenseBonus: 1.07, control: 0 },
  { id: 'midtown', name: 'Midtown', bonus: 'general prosperity', incomeBoost: 1.15, defenseBonus: 1.04, control: 0 },
  { id: 'night-district', name: 'Night District', bonus: 'casino and nightlife economy', incomeBoost: 1.25, defenseBonus: 1.09, control: 0 },
  { id: 'transport-hub', name: 'Transport Hub', bonus: 'mobility and logistics', incomeBoost: 1.24, defenseBonus: 1.06, control: 0 }
];

export function getTerritoryByName(name: string): Territory | undefined {
  return TERRITORIES.find(territory => territory.name.toLowerCase() === name.toLowerCase());
}
