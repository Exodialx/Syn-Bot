export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type Item = {
  id: string;
  name: string;
  kind: 'resource' | 'material' | 'equipment' | 'consumable' | 'collectible';
  rarity: Rarity;
  value: number;
  qty: number;
};

export const ITEM_CATALOG: Item[] = [
  { id: 'metal-scrap', name: 'Metal Scrap', kind: 'resource', rarity: 'Common', value: 120, qty: 1 },
  { id: 'electronics', name: 'Electronics', kind: 'material', rarity: 'Uncommon', value: 280, qty: 1 },
  { id: 'security-badge', name: 'Security Badge', kind: 'equipment', rarity: 'Rare', value: 1200, qty: 1 },
  { id: 'medkit', name: 'Medkit', kind: 'consumable', rarity: 'Uncommon', value: 460, qty: 1 },
  { id: 'gold-nugget', name: 'Gold Nugget', kind: 'collectible', rarity: 'Rare', value: 3400, qty: 1 },
  { id: 'custom-gun', name: 'Custom Gun', kind: 'equipment', rarity: 'Epic', value: 15000, qty: 1 },
  { id: 'ancient-code', name: 'Ancient Code', kind: 'collectible', rarity: 'Legendary', value: 52000, qty: 1 },
  { id: 'mythic-key', name: 'Mythic Key', kind: 'collectible', rarity: 'Mythic', value: 150000, qty: 1 }
];

export function getItemByName(name: string): Item | undefined {
  return ITEM_CATALOG.find(item => item.name.toLowerCase() === name.toLowerCase());
}
