/**
 * Shop + inventory — weapons (Mafia/Hitman), armor, tools, premium
 */
import { Player, savePlayer } from './player.js';
import { getCityHeat } from './city.js';
import { getDb, saveDb } from '../db/database.js';

export type ItemDef = {
  id: string;
  name: string;
  icon: string;
  slot: 'weapon' | 'armor' | 'tool' | 'premium';
  cost: number;
  /** combat / utility bonuses */
  atk?: number;
  def?: number;
  stealth?: number;
  crime?: number;
  roles?: Array<'Mafia' | 'Hitman' | 'Businessman'>; // empty = all
  desc: string;
};

export const SHOP: ItemDef[] = [
  // Weapons — Mafia / Hitman
  { id: 'knife', name: 'Switchblade', icon: '🔪', slot: 'weapon', cost: 8000, atk: 4, roles: ['Mafia', 'Hitman'], desc: '+4 ATK on rob/hit' },
  { id: 'pistol', name: 'Street Pistol', icon: '🔫', slot: 'weapon', cost: 25000, atk: 9, roles: ['Mafia', 'Hitman'], desc: '+9 ATK' },
  { id: 'smg', name: 'SMG', icon: '💥', slot: 'weapon', cost: 60000, atk: 14, roles: ['Mafia', 'Hitman'], desc: '+14 ATK' },
  { id: 'rifle', name: 'Assault Rifle', icon: '🔫', slot: 'weapon', cost: 120000, atk: 20, roles: ['Mafia', 'Hitman'], desc: '+20 ATK' },
  { id: 'sniper', name: 'Sniper Kit', icon: '🎯', slot: 'weapon', cost: 200000, atk: 26, stealth: 5, roles: ['Hitman'], desc: 'Hitman only +26 ATK' },
  { id: 'bat', name: 'Crowbar', icon: '🦇', slot: 'weapon', cost: 5000, atk: 3, roles: ['Mafia', 'Hitman'], desc: 'Cheap muscle' },
  { id: 'taser', name: 'Taser', icon: '⚡', slot: 'weapon', cost: 15000, atk: 6, roles: ['Mafia', 'Hitman'], desc: '+6 ATK' },
  { id: 'shotgun', name: 'Shotgun', icon: '💥', slot: 'weapon', cost: 90000, atk: 17, roles: ['Mafia'], desc: 'Mafia close range' },
  { id: 'machete', name: 'Machete', icon: '🗡️', slot: 'weapon', cost: 18000, atk: 8, roles: ['Mafia', 'Hitman'], desc: 'Brutal close range' },
  { id: 'uzi', name: 'Uzi', icon: '🔫', slot: 'weapon', cost: 75000, atk: 16, roles: ['Mafia', 'Hitman'], desc: 'Spray and pray' },
  { id: 'ak', name: 'AK-Pattern', icon: '🔫', slot: 'weapon', cost: 150000, atk: 22, roles: ['Mafia', 'Hitman'], desc: 'Street classic' },
  { id: 'desert-eagle', name: 'Desert Eagle', icon: '🔫', slot: 'weapon', cost: 110000, atk: 19, roles: ['Mafia', 'Hitman'], desc: 'Heavy pistol' },
  { id: 'crossbow', name: 'Silent Crossbow', icon: '🏹', slot: 'weapon', cost: 95000, atk: 15, stealth: 8, roles: ['Hitman'], desc: 'Quiet lethal' },
  { id: 'katana', name: 'Katana', icon: '⚔️', slot: 'weapon', cost: 130000, atk: 21, roles: ['Mafia', 'Hitman'], desc: 'Precision cuts' },
  { id: 'grenade', name: 'Flashbang', icon: '💣', slot: 'weapon', cost: 40000, atk: 10, crime: 5, roles: ['Mafia', 'Hitman'], desc: 'Disorient + pressure' },
  { id: 'vest-heavy', name: 'Heavy Plate', icon: '🛡️', slot: 'armor', cost: 140000, def: 18, desc: 'Serious protection' },
  { id: 'helmet', name: 'Tactical Helmet', icon: '⛑️', slot: 'armor', cost: 55000, def: 9, desc: 'Head protection' },

  // Armor — all roles
  { id: 'vest', name: 'Kevlar Vest', icon: '🦺', slot: 'armor', cost: 20000, def: 8, desc: '+8 DEF when robbed' },
  { id: 'helmet', name: 'Tactical Helmet', icon: '⛑️', slot: 'armor', cost: 35000, def: 12, desc: '+12 DEF' },
  { id: 'plate', name: 'Plate Carrier', icon: '🛡️', slot: 'armor', cost: 80000, def: 18, desc: '+18 DEF' },
  { id: 'suit', name: 'Armored Suit', icon: '🕴️', slot: 'armor', cost: 150000, def: 24, desc: '+24 DEF' },
  { id: 'cloak', name: 'Shadow Cloak', icon: '🌑', slot: 'armor', cost: 100000, def: 10, stealth: 8, desc: '+DEF +stealth' },

  // Tools
  { id: 'lockpick', name: 'Lockpick Set', icon: '🔓', slot: 'tool', cost: 12000, crime: 6, stealth: 3, desc: '+crime success' },
  { id: 'scanner', name: 'Police Scanner', icon: '📻', slot: 'tool', cost: 28000, crime: 8, desc: 'Better crime odds' },
  { id: 'drone', name: 'Scout Drone', icon: '🛸', slot: 'tool', cost: 55000, crime: 12, stealth: 4, desc: 'Casing tool' },
  { id: 'laptop', name: 'Hacking Laptop', icon: '💻', slot: 'tool', cost: 70000, crime: 14, roles: ['Businessman', 'Hitman'], desc: 'Digital edge' },
  { id: 'safe-tool', name: 'Safe Cracker', icon: '🧰', slot: 'tool', cost: 45000, crime: 10, desc: 'Vault jobs' },

  // Premium / flex
  { id: 'gold-chain', name: 'Gold Chain', icon: '📿', slot: 'premium', cost: 50000, desc: 'Flex only' },
  { id: 'watch', name: 'Luxury Watch', icon: '⌚', slot: 'premium', cost: 75000, desc: 'Status' },
  { id: 'cigar', name: 'Cuban Cigar Box', icon: '🚬', slot: 'premium', cost: 15000, desc: 'Boss vibes' },
  { id: 'briefcase', name: 'Black Briefcase', icon: '💼', slot: 'premium', cost: 40000, def: 3, roles: ['Businessman'], desc: 'Biz defense flavor' },
  { id: 'black-card', name: 'Black Card', icon: '💳', slot: 'premium', cost: 250000, desc: 'Whale flex' },
  { id: 'ring', name: 'Signet Ring', icon: '💍', slot: 'premium', cost: 90000, desc: 'Family seal' },
  { id: 'medkit', name: 'Street Medkit', icon: '🩹', slot: 'premium', cost: 18000, def: 4, desc: 'Small DEF' },
  { id: 'mask', name: 'Heist Mask', icon: '🎭', slot: 'premium', cost: 22000, stealth: 5, desc: '+stealth' },
  { id: 'phone', name: 'Burner Phone', icon: '📱', slot: 'premium', cost: 10000, crime: 3, desc: 'Comms' },
  { id: 'gps', name: 'GPS Spoofer', icon: '📍', slot: 'premium', cost: 32000, stealth: 4, crime: 4, desc: 'Ghost route' },
  { id: 'bodycam', name: 'Bodycam Scrambler', icon: '📹', slot: 'premium', cost: 48000, stealth: 6, desc: 'Anti-evidence' },
  { id: 'contract', name: 'Blank Contract', icon: '📜', slot: 'premium', cost: 60000, roles: ['Businessman'], desc: 'Hire leverage' },
  { id: 'namecard', name: 'Name Change Card', icon: '🪪', slot: 'premium', cost: 75000, desc: 'Allows one extra username change' },
  { id: 'premium', name: 'Premium Membership', icon: '⭐', slot: 'premium', cost: 2000000, desc: 'Immune to .rob & .brob · unlimited business slots (own all biz)' }
];


/** Track purchases for demand curve */
function recordSale(itemId: string) {
  const db = getDb() as any;
  if (!db.shopSales) db.shopSales = {};
  if (!db.shopSales[itemId]) db.shopSales[itemId] = { count: 0, last: 0 };
  db.shopSales[itemId].count += 1;
  db.shopSales[itemId].last = Date.now();
  // decay old global pressure occasionally
  if (!db.shopTick) db.shopTick = Date.now();
  if (Date.now() - db.shopTick > 30 * 60_000) {
    for (const k of Object.keys(db.shopSales)) {
      db.shopSales[k].count = Math.max(0, Math.floor(db.shopSales[k].count * 0.85));
    }
    db.shopTick = Date.now();
  }
  saveDb();
}

function demandMult(itemId: string): number {
  const db = getDb() as any;
  const sales = db.shopSales?.[itemId]?.count || 0;
  // each sale nudges +1.5%, soft cap +35%
  return 1 + Math.min(0.35, sales * 0.015);
}

function heatMult(slot: string): number {
  const heat = getCityHeat(); // 0–100 typical
  const h = Math.max(0, Math.min(100, heat)) / 100;
  // high heat: weapons & armor spike (crackdown + demand), tools rise less, premium soft
  if (slot === 'weapon') return 1 + h * 0.45;
  if (slot === 'armor') return 1 + h * 0.35;
  if (slot === 'tool') return 1 + h * 0.20;
  return 1 + h * 0.10; // premium
}

function timeWave(itemId: string): number {
  // slow sine based on hour + item hash — ±6%
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) hash = (hash + itemId.charCodeAt(i) * (i + 1)) % 360;
  const phase = ((hour * 15) + hash) * (Math.PI / 180);
  return 1 + Math.sin(phase) * 0.06;
}

function roleDiscount(p: Player | null | undefined, item: ItemDef): number {
  if (!p) return 1;
  // Businessman: 5% off premium & tools; Mafia: 3% off weapons; Hitman: 3% off stealth tools
  if (p.role === 'Businessman' && (item.slot === 'premium' || item.slot === 'tool')) return 0.95;
  if (p.role === 'Mafia' && item.slot === 'weapon') return 0.97;
  if (p.role === 'Hitman' && (item.stealth || 0) > 0) return 0.97;
  return 1;
}

export type PriceQuote = {
  base: number;
  price: number;
  mult: number;
  tag: string; // hot | deal | fair
};

/** Live street price for an item */
export function getDynamicPrice(item: ItemDef, p?: Player | null): PriceQuote {
  const d = demandMult(item.id);
  const h = heatMult(item.slot);
  const w = timeWave(item.id);
  const r = roleDiscount(p, item);
  // personal heat marks you as hot → fences charge more
  let personal = 1;
  if (p) {
    const ph = Math.max(0, Math.min(100, p.heat || 0));
    if (ph >= 80) personal = 1.22;
    else if (ph >= 60) personal = 1.12;
    else if (ph >= 40) personal = 1.05;
  }
  let mult = d * h * w * r * personal;
  // hard clamp 0.70x – 1.90x of base
  mult = Math.max(0.70, Math.min(1.90, mult));
  const price = Math.max(1, Math.floor(item.cost * mult));
  const vs = price / item.cost;
  let tag = 'fair';
  if (vs >= 1.15) tag = 'hot';
  else if (vs <= 0.90) tag = 'deal';
  return { base: item.cost, price, mult, tag };
}

/** Short shop codes s1… in catalog order */
export function shopCode(index: number): string {
  return `s${index + 1}`;
}

export function findShopItem(raw: string): ItemDef | undefined {
  if (!raw) return undefined;
  const q = raw.trim().toLowerCase();
  const m = q.match(/^s(\d+)$/);
  if (m) {
    const i = parseInt(m[1], 10) - 1;
    if (i >= 0 && i < SHOP.length) return SHOP[i];
  }
  return getItem(q);
}

function formatPriceTag(q: PriceQuote): string {
  const price = q.price >= 1000
    ? `$${(q.price / 1000).toFixed(q.price % 1000 === 0 ? 0 : 1)}k`
    : `$${q.price}`;
  if (q.tag === 'hot') return `${price} 🔥`;
  if (q.tag === 'deal') return `${price} 💚`;
  return price;
}

export function getItem(id: string): ItemDef | undefined {
  return SHOP.find(i => i.id === id || i.name.toLowerCase() === id.toLowerCase());
}

export function ensureInv(p: Player) {
  if (!(p as any).inventory) (p as any).inventory = [] as string[];
  if (!(p as any).equipped) (p as any).equipped = { weapon: null, armor: null, tool: null };
  if (!(p as any).bodyguards) (p as any).bodyguards = [] as string[];
  return p as Player & {
    inventory: string[];
    equipped: { weapon: string | null; armor: string | null; tool: string | null };
    bodyguards: string[];
  };
}

export function formatShop(filter?: string, p?: Player): string {
  const f = (filter || '').toLowerCase();
  let list = SHOP;
  let title = 'ALL GEAR';
  if (f === 'weapon' || f === 'weapons') {
    list = SHOP.filter(i => i.slot === 'weapon');
    title = 'WEAPONS';
  } else if (f === 'armor') {
    list = SHOP.filter(i => i.slot === 'armor');
    title = 'ARMOR';
  } else if (f === 'tool' || f === 'tools') {
    list = SHOP.filter(i => i.slot === 'tool');
    title = 'TOOLS';
  } else if (f === 'premium' || f === 'vip') {
    list = SHOP.filter(i => i.slot === 'premium');
    title = 'PREMIUM';
  }

  const codeOf = (item: ItemDef) => {
    const idx = SHOP.findIndex(x => x.id === item.id);
    return idx >= 0 ? shopCode(idx) : item.id;
  };

  // grouped view when showing all
  if (!f) {
    const sections: { key: string; label: string; icon: string }[] = [
      { key: 'weapon', label: 'WEAPONS', icon: '🔫' },
      { key: 'armor', label: 'ARMOR', icon: '🛡️' },
      { key: 'tool', label: 'TOOLS', icon: '🔧' },
      { key: 'premium', label: 'PREMIUM', icon: '✨' }
    ];
    let out = `🛒 *BLACK MARKET*
━━━━━━━━━━━━━━━━━━━━
`;
    if (p && p.heat >= 40) out += `⚠️ Your heat is marking prices up\n`;
    for (const s of sections) {
      const items = SHOP.filter(i => i.slot === s.key);
      out += `\n${s.icon} *${s.label}*\n`;
      for (const i of items) {
        const role = i.roles ? ` · ${i.roles.join('/')}` : '';
        const q = getDynamicPrice(i, p);
        out += `▸ ${i.icon} *${i.name}*\n`;
        out += `   \`${codeOf(i)}\`  ${formatPriceTag(q)}${role}\n`;
      }
    }
    out += `━━━━━━━━━━━━━━━━━━━━
.shop weapon / armor / tool / premium
.buy s1  ·  .inv  ·  .equip <id>
⚠️ Weapons: Mafia & Hitman only
🔥 hot  ·  💚 deal  ·  heat & demand prices`;
    return out;
  }

  // filtered category view
  let out = `🛒 *STORE · ${title}*
━━━━━━━━━━━━━━━━━━━━
`;
  if (p && p.heat >= 40) out += `⚠️ Your heat is marking prices up\n`;
  for (const i of list) {
    const role = i.roles ? ` · ${i.roles.join('/')}` : '';
    const q = getDynamicPrice(i, p);
    out += `▸ ${i.icon} *${i.name}*\n`;
    out += `   \`${codeOf(i)}\`  ${formatPriceTag(q)}${role}\n`;
    out += `   ${i.desc}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.buy s1  ·  .inv  ·  .equip <id>
.shop  — full catalog
🔥 hot  ·  💚 deal  ·  live street prices`;
  return out;
}

export function buyItem(p: Player, id: string): string {
  const item = findShopItem(id);
  if (!item) return '❌ Unknown item. .shop  ·  use codes like s1';
  if (item.roles && p.role !== 'Unassigned' && !item.roles.includes(p.role as any)) {
    return `❌ ${item.name} is for: ${item.roles.join(', ')}`;
  }
  const inv = ensureInv(p);
  // consumables (namecard) can be stacked; gear is unique
  const consumable = item.id === 'namecard';
  if (!consumable && inv.inventory.includes(item.id)) return '❌ Already owned';
  const q = getDynamicPrice(item, p);
  if (p.cash < q.price) {
    return `❌ Need $${q.price.toLocaleString()} (street price)\nBase was $${item.cost.toLocaleString()}`;
  }
  p.cash -= q.price;
  inv.inventory.push(item.id);
  recordSale(item.id);
  savePlayer(p);
  const code = shopCode(SHOP.findIndex(x => x.id === item.id));
  const tip = consumable ? 'Use .set name <new> to consume it.' : `.equip ${item.id}`;
  const vs = q.tag === 'hot' ? '🔥 above base' : q.tag === 'deal' ? '💚 below base' : 'fair market';
  return `▸ Bought ${item.icon} ${item.name} (\`${code}\`)
💸 -$${q.price.toLocaleString()} (${vs})
💰 Cash $${p.cash.toLocaleString()}
${tip}`;
}

export function formatInv(p: Player): string {
  const inv = ensureInv(p);
  const owned = inv.inventory.map(id => {
    const it = getItem(id);
    if (!it) return { id, icon: '·', name: id, slot: 'premium' as const, eq: false };
    const eq =
      inv.equipped.weapon === id ||
      inv.equipped.armor === id ||
      inv.equipped.tool === id;
    return { id: it.id, icon: it.icon, name: it.name, slot: it.slot, eq };
  });

  const bySlot = (slot: string) => owned.filter(o => o.slot === slot);
  const render = (items: typeof owned) => {
    if (!items.length) return '   — empty —\n';
    return items.map(o => `${o.eq ? '【E】' : '▸ '} ${o.icon} *${o.name}*\n   \`${o.id}\`\n`).join('');
  };

  const w = getItem(inv.equipped.weapon || '');
  const a = getItem(inv.equipped.armor || '');
  const tl = getItem(inv.equipped.tool || '');

  return `🗂️ *INVENTORY*
━━━━━━━━━━━━━━━━━━━━
*EQUIPPED*
🔫 Weapon  ${w ? `${w.icon} ${w.name}` : '—'}
🦺 Armor   ${a ? `${a.icon} ${a.name}` : '—'}
🔧 Tool    ${tl ? `${tl.icon} ${tl.name}` : '—'}

*WEAPONS*
${render(bySlot('weapon'))}*ARMOR*
${render(bySlot('armor'))}*TOOLS*
${render(bySlot('tool'))}*PREMIUM*
${render(bySlot('premium'))}━━━━━━━━━━━━━━━━━━━━
.equip <id>   ·   .unequip weapon|armor|tool
.shop  ·  .buy <id>`;
}

export function equipItem(p: Player, id: string): string {
  const inv = ensureInv(p);
  const item = getItem(id);
  if (!item) return '❌ Unknown item';
  if (!inv.inventory.includes(item.id)) return '❌ You do not own that';
  if (item.slot === 'weapon') {
    if (p.role !== 'Mafia' && p.role !== 'Hitman') {
      return '❌ Only Mafia / Hitman can equip weapons.\nBusinessmen hire bodyguards instead.';
    }
    inv.equipped.weapon = item.id;
  } else if (item.slot === 'armor') {
    inv.equipped.armor = item.id;
  } else if (item.slot === 'tool') {
    inv.equipped.tool = item.id;
  } else {
    return '❌ Premium items are not equip slots (flex only)';
  }
  savePlayer(p);
  return `▸ Equipped ${item.icon} ${item.name}`;
}

export function unequip(p: Player, slot: string): string {
  const inv = ensureInv(p);
  const s = slot.toLowerCase() as 'weapon' | 'armor' | 'tool';
  if (!['weapon', 'armor', 'tool'].includes(s)) return '❌ weapon | armor | tool';
  inv.equipped[s] = null;
  savePlayer(p);
  return `▸ Unequipped ${s}`;
}

/** Aggregate combat bonuses from gear */
export function gearBonuses(p: Player): { atk: number; def: number; stealth: number; crime: number } {
  const inv = ensureInv(p);
  let atk = 0, def = 0, stealth = 0, crime = 0;
  for (const slot of ['weapon', 'armor', 'tool'] as const) {
    const id = inv.equipped[slot];
    if (!id) continue;
    const it = getItem(id);
    if (!it) continue;
    atk += it.atk || 0;
    def += it.def || 0;
    stealth += it.stealth || 0;
    crime += it.crime || 0;
  }
  return { atk, def, stealth, crime };
}


export function hasItem(p: Player, id: string): boolean {
  const inv = ensureInv(p);
  return inv.inventory.includes(id);
}

/** Premium Membership — rob immunity + unlimited biz slots */
export function isPremium(p: Player): boolean {
  return hasItem(p, 'premium');
}

export function consumeItem(p: Player, id: string): boolean {
  const inv = ensureInv(p);
  const i = inv.inventory.indexOf(id);
  if (i < 0) return false;
  inv.inventory.splice(i, 1);
  // also clear from equipped if present
  if (inv.equipped.weapon === id) inv.equipped.weapon = null;
  if (inv.equipped.armor === id) inv.equipped.armor = null;
  if (inv.equipped.tool === id) inv.equipped.tool = null;
  savePlayer(p);
  return true;
} 
