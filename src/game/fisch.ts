import { getDb, saveDb } from '../db/database.js';

export type FischRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Ancient';

export type FischFish = {
  id: string;
  name: string;
  emoji: string;
  rarity: FischRarity;
  baseValue: number;
  minWeight: number;
  maxWeight: number;
  zones: string[];
  danger?: number;
};

export type FischRod = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  power: number; // cuts fishing cooldown
  luck: number;  // % weight bonus toward rarer fish
};

export type FischBoat = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  speed: number;
  hull: number;
  fishing: number;
  cargo: number;
  magic: number;
  concealment: number;
};

export type FischSpell = {
  id: string;
  name: string;
  emoji: string;
  tier: 1 | 2 | 3 | 4 | 5;
  mana: number;
  power: number;
  effect: string;
};

export type FischZone = {
  id: string;
  name: string;
  emoji: string;
  level: number;
  fishMultiplier: number;
  treasureMultiplier: number;
  danger: number;
  territoryValue: number;
};

export type FischPlayer = {
  id: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  fishingLevel: number;
  fishingXp: number;
  sailingLevel: number;
  sailingXp: number;
  combatLevel: number;
  combatXp: number;
  magicLevel: number;
  magicXp: number;
  seaReputation: number;
  rodId: string;
  boatId: string;
  inventory: Record<string, { name: string; emoji: string; rarity: FischRarity; qty: number; value: number }>;
  discoveredZones: string[];
  currentZone: string;
  ownedTerritories: string[];
  lastAction: Record<string, number>;
  wins: number;
  losses: number;
  biggestCatchKg: number;
  totalFish: number;
  totalTreasure: number;
  totalRobbery: number;
  spellsUnlocked: string[];
  active: boolean;
  streak: number;
  lastFishDay: string;
  // ── extended systems (all optional so old saves load untouched) ──
  bait?: string;            // active bait id, see FISCH_BAITS
  displayName?: string;     // .fisch setname
  escapes?: { fish: string; at: number }[];  // graveyard / near-miss log
  tourBest?: number;        // heaviest catch in the current tournament window
  tourWindow?: number;      // tournament window id the best belongs to
};

const FISCH_DB_KEY = 'fischPlayers';

// ── Reel minigame ─────────────────────────────────────────────────────────
// A bite no longer resolves instantly — it opens a turn-based reel that the
// player fights with repeated `.pull` calls. Session state is in-memory only
// (mirrors gambling.ts's blackjack `sessions` Map pattern) since a half-caught
// fish isn't worth persisting across a bot restart.
type FischReelSession = {
  fishId: string;
  weight: number;
  zoneId: string;
  progress: number;   // 0-100, catch lands at 100
  fishPos: number;     // 0..REEL_WIDTH-1
  zoneStart: number;   // start index of the safe zone
  zoneWidth: number;
  drift: number;       // how far the fish can jump per pull
  pullsLeft: number;
  missed: boolean;     // any miss so far — gates the Perfect Reel bonus
  isLucky: boolean;    // preserves the pre-reel "lucky catch below level gate" flourish
};

const REEL_WIDTH = 10;
const REEL_MAX_PULLS = 2; // 2-pull reel — land it or lose it
const reelSessions = new Map<string, FischReelSession>();

// How hard a species fights, independent of the zone it's hooked in —
// Common is nearly auto-caught, Ancient genuinely fights back.
const RARITY_FIGHT: Record<FischRarity, number> = {
  Common: 0.12,
  Uncommon: 0.28,
  Rare: 0.45,
  Epic: 0.6,
  Legendary: 0.75,
  Mythic: 0.9,
  Ancient: 1,
};

function fightIntensity(fish: FischFish, zone: FischZone): number {
  // Blend species fight with zone danger so the same fish is a little
  // tougher in a rougher zone, without needing a per-fish danger field.
  const zoneFactor = Math.min(1, zone.danger / 90);
  return Math.min(1, RARITY_FIGHT[fish.rarity] * 0.75 + zoneFactor * 0.25);
}

function renderReelBar(session: FischReelSession, fish: FischFish): string {
  const cells: string[] = [];
  for (let i = 0; i < REEL_WIDTH; i++) {
    const inZone = i >= session.zoneStart && i < session.zoneStart + session.zoneWidth;
    cells.push(inZone ? '▣' : '▢');
  }
  const markerRow = Array(REEL_WIDTH).fill(' ');
  markerRow[session.fishPos] = '▼';
  const odds = Math.round((session.zoneWidth / REEL_WIDTH) * 100);
  return [
    `⚡ *${fish.name}* is on the line`,
    '',
    cells.join(''),
    markerRow.join(''),
    '',
    `Pull ${session.pullsLeft} of ${REEL_MAX_PULLS}  ·  catch window ${odds}%`,
    '> .pull',
  ].join('\n');
}

export const FISCH_ZONES: FischZone[] = [
  { id: 'starter-coast', name: 'Starter Coast', emoji: '🏝️', level: 1, fishMultiplier: 1, treasureMultiplier: 1, danger: 3, territoryValue: 10 },
  { id: 'bluewater-bay', name: 'Bluewater Bay', emoji: '🌊', level: 3, fishMultiplier: 1.15, treasureMultiplier: 1.1, danger: 7, territoryValue: 15 },
  { id: 'mistwater', name: 'Mistwater', emoji: '🌫️', level: 8, fishMultiplier: 1.35, treasureMultiplier: 1.45, danger: 14, territoryValue: 25 },
  { id: 'storm-belt', name: 'Storm Belt', emoji: '🌪️', level: 15, fishMultiplier: 1.65, treasureMultiplier: 1.8, danger: 23, territoryValue: 40 },
  { id: 'raider-waters', name: 'Raider Waters', emoji: '🏴‍☠️', level: 22, fishMultiplier: 1.9, treasureMultiplier: 2.2, danger: 31, territoryValue: 55 },
  { id: 'deep-trench', name: 'Deep Trench', emoji: '🕳️', level: 30, fishMultiplier: 2.35, treasureMultiplier: 2.8, danger: 42, territoryValue: 75 },
  { id: 'blackwater', name: 'Blackwater', emoji: '☠️', level: 40, fishMultiplier: 2.8, treasureMultiplier: 3.3, danger: 52, territoryValue: 100 },
  { id: 'leviathan-sea', name: 'Leviathan Sea', emoji: '🐋', level: 55, fishMultiplier: 3.5, treasureMultiplier: 4.1, danger: 65, territoryValue: 140 },
  { id: 'arcane-sea', name: 'Arcane Sea', emoji: '🔮', level: 70, fishMultiplier: 4.1, treasureMultiplier: 5.4, danger: 74, territoryValue: 200 },
  { id: 'abyssal-ocean', name: 'Abyssal Ocean', emoji: '🌑', level: 85, fishMultiplier: 5.2, treasureMultiplier: 7, danger: 88, territoryValue: 300 },
];

export const FISCH_BOATS: FischBoat[] = [
  { id: 'wooden-skiff', name: 'Wooden Skiff', emoji: '🛶', price: 0, speed: 20, hull: 25, fishing: 5, cargo: 20, magic: 0, concealment: 4 },
  { id: 'sailboat', name: 'Sailboat', emoji: '⛵', price: 7500, speed: 35, hull: 40, fishing: 10, cargo: 35, magic: 5, concealment: 8 },
  { id: 'speedboat', name: 'Speedboat', emoji: '🚤', price: 28000, speed: 65, hull: 32, fishing: 8, cargo: 28, magic: 0, concealment: 16 },
  { id: 'yacht', name: 'Yacht', emoji: '🛥️', price: 125000, speed: 50, hull: 90, fishing: 22, cargo: 85, magic: 15, concealment: 12 },
  { id: 'frigate', name: 'Frigate', emoji: '⚓', price: 450000, speed: 58, hull: 150, fishing: 14, cargo: 110, magic: 25, concealment: 10 },
  { id: 'warship', name: 'Warship', emoji: '🚢', price: 1500000, speed: 60, hull: 250, fishing: 8, cargo: 120, magic: 35, concealment: 6 },
  { id: 'pirate-galleon', name: 'Pirate Galleon', emoji: '🏴‍☠️', price: 3200000, speed: 54, hull: 300, fishing: 18, cargo: 180, magic: 45, concealment: 20 },
  { id: 'arcane-vessel', name: 'Arcane Vessel', emoji: '✨', price: 9000000, speed: 75, hull: 210, fishing: 30, cargo: 150, magic: 90, concealment: 35 },
  { id: 'emperor-ship', name: "Emperor's Ship", emoji: '👑', price: 25000000, speed: 82, hull: 400, fishing: 45, cargo: 250, magic: 110, concealment: 28 },
];

export const FISCH_RODS: FischRod[] = [
  { id: 'wooden-rod', name: 'Wooden Rod', emoji: '🎣', price: 0, power: 0, luck: 0 },
  { id: 'fiber-rod', name: 'Fiberglass Rod', emoji: '🎣', price: 4000, power: 3, luck: 8 },
  { id: 'carbon-rod', name: 'Carbon Rod', emoji: '🎣', price: 22000, power: 6, luck: 18 },
  { id: 'enchanted-rod', name: 'Enchanted Rod', emoji: '🔮', price: 90000, power: 9, luck: 32 },
  { id: 'leviathan-rod', name: "Leviathan's Rib Rod", emoji: '🐋', price: 400000, power: 12, luck: 50 },
  { id: 'ancient-rod', name: 'Rod of the First Tide', emoji: '👑', price: 2000000, power: 16, luck: 80 },
];

export const FISCH_SPELLS: FischSpell[] = [
  { id: 'fireball', name: 'Fireball', emoji: '🔥', tier: 1, mana: 12, power: 24, effect: 'burns an opponent for a burst of damage' },
  { id: 'ice-lance', name: 'Ice Lance', emoji: '❄️', tier: 1, mana: 14, power: 28, effect: 'pierces defenses with frost' },
  { id: 'tidal-force', name: 'Tidal Force', emoji: '🌊', tier: 2, mana: 22, power: 42, effect: 'creates a crushing wave' },
  { id: 'lightning', name: 'Lightning Bolt', emoji: '⚡', tier: 2, mana: 25, power: 48, effect: 'strikes with storm energy' },
  { id: 'whirlpool', name: 'Whirlpool', emoji: '🌀', tier: 3, mana: 34, power: 62, effect: 'traps a target in a violent current' },
  { id: 'tempest', name: 'Tempest', emoji: '🌪️', tier: 3, mana: 45, power: 78, effect: 'summons a localized storm' },
  { id: 'abyssal-drain', name: 'Abyssal Drain', emoji: '🌑', tier: 4, mana: 62, power: 105, effect: 'drains life from the target' },
  { id: 'arcane-rift', name: 'Arcane Rift', emoji: '🔮', tier: 5, mana: 90, power: 150, effect: 'tears open a breach in reality' },
];

const FISH: FischFish[] = [
  { id: 'silver-minnow', name: 'Silver Minnow', emoji: '🐟', rarity: 'Common', baseValue: 120, minWeight: 0.4, maxWeight: 1.8, zones: ['starter-coast', 'bluewater-bay'] },
  { id: 'bluefin-tuna', name: 'Bluefin Tuna', emoji: '🐟', rarity: 'Uncommon', baseValue: 650, minWeight: 8, maxWeight: 32, zones: ['bluewater-bay', 'mistwater', 'storm-belt'] },
  { id: 'crimson-tuna', name: 'Crimson Tuna', emoji: '🐟', rarity: 'Rare', baseValue: 1800, minWeight: 20, maxWeight: 75, zones: ['mistwater', 'storm-belt', 'raider-waters'] },
  { id: 'storm-eel', name: 'Storm Eel', emoji: '⚡', rarity: 'Rare', baseValue: 3000, minWeight: 4, maxWeight: 18, zones: ['storm-belt', 'raider-waters', 'deep-trench'] },
  { id: 'giant-squid', name: 'Giant Squid', emoji: '🦑', rarity: 'Epic', baseValue: 8500, minWeight: 40, maxWeight: 220, zones: ['deep-trench', 'blackwater'] },
  { id: 'ghost-koi', name: 'Ghost Koi', emoji: '👻', rarity: 'Epic', baseValue: 12000, minWeight: 2, maxWeight: 12, zones: ['mistwater', 'arcane-sea'] },
  { id: 'leviathan-fin', name: 'Leviathan Fin', emoji: '🐋', rarity: 'Legendary', baseValue: 45000, minWeight: 250, maxWeight: 900, zones: ['leviathan-sea'] },
  { id: 'arcane-manta', name: 'Arcane Manta', emoji: '✨', rarity: 'Legendary', baseValue: 65000, minWeight: 80, maxWeight: 420, zones: ['arcane-sea'] },
  { id: 'void-whale', name: 'Void Whale', emoji: '🌑', rarity: 'Mythic', baseValue: 180000, minWeight: 600, maxWeight: 1600, zones: ['abyssal-ocean'] },
  { id: 'ancient-serpent', name: 'Ancient Sea Serpent', emoji: '🐉', rarity: 'Ancient', baseValue: 650000, minWeight: 900, maxWeight: 3200, zones: ['abyssal-ocean'] },
  { id: 'golden-crownfish', name: 'Golden Crownfish', emoji: '👑', rarity: 'Mythic', baseValue: 275000, minWeight: 10, maxWeight: 60, zones: ['arcane-sea'] },
];

const RARITY_MULTIPLIER: Record<FischRarity, number> = {
  Common: 1,
  Uncommon: 1.3,
  Rare: 1.8,
  Epic: 2.7,
  Legendary: 4.5,
  Mythic: 8,
  Ancient: 15,
};

// Base pick weight per rarity — keeps rarer tiers genuinely rare even once
// they're "unlocked" for a roll. See pickFish().
const RARITY_WEIGHT: Record<FischRarity, number> = {
  Common: 100,
  Uncommon: 45,
  Rare: 18,
  Epic: 7,
  Legendary: 2.5,
  Mythic: 0.8,
  Ancient: 0.25,
};

function data(): Record<string, FischPlayer> {
  const db = getDb() as any;
  if (!db[FISCH_DB_KEY]) db[FISCH_DB_KEY] = {};
  return db[FISCH_DB_KEY];
}

function save(): void {
  saveDb();
}

function now(): number { return Date.now(); }

function cooldownRemaining(p: FischPlayer, key: string, durationMs: number): number {
  const last = p.lastAction[key] || 0;
  return Math.max(0, durationMs - (now() - last));
}

function mark(p: FischPlayer, key: string): void { p.lastAction[key] = now(); }

function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function xpForNext(level: number): number {
  return Math.floor(100 + level * 85 + level * level * 10);
}

function addXp(p: FischPlayer, amount: number): string | null {
  let levelUp: string | null = null;
  p.xp += Math.max(0, Math.floor(amount));
  while (p.xp >= xpForNext(p.level) && p.level < 100) {
    p.xp -= xpForNext(p.level);
    p.level += 1;
    p.maxHp += 2;
    p.maxMana += 2;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    levelUp = `🎉 Level ${p.level}`;
  }
  return levelUp;
}

function addSkillXp(p: FischPlayer, type: 'fishing' | 'sailing' | 'combat' | 'magic', amount: number): void {
  const map = {
    fishing: ['fishingXp', 'fishingLevel'],
    sailing: ['sailingXp', 'sailingLevel'],
    combat: ['combatXp', 'combatLevel'],
    magic: ['magicXp', 'magicLevel'],
  } as const;
  const [xpKey, levelKey] = map[type];
  const xpNeed = (p[levelKey] * 250) + 200;
  p[xpKey] += Math.max(0, Math.floor(amount));
  while (p[xpKey] >= (p[levelKey] * 250) + 200 && p[levelKey] < 100) {
    p[xpKey] -= (p[levelKey] * 250) + 200;
    p[levelKey] += 1;
  }
}

function zoneById(id: string): FischZone | undefined { return FISCH_ZONES.find(z => z.id === id); }
// Short buy codes — "b3" / "3" resolves to the catalog entry at that index,
// matching the `b#` shown in .boat list and .rod list. Plain slug ids still
// work, so ".boat buy yacht" keeps functioning.
function shortIndex(raw: string, prefix: string): number | null {
  const m = String(raw).trim().toLowerCase().match(new RegExp(`^${prefix}?#?(\\d+)$`));
  return m ? Number(m[1]) : null;
}
function boatById(id: string): FischBoat | undefined {
  const n = shortIndex(id, 'b');
  if (n !== null && FISCH_BOATS[n]) return FISCH_BOATS[n];
  return FISCH_BOATS.find(b => b.id === id);
}
function rodById(id: string): FischRod | undefined {
  const n = shortIndex(id, 'r');
  if (n !== null && FISCH_RODS[n]) return FISCH_RODS[n];
  return FISCH_RODS.find(r => r.id === id);
}
function spellById(id: string): FischSpell | undefined { return FISCH_SPELLS.find(s => s.id === id); }

// Spells were only ever granted at character creation (fireball) — nothing
// in the original build ever unlocked the other 7 as magicLevel rose, even
// though castSpell()'s own lock message promises "Reach Magic Level X".
// This grants any spell whose magicLevel threshold (tier*10) has been met.
function syncSpellUnlocks(p: FischPlayer): string[] {
  const gained: string[] = [];
  for (const s of FISCH_SPELLS) {
    if (p.magicLevel >= s.tier * 10 && !p.spellsUnlocked.includes(s.id)) {
      p.spellsUnlocked.push(s.id);
      gained.push(s.id);
    }
  }
  return gained;
}

export function getFischPlayer(id: string): FischPlayer {
  const store = data();
  if (!store[id]) {
    store[id] = {
      id,
      level: 1,
      xp: 0,
      gold: 2500,
      hp: 100,
      maxHp: 100,
      mana: 100,
      maxMana: 100,
      fishingLevel: 1,
      fishingXp: 0,
      sailingLevel: 1,
      sailingXp: 0,
      combatLevel: 1,
      combatXp: 0,
      magicLevel: 1,
      magicXp: 0,
      seaReputation: 0,
      rodId: 'wooden-rod',
      boatId: 'wooden-skiff',
      inventory: {},
      discoveredZones: ['starter-coast'],
      currentZone: 'starter-coast',
      ownedTerritories: [],
      lastAction: {},
      wins: 0,
      losses: 0,
      biggestCatchKg: 0,
      totalFish: 0,
      totalTreasure: 0,
      totalRobbery: 0,
      spellsUnlocked: ['fireball'],
      active: true,
      streak: 0,
      lastFishDay: '',
    };
    save();
  }
  // Defensive migration for players saved before streak/lastFishDay existed.
  if (store[id].streak === undefined) store[id].streak = 0;
  if (store[id].lastFishDay === undefined) store[id].lastFishDay = '';
  return store[id];
}

export function formatFischMenu(p: FischPlayer): string {
  const boat = boatById(p.boatId)!;
  const rod = rodById(p.rodId) ?? FISCH_RODS[0];
  const zone = zoneById(p.currentZone)!;
  const nextSpell = FISCH_SPELLS.find(s => !p.spellsUnlocked.includes(s.id));
  return [
    '🎣 *FISCH*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Lv ${p.level}  ·  Fish ${p.fishingLevel}  ·  Sail ${p.sailingLevel}  ·  Combat ${p.combatLevel}  ·  Magic ${p.magicLevel}`,
    `${p.gold.toLocaleString()} gold  ·  HP ${p.hp}/${p.maxHp}  ·  Mana ${p.mana}/${p.maxMana}`,
    `${zone.name}  ·  ${boat.name}  ·  ${rod.name}`,
    p.streak >= 2 ? `Streak x${p.streak} — keep it alive` : '',
    nextSpell ? `Next spell: ${nextSpell.name} at Magic Lv ${nextSpell.tier * 10} (you're ${p.magicLevel})` : '',
    reelSessions.has(p.id) ? '⚡ Something is on your line — use .pull' : '',
    '━━━━━━━━━━━━━━━━━━━━',
    '*FISH*',
    '.fish cast — drop a line',
    '.pull — fight the catch (2 pulls: land it or lose it)',
    '.sea map  ·  .sail <zone>',
    '*GEAR*',
    '.boat list  ·  .boat info',
    '.rod list  ·  .rod info',
    '*OCEAN*',
    '.sea treasure  ·  .sea battle <id>',
    '.sea rob <id>  ·  .sea territory [claim|attack|map]',
    '*CHARACTER*',
    '.fisch spell  ·  .fisch inventory',
    '.fisch stats  ·  .fisch leaderboard',
    '━━━━━━━━━━━━━━━━━━━━',
    'Catch. Sail. Fight. Conquer.',
  ].filter(Boolean).join('\n');
}

export function formatFischHelp(): string {
  return [
    '🎣 *FISCH COMMANDS*',
    '━━━━━━━━━━━━━━━━━━━━',
    '.fisch — main terminal',
    '.fish cast — fish in current zone',
    '.pull — fight the catch (2 pulls: land it or lose it)',
    '.sea map — discoverable waters',
    '.sail <zone> — travel',
    '.boat list — ships',
    '.boat buy <id> — buy a ship',
    '.boat info — current ship',
    '.rod list — fishing rods',
    '.rod buy <id> — buy a rod',
    '.rod info — current rod',
    '.sea treasure — hunt treasure',
    '.sea battle <playerId> — sea PvP',
    '.sea rob <playerId> — rob cargo/gold',
    '.sea territory map — sea territories',
    '.sea territory claim <id> — claim a neutral zone',
    '.sea territory attack <id> — contest another territory',
    '.fisch spell list — spellbook',
    '.fisch spell cast <spell> — cast a spell',
    '.fisch inventory — catches and treasures',
    '.fisch stats — character sheet',
    '.fisch leaderboard — ocean rankings',
    '━━━━━━━━━━━━━━━━━━━━',
    'Sea PvP has capped, recoverable losses.',
  ].join('\n');
}

function pickFish(zone: FischZone, p: FischPlayer): FischFish {
  const candidates = FISH.filter(f => f.zones.includes(zone.id));
  // Guard against a future zone with no matching FISH entries (would
  // otherwise crash fishCast on `pool[NaN]`).
  if (!candidates.length) return FISH[0];

  const rod = rodById(p.rodId) ?? FISCH_RODS[0];
  const bait = activeBait(p);
  const weather = currentWeather();
  // Luck sources stack: rod, equipped bait, and the current 2-hour weather
  // window. Weather can be negative (Thunderhead), which only ever *reduces*
  // the nudge toward rare tiers — it never makes commons rarer than base.
  const luckTotal = rod.luck + bait.luck + weather.luck;
  const eligible = candidates.filter(f => {
    const required = f.rarity === 'Ancient' ? 70 : f.rarity === 'Mythic' ? 45 : f.rarity === 'Legendary' ? 25 : f.rarity === 'Epic' ? 15 : 1;
    // Small "lucky catch" chance even below the normal level gate — kept
    // from the original design, it's a nice surprise-good-catch moment.
    return p.fishingLevel >= required || Math.random() < 0.08;
  });
  const pool = eligible.length ? eligible : candidates;

  // Previously this picked UNIFORMLY among whatever passed the above
  // filter — so if a lucky roll let 2 Epics into the pool alongside 1
  // Common, the Common only had a 1-in-3 shot instead of dominating like a
  // "Common" should. This weights the actual pick by rarity so rare fish
  // stay rare even once they're eligible, with the rod's luck stat
  // nudging the odds up a bit toward rarer tiers.
  const weighted = pool.map(f => ({ f, w: RARITY_WEIGHT[f.rarity] * (1 + Math.max(0, luckTotal) / 100) }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * total;
  for (const x of weighted) {
    if (roll < x.w) return x.f;
    roll -= x.w;
  }
  return weighted[weighted.length - 1].f;
}

export function fishCast(p: FischPlayer): string {
  if (reelSessions.has(p.id)) {
    const s = reelSessions.get(p.id)!;
    const fish = FISH.find(f => f.id === s.fishId)!;
    return `🎣 Something's already on your line!\n${renderReelBar(s, fish)}`;
  }
  const rod = rodById(p.rodId) ?? FISCH_RODS[0];
  const cdMs = Math.max(6000, 20000 - rod.power * 800);
  const cooldown = cooldownRemaining(p, 'fish', cdMs);
  if (cooldown > 0) return `⏳ Your line is still being reset. Try again in ${formatDuration(cooldown)}.`;
  const zone = zoneById(p.currentZone)!;
  const boat = boatById(p.boatId)!;
  const bait = activeBait(p);
  const weather = currentWeather();
  // Bait is consumed per cast — Golden Bait is the real cast-by-cast money
  // decision (burn it chasing something big, or fish cheap and grind volume).
  // Checked before `mark()` so a failed cast doesn't eat the cooldown.
  if (bait.cost > 0 && p.gold < bait.cost) {
    return `Not enough gold — ${bait.name} costs ${bait.cost.toLocaleString()}g per cast, you have ${p.gold.toLocaleString()}g.\nSwitch bait: .fisch bait basic`;
  }
  mark(p, 'fish');
  const baitPaid = bait.cost;
  if (baitPaid > 0) p.gold -= baitPaid;

  // A little passive mana trickle so the spell loop isn't fully gated on
  // full character level-ups (the only other source of mana refill).
  p.mana = Math.min(p.maxMana, p.mana + 2);

  const today = new Date().toISOString().slice(0, 10);
  let dailyBonusLine = '';
  if (p.lastFishDay !== today) {
    p.lastFishDay = today;
    p.gold += 500;
    addXp(p, 50);
    dailyBonusLine = `\n🎁 First catch of the day: +500g, +50 XP!`;
  }

  const difficulty = zone.danger + Math.max(0, 15 - boat.fishing) * 0.25;
  const roll = Math.random() * 100 + p.fishingLevel * 0.25 + boat.fishing * 0.5 + Math.max(0, weather.luck) * 0.4;
  if (roll < difficulty * 0.5) {
    p.streak = 0;
    addXp(p, 12);
    addSkillXp(p, 'fishing', 20);
    save();
    return `The water goes cold — nothing bites.\n+12 XP · +20 Fishing XP${dailyBonusLine}${baitPaid > 0 ? `\nBait spent: ${bait.name} (-${baitPaid.toLocaleString()}g)` : ''}`;
  }

  const fish = pickFish(zone, p);
  const weight = Number((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)).toFixed(1));

  const fight = fightIntensity(fish, zone);
  const zoneWidth = Math.max(3, Math.round(8 - fight * 5) + bait.zoneBonus);
  const zoneStart = Math.max(0, Math.floor((REEL_WIDTH - zoneWidth) / 2));
  const driftBase = 1 + Math.round(fight * 4);
  const drift = Math.max(1, driftBase - Math.floor(rod.power / 4) - (bait.id === 'calming' ? 1 : 0));
  const session: FischReelSession = {
    fishId: fish.id,
    weight,
    zoneId: zone.id,
    progress: 0,
    fishPos: zoneStart + Math.floor(zoneWidth / 2),
    zoneStart,
    zoneWidth,
    drift,
    pullsLeft: REEL_MAX_PULLS,
    missed: false,
    isLucky: p.fishingLevel < (fish.rarity === 'Ancient' ? 70 : fish.rarity === 'Mythic' ? 45 : fish.rarity === 'Legendary' ? 25 : fish.rarity === 'Epic' ? 15 : 1),
  };
  reelSessions.set(p.id, session);
  save();

  return `Something took the bait${dailyBonusLine}\nBait: ${bait.name}${baitPaid > 0 ? ` (-${baitPaid.toLocaleString()}g)` : ''}  ·  ${weather.name}\n\n${renderReelBar(session, fish)}`;
}

function resolveFischCatch(p: FischPlayer, session: FischReelSession): string {
  const fish = FISH.find(f => f.id === session.fishId)!;
  const zone = zoneById(session.zoneId) ?? zoneById(p.currentZone)!;
  const weight = session.weight;
  p.streak += 1;
  const streakMult = 1 + Math.min(p.streak, 20) * 0.02; // caps at +40% around a 20-streak
  const perfect = !session.missed;
  const perfectMult = perfect ? 1.2 : 1;
  // Mutation rolls on top of the species — cheap variety, so even a Common
  // catch can be a moment. Multiplies value and value-at-sale.
  const mutation = rollMutation();
  const mutationMult = mutation ? mutation.mult : 1;
  const value = Math.max(1, Math.floor(fish.baseValue * (weight / Math.max(1, fish.minWeight + fish.maxWeight) * 2) * zone.fishMultiplier * (RARITY_MULTIPLIER[fish.rarity] / 1.5) * streakMult * perfectMult * mutationMult));
  // Mutated catches are stored under their own key so the mutation premium
  // survives to the merchant instead of being averaged into the base stack.
  const inventoryKey = mutation ? `fish:${fish.id}:${mutation.id}` : `fish:${fish.id}`;
  const itemName = mutation ? `${fish.name} (${mutation.name})` : fish.name;
  p.inventory[inventoryKey] ??= { name: itemName, emoji: fish.emoji, rarity: fish.rarity, qty: 0, value };
  p.inventory[inventoryKey].qty += 1;
  p.gold += value;
  p.totalFish += 1;
  const isRecord = weight > p.biggestCatchKg;
  p.biggestCatchKg = Math.max(p.biggestCatchKg, weight);
  p.seaReputation += fish.rarity === 'Ancient' ? 8 : fish.rarity === 'Mythic' ? 5 : fish.rarity === 'Legendary' ? 3 : 1;
  const xp = Math.max(20, Math.floor(40 * RARITY_MULTIPLIER[fish.rarity] * perfectMult));
  const tourWin = recordTournamentCatch(p, weight);
  addXp(p, xp);
  addSkillXp(p, 'fishing', xp);
  reelSessions.delete(p.id);
  save();

  const bigCatch = fish.rarity === 'Epic' || fish.rarity === 'Legendary' || fish.rarity === 'Mythic' || fish.rarity === 'Ancient';
  const mutationLine = mutation ? `\n${mutation.name} mutation — value x${mutation.mult}` : '';
  const tourLine = tourWin ? `\nTournament leader this window` : '';
  const flourish = bigCatch ? `\n*${fish.rarity.toUpperCase()} CATCH*` : '';
  const luckyLine = session.isLucky ? `\nLucky bite — hooked early` : '';
  const perfectLine = perfect ? `\n*PERFECT REEL* — bonus gold & XP` : '';
  const recordLine = isRecord ? `\n*Personal best weight*` : '';
  const streakLine = p.streak >= 3 ? `\nStreak x${p.streak} (+${Math.min(p.streak, 20) * 2}% value)` : '';

  return [
    '🎣 *CATCH*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${fish.emoji} ${itemName}`,
    `${fish.rarity}  ·  ${weight} kg`,
    `+${value.toLocaleString()} gold  ·  +${xp} XP`,
    '━━━━━━━━━━━━━━━━━━━━',
  ].join('\n') + mutationLine + flourish + perfectLine + luckyLine + recordLine + streakLine + tourLine;
}

function resolveFischEscape(p: FischPlayer, session: FischReelSession): string {
  const fish = FISH.find(f => f.id === session.fishId)!;
  p.streak = 0;
  // Near-miss log — feeds .fisch losses. Capped so a bad streak can't grow
  // the save file forever.
  p.escapes = [...(p.escapes || []), { fish: fish.name, at: Date.now() }].slice(-40);
  addXp(p, 15);
  addSkillXp(p, 'fishing', 15);
  reelSessions.delete(p.id);
  save();
  return `The line snaps — it's gone.\n${fish.emoji} The ${fish.name} slips back into the water.\n+15 XP · +15 Fishing XP`;
}

export function fishPull(p: FischPlayer): string {
  const session = reelSessions.get(p.id);
  if (!session) return "❌ Nothing's on your line. Cast with .fish first.";
  const fish = FISH.find(f => f.id === session.fishId)!;

  session.pullsLeft -= 1;
  // The fish drifts, then you see where it ended up — landing inside the
  // window is the catch. Two pulls total: land it or lose it.
  const step = Math.floor(Math.random() * (session.drift * 2 + 1)) - session.drift;
  session.fishPos = Math.max(0, Math.min(REEL_WIDTH - 1, session.fishPos + step));
  const inZone = session.fishPos >= session.zoneStart && session.fishPos < session.zoneStart + session.zoneWidth;

  if (inZone) {
    session.progress = 100;
    return resolveFischCatch(p, session);
  }

  session.missed = true;
  if (session.pullsLeft <= 0) return resolveFischEscape(p, session);
  return `It slipped off the hook — one pull left.\n\n${renderReelBar(session, fish)}`;
}

export function formatSeaMap(p: FischPlayer): string {
  return [
    '🗺️ *FISCH SEA MAP*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_ZONES.map(z => {
      const open = p.discoveredZones.includes(z.id) ? '✅' : (p.level + 5 >= z.level ? '🔒 NEAR' : '❌');
      const here = p.currentZone === z.id ? ' ◀ YOU' : '';
      return `${open} ${z.emoji} ${z.name} — Lv.${z.level} · danger ${z.danger}${here}`;
    }),
    '━━━━━━━━━━━━━━━━━━━━',
    '💡 Sail into nearby waters to discover new fishing grounds.',
  ].join('\n');
}

export function sailTo(p: FischPlayer, target: string): string {
  const normalized = target.trim().toLowerCase().replace(/\s+/g, '-');
  const zone = FISCH_ZONES.find(z => z.id === normalized || z.name.toLowerCase() === target.toLowerCase());
  if (!zone) return '❌ Unknown sea zone. Use .sea map.';
  if (p.level < zone.level) return `🔒 ${zone.name} requires FISCH level ${zone.level}. You are level ${p.level}.`;
  const cooldown = cooldownRemaining(p, 'sail', Math.max(15000, 60000 - boatById(p.boatId)!.speed * 500));
  if (cooldown > 0) return `⏳ You are still at sea. ETA: ${formatDuration(cooldown)}.`;
  mark(p, 'sail');
  if (!p.discoveredZones.includes(zone.id)) p.discoveredZones.push(zone.id);
  p.currentZone = zone.id;
  addXp(p, 30 + zone.level);
  addSkillXp(p, 'sailing', 25 + zone.level);
  if (Math.random() < zone.danger / 140) p.hp = Math.max(10, p.hp - Math.floor(zone.danger / 3));
  save();
  return [
    '⛵ *ARRIVAL*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${zone.name}`,
    `Danger      ${zone.danger}`,
    `Fish rate   x${zone.fishMultiplier}`,
    `Treasure    x${zone.treasureMultiplier}`,
    `Sailing XP gained`,
    p.hp < p.maxHp ? `Rough waters — you're at ${p.hp} HP.` : 'Ship is steady.',
  ].join('\n');
}

export function formatBoatList(p: FischPlayer): string {
  return [
    '⛵ *SHIPYARD*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_BOATS.map(b => {
      const owned = b.id === p.boatId;
      const price = b.price === 0 ? 'STARTER' : `${b.price.toLocaleString()}g`;
      return `${owned ? '›' : ' '} ${b.emoji} *${b.name}* — ${price}\n   spd ${b.speed} · hull ${b.hull} · fish ${b.fishing} · cargo ${b.cargo}  [b#${FISCH_BOATS.indexOf(b)}]`;
    }),
    '━━━━━━━━━━━━━━━━━━━━',
    '.boat buy <b#>',
  ].join('\n');
}

export function buyBoat(p: FischPlayer, id: string): string {
  const boat = boatById(id.trim().toLowerCase());
  if (!boat) return '❌ Unknown boat. Use .boat list.';
  if (boat.price <= 0) return '✅ You already own the starter skiff.';
  if (p.gold < boat.price) return `💸 Not enough gold. Need ${boat.price.toLocaleString()}g.`;
  p.gold -= boat.price;
  p.boatId = boat.id;
  p.sailingLevel = Math.max(p.sailingLevel, Math.floor(boat.speed / 8));
  save();
  return [
    '⛵ *NEW VESSEL*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${boat.emoji} ${boat.name}`,
    `-${boat.price.toLocaleString()}g`,
    `spd ${boat.speed} · hull ${boat.hull} · fish ${boat.fishing} · cargo ${boat.cargo}`,
  ].join('\n');
}

export function formatBoatInfo(p: FischPlayer): string {
  const b = boatById(p.boatId)!;
  return [
    `⛵ *${b.name.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Speed       ${b.speed}`,
    `Hull        ${b.hull}`,
    `Fishing     ${b.fishing}`,
    `Cargo       ${b.cargo}`,
    `Magic       ${b.magic}`,
    `Concealment ${b.concealment}`,
    `Zone        ${zoneById(p.currentZone)?.name}`,
  ].join('\n');
}

export function formatRodList(p: FischPlayer): string {
  return [
    '🎣 *ROD SHOP*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_RODS.map(r => {
      const owned = r.id === p.rodId;
      const price = r.price === 0 ? 'STARTER' : `${r.price.toLocaleString()}g`;
      return `${owned ? '›' : ' '} ${r.emoji} *${r.name}* — ${price}\n   power ${r.power} · luck +${r.luck}%  [r#${FISCH_RODS.indexOf(r)}]`;
    }),
    '━━━━━━━━━━━━━━━━━━━━',
    '.rod buy <r#>',
  ].join('\n');
}

export function buyRod(p: FischPlayer, id: string): string {
  const rod = rodById(id.trim().toLowerCase());
  if (!rod) return '❌ Unknown rod. Use .rod list.';
  if (rod.price <= 0) return '✅ You already own the starter rod.';
  if (p.gold < rod.price) return `💸 Not enough gold. Need ${rod.price.toLocaleString()}g.`;
  p.gold -= rod.price;
  p.rodId = rod.id;
  save();
  return [
    '🎣 *NEW ROD EQUIPPED*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${rod.emoji} ${rod.name}`,
    `-${rod.price.toLocaleString()}g`,
    `power ${rod.power} · luck +${rod.luck}%`,
  ].join('\n');
}

export function formatRodInfo(p: FischPlayer): string {
  const r = rodById(p.rodId) ?? FISCH_RODS[0];
  return [
    `🎣 *${r.name.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Cast cooldown  ${Math.max(6, 20 - r.power * 0.8).toFixed(1)}s`,
    `Rare-fish luck +${r.luck}%`,
    `Reel drift     -${Math.floor(r.power / 4)}`,
  ].join('\n');
}

export function huntTreasure(p: FischPlayer): string {
  const cooldown = cooldownRemaining(p, 'treasure', 90000);
  if (cooldown > 0) return `⏳ The sea has not revealed another treasure lead yet. ${formatDuration(cooldown)}.`;
  const zone = zoneById(p.currentZone)!;
  const boat = boatById(p.boatId)!;
  mark(p, 'treasure');
  if (Math.random() * 100 > 34 + boat.concealment * 0.2 + p.sailingLevel * 0.35) {
    addXp(p, 35);
    addSkillXp(p, 'sailing', 30);
    save();
    return `🧭 You scour ${zone.name}...\n🌊 Nothing but broken shells and an old anchor.\n📈 +35 XP`;
  }
  const amount = Math.floor((2000 + Math.random() * 9000) * zone.treasureMultiplier);
  const itemName = Math.random() < 0.18 ? 'Ancient Sea Relic' : 'Sunken Treasure';
  const emoji = itemName.includes('Relic') ? '🏺' : '💎';
  const key = `treasure:${itemName.toLowerCase().replace(/\s+/g, '-')}`;
  p.inventory[key] ??= { name: itemName, emoji, rarity: itemName.includes('Relic') ? 'Legendary' : 'Rare', qty: 0, value: amount };
  p.inventory[key].qty += 1;
  p.gold += amount;
  p.totalTreasure += amount;
  p.seaReputation += 2;
  addXp(p, 70);
  addSkillXp(p, 'sailing', 60);
  save();
  return `💎 *TREASURE FOUND*\n${emoji} ${itemName}\n💰 +${amount.toLocaleString()}g\n📈 +70 XP\n🌊 ${zone.name} gave up its secret.`;
}

function combatPower(p: FischPlayer): number {
  const b = boatById(p.boatId)!;
  return p.combatLevel * 8 + p.magicLevel * 3 + b.hull * 0.22 + b.speed * 0.45 + p.seaReputation * 0.1;
}

function targetFromId(raw: string): FischPlayer | undefined {
  if (!raw) return undefined;
  return data()[raw.replace(/[^a-zA-Z0-9_:-]/g, '')];
}

// Prefers WhatsApp's actual mentionedJid metadata over parsing the raw @tag
// out of message text — mirrors handler.ts's targetFromArgsOrMention, which
// exists specifically because trusting the raw text alone isn't reliable on
// every client. seaBattle/seaRob previously only ever got raw text args
// (handleFischCommand never received `mentioned` at all), so an @mention
// that didn't literally render as "@<digits>" in the text body would just
// silently fail to resolve a target.
function resolveFischTarget(args: string[], mentioned?: string[]): string {
  if (mentioned && mentioned.length) return mentioned[0];
  for (const a of args) {
    const d = a.replace(/[^0-9]/g, '');
    if (d.length >= 8) return d;
  }
  return args[0] || '';
}

export function seaBattle(attacker: FischPlayer, targetId: string): string {
  if (attacker.id === targetId) return '❌ You cannot battle yourself.';
  const target = targetFromId(targetId);
  if (!target) return '❌ That sailor does not have a FISCH account.';
  const cooldown = cooldownRemaining(attacker, 'battle', 60000);
  if (cooldown > 0) return `⏳ Sea battle cooldown: ${formatDuration(cooldown)}.`;
  mark(attacker, 'battle');
  const attackerPower = combatPower(attacker);
  const targetPower = combatPower(target);
  const aRoll = attackerPower * (0.82 + Math.random() * 0.36);
  const tRoll = targetPower * (0.82 + Math.random() * 0.36);
  const winner = aRoll >= tRoll ? attacker : target;
  const loser = winner.id === attacker.id ? target : attacker;
  const loss = Math.min(Math.floor(loser.gold * 0.08), 25000 + loser.level * 500);
  loser.gold = Math.max(0, loser.gold - loss);
  loser.hp = Math.max(15, loser.hp - Math.floor(8 + Math.random() * 18));
  winner.gold += loss;
  winner.wins += 1;
  loser.losses += 1;
  winner.seaReputation += 5;
  loser.seaReputation = Math.max(0, loser.seaReputation - 1);
  addXp(winner, 100 + Math.floor(loser.level * 5));
  addSkillXp(winner, 'combat', 120);
  addSkillXp(loser, 'combat', 40);
  save();

  if (winner.id === attacker.id) {
    return `⚔️ *SEA BATTLE WON*\n🚢 You defeated ${target.id}.\n💰 +${loss.toLocaleString()}g seized\n⭐ Reputation +5\n❤️ Target hull damaged.`;
  }
  return `🌊 *SEA BATTLE LOST*\n☠️ ${target.id} outplayed your ship.\n💰 -${loss.toLocaleString()}g\n🛡️ Damage sustained\n⚓ Regroup and recover.`;
}

export function seaRob(attacker: FischPlayer, targetId: string): string {
  if (attacker.id === targetId) return '❌ You cannot rob yourself.';
  const target = targetFromId(targetId);
  if (!target) return '❌ That sailor does not have a FISCH account.';
  const cooldown = cooldownRemaining(attacker, 'robbery', 20 * 60 * 1000);
  if (cooldown > 0) return `⏳ Sea robbery cooldown: ${formatDuration(cooldown)}.`;
  mark(attacker, 'robbery');
  const attackerBoat = boatById(attacker.boatId)!;
  const targetBoat = boatById(target.boatId)!;
  const chance = Math.max(12, Math.min(88, 48 + attackerBoat.concealment * 0.7 + attacker.sailingLevel * 0.25 - targetBoat.hull * 0.18));
  if (Math.random() * 100 > chance) {
    attacker.seaReputation = Math.max(0, attacker.seaReputation - 1);
    attacker.hp = Math.max(15, attacker.hp - 8);
    save();
    return `🚨 *ROBBERY FAILED*\n${targetId} spotted your ship before you could close in.\n💥 Your crew takes damage.\n⚠️ Better concealment or sailing mastery helps.`;
  }
  const amount = Math.min(Math.floor(target.gold * 0.06), 15000 + target.level * 500);
  target.gold = Math.max(0, target.gold - amount);
  attacker.gold += amount;
  attacker.totalRobbery += amount;
  attacker.seaReputation += 3;
  addXp(attacker, 90);
  addSkillXp(attacker, 'combat', 80);
  save();
  return `🏴‍☠️ *SEA ROBBERY SUCCESS*\n🎯 Target: ${targetId}\n💰 Cargo seized: ${amount.toLocaleString()}g\n⭐ Reputation +3\n⚠️ The seas know your flag now.`;
}

export function formatSeaTerritory(p: FischPlayer, action = ''): string {
  const territories = FISCH_ZONES.filter(z => z.level >= 3).map(z => {
    const owner = findTerritoryOwner(z.id);
    return `${owner ? '🏴' : '⬜'} ${z.emoji} ${z.name} · Value ${z.territoryValue}${owner ? ` · ${owner}` : ''}`;
  });
  return [
    '🏝️ *SEA TERRITORY*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...territories,
    '━━━━━━━━━━━━━━━━━━━━',
    action || '.sea territory claim <zone>\n.sea territory attack <zone>',
    '⚔️ Territory control is contested and recoverable.',
  ].join('\n');
}

function findTerritoryOwner(zoneId: string): string | undefined {
  for (const p of Object.values(data())) {
    if (p.ownedTerritories.includes(zoneId)) return p.id;
  }
  return undefined;
}

export function claimSeaTerritory(p: FischPlayer, zoneId: string): string {
  const zone = zoneById(zoneId);
  if (!zone) return '❌ Unknown territory. Use .sea territory map.';
  if (p.level < zone.level) return `🔒 Requires FISCH level ${zone.level}.`;
  if (findTerritoryOwner(zone.id)) return `⚔️ ${zone.name} is already controlled. Use .sea territory attack ${zone.id}.`;
  const cost = Math.floor(5000 + zone.territoryValue * 1500);
  if (p.gold < cost) return `💸 Claim cost is ${cost.toLocaleString()}g.`;
  p.gold -= cost;
  p.ownedTerritories.push(zone.id);
  p.seaReputation += zone.territoryValue / 2;
  save();
  return `🏝️ *TERRITORY CLAIMED*\n${zone.emoji} ${zone.name}\n💰 Investment: ${cost.toLocaleString()}g\n⭐ Sea reputation increased.\n🌊 Your flag now flies here.`;
}

export function attackSeaTerritory(p: FischPlayer, zoneId: string): string {
  const zone = zoneById(zoneId);
  if (!zone) return '❌ Unknown territory.';
  const ownerId = findTerritoryOwner(zone.id);
  if (!ownerId || ownerId === p.id) return ownerId === p.id ? '✅ You already control this territory.' : '⚪ Territory is neutral. Use claim instead.';
  const owner = data()[ownerId];
  const cooldown = cooldownRemaining(p, `territory:${zone.id}`, 6 * 60 * 60 * 1000);
  if (cooldown > 0) return `⏳ Territory attack cooldown: ${formatDuration(cooldown)}.`;
  mark(p, `territory:${zone.id}`);
  const offense = combatPower(p) + Math.random() * 60 + p.seaReputation;
  const defense = combatPower(owner) + zone.danger + Math.random() * 60 + owner.seaReputation;
  if (offense <= defense) {
    p.gold = Math.max(0, p.gold - Math.floor(1000 + zone.territoryValue * 50));
    p.losses += 1;
    save();
    return `⚔️ *TERRITORY ATTACK FAILED*\n${zone.emoji} ${zone.name}\n🛡️ ${ownerId} held the line.\n💸 Your fleet loses supplies.`;
  }
  owner.ownedTerritories = owner.ownedTerritories.filter(x => x !== zone.id);
  p.ownedTerritories.push(zone.id);
  p.wins += 1;
  p.seaReputation += zone.territoryValue;
  addXp(p, 220);
  addSkillXp(p, 'combat', 240);
  save();
  return `👑 *TERRITORY CONQUERED*\n${zone.emoji} ${zone.name}\n🏴 ${ownerId} has been pushed out.\n⭐ Reputation +${zone.territoryValue}\n🌊 Your flag now controls the waters.`;
}

export function castSpell(p: FischPlayer, id: string): string {
  const spell = spellById(id.toLowerCase().replace(/\s+/g, '-'));
  if (!spell) return '❌ Spell not found. Use .fisch spell list.';
  if (!p.spellsUnlocked.includes(spell.id)) return `🔒 You have not unlocked ${spell.name} yet. Reach Magic Level ${spell.tier * 10}.`;
  if (p.mana < spell.mana) return `💙 Not enough mana. Need ${spell.mana}, have ${p.mana}.`;
  const boat = boatById(p.boatId)!;
  p.mana -= spell.mana;
  const bonus = boat.magic + p.magicLevel * 1.5;
  const power = Math.floor(spell.power + bonus);
  addSkillXp(p, 'magic', spell.tier * 30);
  addXp(p, spell.tier * 40);
  const newlyUnlocked = syncSpellUnlocks(p);
  save();
  const unlockLine = newlyUnlocked.length
    ? `\n\n🌟 *NEW SPELL${newlyUnlocked.length > 1 ? 'S' : ''} UNLOCKED!*\n` +
      newlyUnlocked.map(id => { const s = spellById(id)!; return `${s.emoji} ${s.name}`; }).join('\n')
    : '';
  return `✨ *${spell.emoji} ${spell.name.toUpperCase()}*\n💥 Power: ${power}\n💙 Mana: ${p.mana}/${p.maxMana}\n${spell.emoji} The spell ${spell.effect}.${unlockLine}`;
}

export function formatSpells(p: FischPlayer): string {
  return [
    '✨ *SPELLBOOK*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_SPELLS.map(s => {
      const known = p.spellsUnlocked.includes(s.id);
      const lock = known ? '' : ` (needs Magic ${s.tier * 10})`;
      return `${known ? '›' : ' '} ${s.emoji} ${s.name} — Tier ${s.tier} · ${s.mana} mana${lock}`;
    }),
    '━━━━━━━━━━━━━━━━━━━━',
    'Use .fisch spell cast <spell>',
  ].join('\n');
}

export function formatFischInventory(p: FischPlayer): string {
  const items = Object.values(p.inventory).filter(x => x.qty > 0);
  if (!items.length) return '🎒 Your sea inventory is empty.';
  return [
    '🎒 *SEA INVENTORY*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...items.slice(0, 30).map(x => `${x.name} ×${x.qty} — ${x.rarity} · ${x.value.toLocaleString()}g ea`),
    '━━━━━━━━━━━━━━━━━━━━',
    `Slots ${items.length}/30`,
  ].join('\n');
}

export function formatFischStats(p: FischPlayer): string {
  const b = boatById(p.boatId)!;
  const r = rodById(p.rodId) ?? FISCH_RODS[0];
  return [
    '📊 *FISCH — CHARACTER*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Level       ${p.level}  (${p.xp}/${xpForNext(p.level)} XP)`,
    `Fishing     ${p.fishingLevel}`,
    `Sailing     ${p.sailingLevel}`,
    `Combat      ${p.combatLevel}`,
    `Magic       ${p.magicLevel}  (${p.spellsUnlocked.length}/${FISCH_SPELLS.length} spells)`,
    `Reputation  ${Math.floor(p.seaReputation)}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Gold        ${p.gold.toLocaleString()}`,
    `HP / Mana   ${p.hp}/${p.maxHp}  ·  ${p.mana}/${p.maxMana}`,
    `Vessel      ${b.name}`,
    `Rod         ${r.name}`,
    `Zone        ${zoneById(p.currentZone)?.name}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Streak      ${p.streak}`,
    `Fish caught ${p.totalFish}`,
    `Best weight ${p.biggestCatchKg.toFixed(1)} kg`,
    `Treasure    ${p.totalTreasure.toLocaleString()}g`,
    `Robbed      ${p.totalRobbery.toLocaleString()}g`,
    `Battles     ${p.wins}W / ${p.losses}L`,
    `Territories ${p.ownedTerritories.length}`,
  ].join('\n');
}

export function formatFischLeaderboard(): string {
  const rows = Object.values(data()).sort((a, b) => {
    const pa = b.level * 1000 + b.seaReputation * 10 + b.totalTreasure * 0.001;
    const pb = a.level * 1000 + a.seaReputation * 10 + a.totalTreasure * 0.001;
    return pa - pb;
  });
  return [
    '🏆 *FISCH LEADERBOARD*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...rows.slice(0, 10).map((p, i) => `${String(i + 1).padStart(2, ' ')}. Lv ${p.level} · rep ${Math.floor(p.seaReputation)} · terr ${p.ownedTerritories.length} · ${p.id}`),
    '━━━━━━━━━━━━━━━━━━━━',
    '🌊 Status is built on the water, not bought in a shop.',
  ].join('\n');
}

export function handleFischCommand(
  command: string,
  args: string[],
  playerId: string,
  mentioned?: string[]
): string | undefined {
  const p = getFischPlayer(playerId);
  const sub = args[0]?.toLowerCase();

  switch (command) {
    case 'fisch':
      if (!sub || sub === 'menu') return formatFischMenu(p);
      if (sub === 'help') return formatFischHelp();
      if (sub === 'stats' || sub === 'profile') return formatFischStats(p);
      if (sub === 'inventory' || sub === 'inv') return formatFischInventory(p);
      if (sub === 'leaderboard' || sub === 'lb') return formatFischLeaderboard();
      if (sub === 'spell') return args[1]?.toLowerCase() === 'cast' ? castSpell(p, args.slice(2).join(' ')) : formatSpells(p);
      return `🎣 Unknown FISCH command.\n${formatFischHelp()}`;

    case 'fish':
      if (!sub || sub === 'cast') return fishCast(p);
      return formatFischHelp();

    case 'pull':
      return fishPull(p);

    case 'rod':
      if (!sub || sub === 'list') return formatRodList(p);
      if (sub === 'buy') return buyRod(p, args[1] || '');
      if (sub === 'info') return formatRodInfo(p);
      return formatRodList(p);

    case 'boat':
      if (!sub || sub === 'list') return formatBoatList(p);
      if (sub === 'buy') return buyBoat(p, args[1] || '');
      if (sub === 'info') return formatBoatInfo(p);
      return formatBoatList(p);

    case 'sail':
      return sailTo(p, args.join('-'));

    case 'sea': {
      const action = sub || 'map';
      if (action === 'map') return formatSeaMap(p);
      if (action === 'treasure') return huntTreasure(p);
      if (action === 'battle') return seaBattle(p, resolveFischTarget(args.slice(1), mentioned));
      if (action === 'rob') return seaRob(p, resolveFischTarget(args.slice(1), mentioned));
      if (action === 'territory') {
        const territoryAction = args[1]?.toLowerCase() || 'map';
        if (territoryAction === 'map') return formatSeaTerritory(p);
        if (territoryAction === 'claim') return claimSeaTerritory(p, args[2] || '');
        if (territoryAction === 'attack') return attackSeaTerritory(p, args[2] || '');
        return formatSeaTerritory(p);
      }
      return formatSeaMap(p);
    }

    default:
      return undefined;
  }
}
// ════════════════════════════════════════════════════════════════════════
// FISCH — EXTENDED SYSTEMS
// Mutations, bait, weather, bestiary selling, duels, minigames, boss pool.
// Everything here reads/writes the same FischPlayer records as the core
// cast/pull loop — no parallel storage.
// ════════════════════════════════════════════════════════════════════════

// ── Mutations ───────────────────────────────────────────────────────────
// Rolled on top of a species at catch time. Cheap variety: a Common catch
// can still be a moment if it comes up Void-Touched.
export type FischMutation = { id: string; name: string; mult: number; weight: number };
const MUTATIONS: FischMutation[] = [
  { id: 'shiny', name: 'Shiny', mult: 1.5, weight: 60 },
  { id: 'albino', name: 'Albino', mult: 2, weight: 25 },
  { id: 'ghost', name: 'Ghost', mult: 2.75, weight: 12 },
  { id: 'golden', name: 'Golden', mult: 4, weight: 5 },
  { id: 'void-touched', name: 'Void-Touched', mult: 7, weight: 1.5 },
  { id: 'primordial', name: 'Primordial', mult: 12, weight: 0.4 },
];
const MUTATION_CHANCE = 7; // % per landed catch

function rollMutation(): FischMutation | null {
  if (Math.random() * 100 > MUTATION_CHANCE) return null;
  const total = MUTATIONS.reduce((s, m) => s + m.weight, 0);
  let roll = Math.random() * total;
  for (const m of MUTATIONS) {
    roll -= m.weight;
    if (roll <= 0) return m;
  }
  return MUTATIONS[0];
}

// ─ Bait ────────────────────────────────────────────────────────────────
// Pre-cast prep. Four clear tiers instead of a stat soup. Golden bait is
// the cast-by-cast economic decision: burn it chasing something big, or
// fish cheap and grind volume.
export type FischBait = { id: string; name: string; cost: number; luck: number; zoneBonus: number; desc: string };
export const FISCH_BAITS: FischBait[] = [
  { id: 'basic', name: 'Basic Bait', cost: 0, luck: 0, zoneBonus: 0, desc: 'free, no effect' },
  { id: 'species', name: 'Species Lure', cost: 250, luck: 12, zoneBonus: 0, desc: '+12 luck toward rarer species' },
  { id: 'calming', name: 'Calming Bait', cost: 400, luck: 4, zoneBonus: 2, desc: 'wider catch window, calmer fish' },
  { id: 'golden', name: 'Golden Bait', cost: 1500, luck: 35, zoneBonus: 1, desc: '+35 luck, one cast' },
];

function baitById(id: string): FischBait | undefined { return FISCH_BAITS.find(b => b.id === id); }
function activeBait(p: FischPlayer): FischBait { return baitById(p.bait || 'basic') ?? FISCH_BAITS[0]; }

// ── Weather ─────────────────────────────────────────────────────────────
// Deterministic per two-hour window: everyone in the same window fishes the
// same weather, and it actually shifts the cast roll.
const FISCH_WEATHERS = [
  { id: 'clear', name: 'Clear Skies', luck: 0, note: 'nothing unusual' },
  { id: 'overcast', name: 'Overcast', luck: 6, note: 'fish are moving' },
  { id: 'rain', name: 'Steady Rain', luck: 10, note: 'surface feeding' },
  { id: 'storm', name: 'Thunderhead', luck: -6, note: 'rough water, worse bites' },
  { id: 'mist', name: 'Sea Mist', luck: 4, note: 'good for ambush species' },
  { id: 'moonlit', name: 'Moonlit Tide', luck: 14, note: 'rare species surface' },
];
function weatherWindow(at = Date.now()): number { return Math.floor(at / (2 * 60 * 60 * 1000)); }
function currentWeather(at = Date.now()) {
  const w = weatherWindow(at);
  let h = 2166136261 ^ w;
  h = Math.imul(h ^ (h >>> 13), 16777619);
  return FISCH_WEATHERS[Math.abs(h) % FISCH_WEATHERS.length];
}

// ─ Sessions (in-memory, mirrors gambling.ts's blackjack pattern) ───────
type HarpoonDuel = {
  bet: number;
  opponent: string;      // the other player's id, if a real duel
  throws: number[];
  current: number[];     // The Current's visible throws
  hidden: number;        // The Current's unknown draws already taken
  doubled: boolean;
};
type GripSession = { pot: number; pulls: number; };

const duelSessions = new Map<string, HarpoonDuel>();
const gripSessions = new Map<string, GripSession>();

const FISCH_BET_MIN = 100;
const FISCH_BET_MAX = 250000;

// Returns a validated bet, or an error string.
function parseBet(p: FischPlayer, raw: string | undefined, min = FISCH_BET_MIN): number | string {
  const bet = Math.floor(Number(raw));
  if (!Number.isFinite(bet) || bet <= 0) return `Bet must be a number. Min ${min.toLocaleString()}g.`;
  if (bet < min) return `Minimum bet is ${min.toLocaleString()}g.`;
  if (bet > FISCH_BET_MAX) return `Maximum bet is ${FISCH_BET_MAX.toLocaleString()}g.`;
  if (p.gold < bet) return `Not enough gold. You have ${p.gold.toLocaleString()}g.`;
  return bet;
}

function pct(chance: number): string { return `${chance.toFixed(chance < 10 ? 1 : 0)}%`; }


// ── Bestiary ────────────────────────────────────────────────────────────
// Turns the decorative inventory into a collection screen: seen/unseen,
// caught counts, completion payoff beyond "did the gold go up".
export function formatBestiary(p: FischPlayer): string {
  const seen = FISH.filter(f => (p.inventory[`fish:${f.id}`]?.qty ?? 0) > 0);
  const completion = Math.round((seen.length / FISH.length) * 100);
  return [
    '📖 *BESTIARY*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Species logged  ${seen.length}/${FISH.length}  (${completion}%)`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISH.map(f => {
      const qty = p.inventory[`fish:${f.id}`]?.qty ?? 0;
      return qty
        ? `› ${f.emoji} ${f.name} — ${f.rarity} · x${qty}`
        : `  ??? — ${f.rarity} · uncaught`;
    }),
    '━━━━━━━━━━━━━━━━━━━━',
    'Mutations: .fisch mutations',
  ].join('\n');
}

export function formatMutations(): string {
  return [
    '🧬 *MUTATIONS*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Rolled on ${MUTATION_CHANCE}% of landed catches. Value multiplies on top of the species.`,
    ...MUTATIONS.map(m => `  ${m.name} — x${m.mult}`),
  ].join('\n');
}

// ── Sell to merchant ────────────────────────────────────────────────────
// Catch first, decide when to sell. Fish leave inventory, gold is credited,
// so inventory finally does something.
export function sellCatch(p: FischPlayer, arg: string): string {
  const keys = Object.keys(p.inventory).filter(k => k.startsWith('fish:') && p.inventory[k].qty > 0);
  if (!keys.length) return '🎒 No fish to sell. Cast with .fish first.';

  let total = 0;
  let sold = 0;
  const lines: string[] = [];
  const want = (arg || 'all').toLowerCase();

  for (const k of keys) {
    const item = p.inventory[k];
    const id = k.slice(5);
    if (want !== 'all' && want !== id && want !== item.name.toLowerCase() && !id.startsWith(want)) continue;
    const qty = item.qty;
    const payout = item.value * qty;
    total += payout;
    sold += qty;
    lines.push(`${item.name} x${qty} — ${payout.toLocaleString()}g`);
    delete p.inventory[k];
  }

  if (!sold) return `❌ Nothing matched "${arg}". Try .fisch sell all`;
  p.gold += total;
  addXp(p, Math.max(10, Math.floor(sold * 6)));
  save();
  return [
    '💰 *SOLD TO MERCHANT*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines.slice(0, 20),
    '━━━━━━━━━━━━━━━━━━━━',
    `${sold} fish · +${total.toLocaleString()}g`,
  ].join('\n');
}
// ── Bait ────────────────────────────────────────────────────────────────
export function formatBaits(p: FischPlayer): string {
  const cur = activeBait(p);
  return [
    '🪱 *BAIT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Equipped: ${cur.name}`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_BAITS.map(b => `${b.id === cur.id ? '›' : ' '} ${b.name} — ${b.cost === 0 ? 'free' : b.cost.toLocaleString() + 'g/cast'}\n   ${b.desc}`),
    '━━━━━━━━━━━━━━━━━━━━',
    '.fisch bait <name>',
  ].join('\n');
}

export function setBait(p: FischPlayer, raw: string): string {
  const bait = baitById((raw || '').trim().toLowerCase());
  if (!bait) return `❌ Unknown bait. Options: ${FISCH_BAITS.map(b => b.id).join(', ')}`;
  p.bait = bait.id;
  save();
  return `🪱 Bait equipped: *${bait.name}* — ${bait.desc}`;
}

// ── Weather ─────────────────────────────────────────────────────────────
export function formatWeather(): string {
  const w = currentWeather();
  const mins = Math.ceil((2 * 60 * 60 * 1000 - (Date.now() % (2 * 60 * 60 * 1000))) / 60000);
  return [
    '🌦 *SEA WEATHER*',
    '━━━━━━━━━━━━━━━━━━━━',
    w.name,
    w.luck === 0 ? 'Luck modifier  none' : `Luck modifier  ${w.luck > 0 ? '+' : ''}${w.luck}%`,
    w.note,
    '━━━━━━━━━━━━━━━━━━━━',
    `Shifts in ~${mins} min.`,
  ].join('\n');
}

// ── Near-miss log ───────────────────────────────────────────────────────
export function formatLosses(p: FischPlayer): string {
  const list = (p.escapes || []).slice(-10).reverse();
  if (!list.length) return '🪦 Nothing has slipped the line yet.';
  return [
    '🪦 *THE ONE THAT GOT AWAY*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...list.map(e => `  ${e.fish} — ${new Date(e.at).toLocaleString()}`),
    '━━━━━━━━━━━━━━━━━━━━',
    `${(p.escapes || []).length} escapes logged`,
  ].join('\n');
}

// ── Display name ────────────────────────────────────────────────────────
export function setFischName(p: FischPlayer, raw: string): string {
  const name = (raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 18) return 'Name must be 3-18 characters.';
  if (!/^[\w .-]+$/.test(name)) return 'Letters, numbers, spaces, dot, dash and underscore only.';
  p.displayName = name;
  save();
  return `👤 You're now *${name}* on the water.`;
}

function fischLabel(p: FischPlayer): string { return p.displayName || p.id; }

// ── Gift ────────────────────────────────────────────────────────────────
// One-way transfer of caught fish or treasure. Deliberately no accept
// handshake — a pending-trade window can deadlock between two players.
export function giftCatch(sender: FischPlayer, targetId: string, key: string, qtyRaw?: string): string {
  if (sender.id === targetId) return '❌ You cannot gift yourself.';
  const target = targetFromId(targetId);
  if (!target) return '❌ That sailor does not have a FISCH account.';
  const want = (key || '').trim().toLowerCase();
  if (!want) return 'Usage: .fisch gift <playerId> <fish> [qty]';
  const match = Object.keys(sender.inventory).find(k =>
    sender.inventory[k].qty > 0 &&
    (k === want || k === `fish:${want}` || k.endsWith(`:${want}`) || sender.inventory[k].name.toLowerCase().startsWith(want))
  );
  if (!match) return `❌ You don't hold "${key}". See .fisch inventory`;
  const held = sender.inventory[match];
  const qty = Math.max(1, Math.min(held.qty, Math.floor(Number(qtyRaw)) || 1));
  const worth = held.value * qty;
  target.inventory[match] ??= { name: held.name, emoji: held.emoji, rarity: held.rarity, qty: 0, value: held.value };
  target.inventory[match].qty += qty;
  held.qty -= qty;
  if (held.qty <= 0) delete sender.inventory[match];
  save();
  return [
    '🎁 *GIFT SENT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${held.emoji} ${held.name} x${qty}`,
    `Value ${worth.toLocaleString()}g`,
    `To ${fischLabel(target)}`,
    '━━━━━━━━━━━━━━━━━━━━',
    'One-way only — two-way trades are not supported yet.',
  ].join('\n');
}

// ── Tournament ──────────────────────────────────────────────────────────
// Rolling 6-hour window; heaviest single catch wins. Entry is automatic on
// your first cast of the window so there is no signup to forget.
const TOUR_MS = 6 * 60 * 60 * 1000;
export function tournamentWindowId(at = Date.now()): number { return Math.floor(at / TOUR_MS); }

export function recordTournamentCatch(p: FischPlayer, weight: number): boolean {
  const wid = tournamentWindowId();
  if (p.tourWindow !== wid) { p.tourWindow = wid; p.tourBest = 0; }
  if (weight > (p.tourBest || 0)) { p.tourBest = weight; return true; }
  return false;
}

export function formatTournament(p: FischPlayer): string {
  const wid = tournamentWindowId();
  const board = Object.values(data())
    .filter(x => x.tourWindow === wid && (x.tourBest || 0) > 0)
    .sort((a, b) => (b.tourBest || 0) - (a.tourBest || 0));
  const mins = Math.ceil((TOUR_MS - (Date.now() % TOUR_MS)) / 60000);
  return [
    '🏟 *HEAVYWEIGHT TOURNAMENT*',
    '━━━━━━━━━━━━━━━━━━━━',
    'Heaviest single catch takes it. Auto-entry on your first cast.',
    `Closes in ~${mins} min`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...(board.length
      ? board.slice(0, 10).map((x, i) => `${String(i + 1).padStart(2, ' ')}. ${(x.tourBest || 0).toFixed(1)} kg — ${fischLabel(x)}${x.id === p.id ? '  (you)' : ''}`)
      : ['Nobody has landed a fish this window yet.']),
    '━━━━━━━━━━━━━━━━━━━━',
    `Your best this window: ${(p.tourWindow === wid ? p.tourBest || 0 : 0).toFixed(1)} kg`,
  ].join('\n');
}
// ── Boss fight (shared HP pool) ─────────────────────────────────────────
// No live-synced multiplayer fight. A single world boss with a shared HP
// pool that anyone can chip at with .fisch attack; loot splits among
// contributors when it dies — same shared-pool idea as the Black Market.
type FischBoss = {
  name: string;
  hp: number;
  maxHp: number;
  reward: number;
  contributors: Record<string, number>;
};

let activeBoss: FischBoss | null = null;

const BOSS_NAMES = [
  'Leviathan of the Trench',
  'The Drowned King',
  'Storm-Devil Marlin',
  'Hollow Kraken',
];

export function formatBoss(): string {
  const b = activeBoss;
  if (!b || b.hp <= 0) return '🌊 No boss is surfaced right now. One rises on its own soon.';
  const pctHp = Math.round((b.hp / b.maxHp) * 100);
  const bars = Math.max(0, Math.min(10, Math.round(pctHp / 10)));
  return [
    '☠️ *WORLD BOSS*',
    '━━━━━━━━━━━━━━━━━━━━',
    b.name,
    `HP ${b.hp.toLocaleString()} / ${b.maxHp.toLocaleString()}  (${pctHp}%)`,
    '█'.repeat(bars) + '░'.repeat(10 - bars),
    '━━━━━━━━━━━━━━━━━━━━',
    `Loot pool ${b.reward.toLocaleString()}g — split by damage dealt`,
    '.fisch attack — chip in and earn a share',
  ].join('\n');
}

export function attackBoss(p: FischPlayer): string {
  const b = activeBoss;
  if (!b || b.hp <= 0) return '🌊 Nothing to attack. Check .fisch boss.';
  const cd = cooldownRemaining(p, 'boss', 45000);
  if (cd > 0) return `⏳ Repositioning. ${formatDuration(cd)}.`;
  mark(p, 'boss');
  const boat = boatById(p.boatId)!;
  const dmg = Math.floor(80 + p.combatLevel * 12 + p.magicLevel * 6 + boat.hull * 0.6 + Math.random() * 90);
  b.hp = Math.max(0, b.hp - dmg);
  b.contributors[p.id] = (b.contributors[p.id] || 0) + dmg;
  addXp(p, 25);

  if (b.hp > 0) {
    save();
    return [
      '☠️ *HIT*',
      '━━━━━━━━━━━━━━━━━━━━',
      `${b.name} takes ${dmg.toLocaleString()} damage`,
      `Remaining ${b.hp.toLocaleString()} / ${b.maxHp.toLocaleString()}`,
      `Your damage so far: ${b.contributors[p.id].toLocaleString()}`,
    ].join('\n');
  }

  // Boss died — split the pool by damage contribution.
  const totalDmg = Object.values(b.contributors).reduce((s, v) => s + v, 0) || 1;
  const all = data();
  const lines: string[] = [];
  for (const [pid, dmg] of Object.entries(b.contributors)) {
    const share = Math.floor((dmg / totalDmg) * b.reward);
    const winner = all[pid];
    if (!winner || share <= 0) continue;
    winner.gold += share;
    lines.push(`${fischLabel(winner)} — ${share.toLocaleString()}g (${dmg.toLocaleString()} dmg)`);
  }
  const bossName = b.name;
  const pool = b.reward;
  activeBoss = null;
  save();
  return [
    '☠️ *BOSS DOWN*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${bossName} is sunk.`,
    `Pool ${pool.toLocaleString()}g split by damage:`,
    ...lines.slice(0, 15),
    '━━━━━━━━━━━━━━━━━━━━',
    'A new boss surfaces shortly.',
  ].join('\n');
}

// Spawns a boss the first time anyone looks, and re-arms spawning after the
// previous one dies (activeBoss is nulled on death).
export function ensureBoss(): void {
  if (activeBoss) return;
  if (Math.random() < 0.35) {
    const name = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
    const maxHp = 4000 + Math.floor(Math.random() * 3000);
    activeBoss = { name, hp: maxHp, maxHp, reward: maxHp * 6, contributors: {} };
  }
}
// ════════════════════════════════════════════════════════════════════════
// HARPOON DUEL — blackjack skeleton in fishing clothes
// Throws map 1:1 onto cards (1-11). "Depth Score" targets 21 without
// busting ("the line snaps"). The Current is the anonymous rival.
// Rod luck nudges throw draws toward useful numbers; Twin Hook pays a flat
// bonus when the opening two throws match.
// ════════════════════════════════════════════════════════════════════════
const DUEL_TARGET = 21;

function drawThrow(p: FischPlayer): number {
  const rod = rodById(p.rodId) ?? FISCH_RODS[0];
  let v = 1 + Math.floor(Math.random() * 11);
  // Rod luck: on a dead draw, re-roll once toward the useful 7-11 band.
  if (rod.luck > 0 && v <= 3 && Math.random() * 100 < rod.luck * 1.5) {
    v = 7 + Math.floor(Math.random() * 5);
  }
  return v;
}

function duelScore(throws: number[]): number { return throws.reduce((s, v) => s + v, 0); }

function duelBoard(d: HarpoonDuel, p: FischPlayer): string {
  const score = duelScore(d.throws);
  return [
    '🎣 *HARPOON DUEL*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Your throws: ${d.throws.join(' · ')}   → Depth ${score}`,
    `The Current shows: ${d.current.join(' · ')}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `.throw  ·  .hold  ·  .double     (bet ${d.bet.toLocaleString()}g)`,
  ].join('\n');
}

export function duelStart(p: FischPlayer, betRaw: string | undefined, targetId?: string): string {
  if (duelSessions.has(p.id)) return '⚠️ You already have a duel running. .throw or .hold';
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;

  let opponent = 'current';
  if (targetId) {
    const t = targetFromId(targetId);
    if (!t) return '❌ That sailor does not have a FISCH account.';
    if (t.id === p.id) return '❌ You cannot duel yourself.';
    if (t.gold < bet) return `❌ ${fischLabel(t)} cannot cover that bet.`;
    opponent = t.id;
  }

  p.gold -= bet;
  if (opponent !== 'current') targetFromId(opponent)!.gold -= bet;

  const session: HarpoonDuel = { bet, opponent, throws: [drawThrow(p), drawThrow(p)], current: [], hidden: 0, doubled: false };
  duelSessions.set(p.id, session);

  const first = session.throws[0] + session.throws[1];
  const twin = session.throws[0] === session.throws[1];
  const lines = [duelBoard(session, p)];
  if (first === DUEL_TARGET) lines.push('💥 *PERFECT STRIKE* — 21 on the opening throws.');
  if (twin) lines.push(`🔗 *TWIN HOOK* — both throws ${session.throws[0]}. Flat bonus if you finish clean.`);
  save();
  return lines.join('\n');
}

function duelResolve(p: FischPlayer, d: HarpoonDuel, _stood: boolean): string {
  const mine = duelScore(d.throws);

  // The Current mirrors blackjack's dealer: draws to 17, stands after.
  const current: number[] = [...d.current];
  let hidden = d.hidden;
  while (duelScore(current) + hidden < 17) {
    const v = drawThrow(p);
    if (duelScore(current) + hidden + v > DUEL_TARGET) { hidden += v; break; }
    hidden += v;
    current.push(v);
  }
  const pvp = d.opponent !== 'current';
  const oppTotal = pvp ? 15 + Math.floor(Math.random() * 7) : duelScore(current) + hidden;

  const twin = d.throws[0] === d.throws[1];
  const natural = d.throws.length === 2 && mine === DUEL_TARGET;
  const myBust = mine > DUEL_TARGET;
  const theirBust = oppTotal > DUEL_TARGET;

  let payout = 0;
  let outcome: string;
  if (myBust) outcome = 'line snapped — you went over';
  else if (natural) { payout = d.bet * 3; outcome = 'PERFECT STRIKE pays 2:1'; }
  else if (theirBust || mine > oppTotal) { payout = d.bet * 2; outcome = 'you take the pot'; }
  else if (mine === oppTotal) { payout = d.bet; outcome = 'dead heat — bet returned'; }
  else outcome = 'the Current outlasts you';

  if (twin && !myBust) payout += Math.floor(d.bet * 0.15);

  if (pvp) {
    const opp = targetFromId(d.opponent)!;
    // Opponent staked the same amount up front; settle the two stakes.
    if (payout > 0) opp.gold += d.bet;
    else opp.gold += d.bet * 2;
  }
  if (payout > 0) p.gold += payout;

  if (payout > d.bet) p.wins += 1; else p.losses += 1;
  addXp(p, 30);
  duelSessions.delete(p.id);
  save();

  return [
    '🎣 *HARPOON DUEL — RESULT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `You: ${d.throws.join(' · ')}  → ${mine}${myBust ? '  BUST' : ''}`,
    `${pvp ? fischLabel(targetFromId(d.opponent)!) : 'The Current'}: ${oppTotal}${theirBust ? '  BUST' : ''}`,
    '━━━━━━━━━━━━━━━━━━━━',
    outcome,
    payout > 0 ? `Payout ${payout.toLocaleString()}g` : `Lost ${d.bet.toLocaleString()}g`,
    twin ? '🔗 Twin Hook bonus applied' : '',
  ].filter(Boolean).join('\n');
}

export function duelThrow(p: FischPlayer): string {
  const d = duelSessions.get(p.id);
  if (!d) return '🎣 No duel running. Start one: .duel <bet>';
  d.throws.push(drawThrow(p));
  if (duelScore(d.throws) > DUEL_TARGET) return duelResolve(p, d, false);
  save();
  return duelBoard(d, p);
}

export function duelHold(p: FischPlayer): string {
  const d = duelSessions.get(p.id);
  if (!d) return '🎣 No duel running. Start one: .duel <bet>';
  return duelResolve(p, d, true);
}

export function duelDouble(p: FischPlayer): string {
  const d = duelSessions.get(p.id);
  if (!d) return '🎣 No duel running. Start one: .duel <bet>';
  if (d.doubled || d.throws.length !== 2) return '❌ Double is only available on your opening throws.';
  if (p.gold < d.bet) return `❌ Need ${d.bet.toLocaleString()}g to double.`;
  p.gold -= d.bet;
  d.bet *= 2;
  d.doubled = true;
  d.throws.push(drawThrow(p));
  if (duelScore(d.throws) > DUEL_TARGET) return duelResolve(p, d, false);
  return duelBoard(d, p);
}

// ════════════════════════════════════════════════════════════════════════
// KRAKEN'S GRIP — press-your-luck pot. Each .kraken pull raises the pot and
// the snap chance; cash out before the tentacle closes.
// ════════════════════════════════════════════════════════════════════════
export function krakenPull(p: FischPlayer, betRaw?: string): string {
  const existing = gripSessions.get(p.id);
  if (!existing) {
    const bet = parseBet(p, betRaw, 500);
    if (typeof bet === 'string') return `❌ ${bet}`;
    p.gold -= bet;
    gripSessions.set(p.id, { pot: bet, pulls: 0 });
    save();
    return [
      '🐙 *KRAKEN\'S GRIP*',
      '━━━━━━━━━━━━━━━━━━━━',
      `Stake ${bet.toLocaleString()}g in the pot`,
      'Snap chance  1 in 6',
      '━━━━━━━━━━━━━━━━━━━━',
      '.kraken pull — raise the pot  ·  .kraken cashout — take it',
    ].join('\n');
  }

  existing.pulls += 1;
  const snapChance = Math.min(80, 12 + existing.pulls * 9);
  if (Math.random() * 100 < snapChance) {
    const lost = existing.pot;
    gripSessions.delete(p.id);
    save();
    return [
      '🐙 *THE GRIP CLOSES*',
      '━━━━━━━━━━━━━━━━━━━━',
      `The tentacle snaps shut on pull ${existing.pulls}.`,
      `Lost ${lost.toLocaleString()}g`,
    ].join('\n');
  }

  existing.pot = Math.floor(existing.pot * 1.7);
  save();
  return [
    '🐙 *KRAKEN\'S GRIP*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Pot ${existing.pot.toLocaleString()}g`,
    `Pulls survived ${existing.pulls}`,
    `Snap chance now ${snapChance}%`,
    '━━━━━━━━━━━━━━━━━━━━',
    '.kraken pull  ·  .kraken cashout',
  ].join('\n');
}

export function krakenCashout(p: FischPlayer): string {
  const s = gripSessions.get(p.id);
  if (!s) return '🐙 Nothing in the grip. Start with .kraken 1000';
  p.gold += s.pot;
  const pot = s.pot;
  const pulls = s.pulls;
  gripSessions.delete(p.id);
  addXp(p, 20 + pulls * 10);
  save();
  return [
    '🐙 *CASHED OUT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Took ${pot.toLocaleString()}g after ${pulls} pull${pulls === 1 ? '' : 's'}`,
    '━━━━━━━━━━━━━━━━━━━━',
    'Greed is a tax. You dodged it this time.',
  ].join('\n');
}
// ════════════════════════════════════════════════════════════════════════
// MINIGAMES — gold-earning side games. Most are reskins of mechanics the
// codebase already has (dice/coinflip/slots/pick-a-door/high-low), so the
// variety is cheap in engineering terms but adds real choice for players.
// ════════════════════════════════════════════════════════════════════════

function payout(p: FischPlayer, bet: number, mult: number): number {
  const won = Math.floor(bet * mult);
  p.gold += won;
  return won;
}

// Roll a 1-6 school size against a guessed number.
export function mgNetCast(p: FischPlayer, betRaw: string | undefined, pickRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const pick = Math.floor(Number(pickRaw));
  if (!(pick >= 1 && pick <= 6)) return 'Usage: .netcast <bet> <1-6>';
  p.gold -= bet;
  const roll = 1 + Math.floor(Math.random() * 6);
  const hit = roll === pick;
  const win = hit ? payout(p, bet, 5) : 0;
  addXp(p, 10);
  save();
  return [
    '🕸 *NET CAST*',
    '━━━━━━━━━━━━━━━━━━━━',
    `School size: ${roll}   (you called ${pick})`,
    hit ? `Hit — +${win.toLocaleString()}g` : `Miss — -${bet.toLocaleString()}g`,
  ].join('\n');
}

// Coinflip: tide direction.
export function mgRiptide(p: FischPlayer, betRaw: string | undefined, sideRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const side = (sideRaw || '').toLowerCase();
  if (side !== 'in' && side !== 'out') return 'Usage: .riptide <bet> in|out';
  p.gold -= bet;
  const flip = Math.random() < 0.5 ? 'in' : 'out';
  const hit = flip === side;
  const win = hit ? payout(p, bet, 1.95) : 0;
  addXp(p, 8);
  save();
  return [
    '🌊 *RIPTIDE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Tide went ${flip}   (you called ${side})`,
    hit ? `+${win.toLocaleString()}g` : `-${bet.toLocaleString()}g`,
  ].join('\n');
}

// Slots reskin: three reels of sea icons.
export function mgShantyReels(p: FischPlayer, betRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  p.gold -= bet;
  const icons = ['🐟', '⛵', '🐙', '💎', '🦈'];
  const reels = [0, 1, 2].map(() => icons[Math.floor(Math.random() * icons.length)]);
  const [a, b, c] = reels;
  let mult = 0;
  if (a === b && b === c) mult = c === '💎' ? 25 : 8;
  else if (a === b || b === c || a === c) mult = 1.6;
  const win = mult > 0 ? payout(p, bet, mult) : 0;
  addXp(p, 12);
  save();
  return [
    '🎰 *SEA SHANTY REELS*',
    '━━━━━━━━━━━━━━━━━━━━',
    `${a} ${b} ${c}`,
    mult > 0 ? `${mult}x — +${win.toLocaleString()}g` : `No line — -${bet.toLocaleString()}g`,
  ].join('\n');
}

// Bet on one of four crabs; published odds, weighted payout.
export function mgCrabRace(p: FischPlayer, betRaw: string | undefined, pickRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const crabs = ['Snapper', 'Drifter', 'Rusty', 'Big Claw'];
  const mults: Record<number, number> = { 1: 2.2, 2: 3, 3: 4.5, 4: 9 };
  const pick = Math.floor(Number(pickRaw));
  if (!(pick >= 1 && pick <= 4)) return 'Usage: .crabrace <bet> <1-4>\n1 Snapper 40% · 2 Drifter 30% · 3 Rusty 20% · 4 Big Claw 10%';
  p.gold -= bet;
  const r = Math.random() * 100;
  const winner = r < 40 ? 1 : r < 70 ? 2 : r < 90 ? 3 : 4;
  const hit = winner === pick;
  const win = hit ? payout(p, bet, mults[pick]) : 0;
  addXp(p, 12);
  save();
  return [
    '🦀 *CRAB RACE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Winner: ${crabs[winner - 1]}`,
    hit ? `+${win.toLocaleString()}g` : `-${bet.toLocaleString()}g`,
  ].join('\n');
}

// High-low on a shown weight line.
export function mgAnchorToss(p: FischPlayer, betRaw: string | undefined, sideRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const side = (sideRaw || '').toLowerCase();
  if (side !== 'over' && side !== 'under') return 'Usage: .anchortoss <bet> over|under';
  p.gold -= bet;
  const line = 20 + Math.floor(Math.random() * 60);
  const actual = Math.max(1, Math.round(line + (Math.random() - 0.5) * 40));
  const hit = (side === 'over') === (actual > line);
  const win = hit ? payout(p, bet, 1.9) : 0;
  addXp(p, 10);
  save();
  return [
    '⚓ *ANCHOR TOSS*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Line ${line} kg · landed ${actual} kg`,
    hit ? `+${win.toLocaleString()}g` : `-${bet.toLocaleString()}g`,
  ].join('\n');

// Pick 1 of 5 shells: one pearl pays, one crab costs double, three are empty.
export function mgPearlDive(p: FischPlayer, betRaw: string | undefined, pickRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const pick = Math.floor(Number(pickRaw));
  if (!(pick >= 1 && pick <= 5)) return 'Usage: .pearldive <bet> <1-5>';
  p.gold -= bet;
  const pearl = 1 + Math.floor(Math.random() * 5);
  const crab = (pearl % 5) + 1;
  let mult = 0;
  let result: string;
  if (pick === pearl) { mult = 4; result = 'Pearl — the shell pays'; }
  else if (pick === crab) { mult = -1; result = 'A crab — it takes double'; }
  else { result = 'Empty shell'; }
  const win = mult > 0 ? payout(p, bet, mult) : 0;
  if (mult < 0) p.gold -= bet;
  addXp(p, 10);
  save();
  return [
    '🐚 *PEARL DIVE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Shells 1-5 · the pearl was under ${pearl}`,
    result,
    win > 0 ? `+${win.toLocaleString()}g` : mult < 0 ? `-${(bet * 2).toLocaleString()}g` : `-${bet.toLocaleString()}g`,
  ].join('\n');
}

// Pick 1 of 4 chests: mostly multipliers, one mimic eats double.
export function mgTreasureChest(p: FischPlayer, betRaw: string | undefined, pickRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const pick = Math.floor(Number(pickRaw));
  if (!(pick >= 1 && pick <= 4)) return 'Usage: .chest <bet> <1-4>';
  p.gold -= bet;
  const mimic = 1 + Math.floor(Math.random() * 4);
  let mult = 0;
  let result: string;
  if (pick === mimic) { mult = -1; result = 'A mimic — it takes double'; }
  else { mult = [1.5, 2, 3][Math.floor(Math.random() * 3)]; result = `Chest pays ${mult}x`; }
  const win = mult > 0 ? payout(p, bet, mult) : 0;
  if (mult < 0) p.gold -= bet;
  addXp(p, 10);
  save();
  return [
    '🎁 *TREASURE CHEST*',
    '━━━━━━━━━━━━━━━━━━━━',
    `You opened #${pick} · the mimic was #${mimic}`,
    result,
    win > 0 ? `+${win.toLocaleString()}g` : mult < 0 ? `-${(bet * 2).toLocaleString()}g` : 'No gain',
  ].join('\n');
}

// Pick a dive depth 1-10; the charge detonates at a hidden depth.
export function mgDepthCharge(p: FischPlayer, betRaw: string | undefined, depthRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const depth = Math.floor(Number(depthRaw));
  if (!(depth >= 1 && depth <= 10)) return 'Usage: .depthcharge <bet> <depth 1-10>\nDeeper survives more often but the charge sits higher.';
  p.gold -= bet;
  const boom = 1 + Math.floor(Math.random() * 10);
  const survived = depth < boom;
  const mult = survived ? 1 + depth * 0.55 : 0;
  const win = survived ? payout(p, bet, mult) : 0;
  addXp(p, 10);
  save();
  return [
    '💣 *DEPTH CHARGE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Charge detonated at depth ${boom} · you dove to ${depth}`,
    survived ? `Survived — ${mult.toFixed(2)}x · +${win.toLocaleString()}g` : `Blown apart — -${bet.toLocaleString()}g`,
  ].join('\n');
}

// Narrower number range pays more if the roll lands inside it.
export function mgSquidInk(p: FischPlayer, betRaw: string | undefined, widthRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const width = Math.floor(Number(widthRaw));
  const widths: Record<number, number> = { 5: 20, 10: 10, 20: 5, 50: 2 };
  if (!widths[width]) return 'Usage: .squidink <bet> <5|10|20|50>\nNarrower pays more: 5→20x · 10→10x · 20→5x · 50→2x';
  p.gold -= bet;
  const roll = 1 + Math.floor(Math.random() * 100);
  const start = 1 + Math.floor(Math.random() * (100 - width + 1));
  const end = start + width - 1;
  const hit = roll >= start && roll <= end;
  const win = hit ? payout(p, bet, widths[width]) : 0;
  addXp(p, 10);
  save();
  return [
    '🦑 *SQUID INK*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Ink settled on ${roll} · your window ${start}-${end}`,
    hit ? `${widths[width]}x — +${win.toLocaleString()}g` : `Missed — -${bet.toLocaleString()}g`,
  ].join('\n');
}
// High roll takes the pot: you vs The House, or another player by id.
export function mgDiceDuel(p: FischPlayer, betRaw: string | undefined, targetId?: string): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  const roll = () => (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6));
  const mine = roll();
  let theirs = roll();
  let label = 'The House';
  let pvp = false;

  if (targetId) {
    const t = targetFromId(targetId);
    if (t && t.id !== p.id) {
      if (t.gold < bet) return `❌ ${fischLabel(t)} cannot cover that bet.`;
      pvp = true;
      label = fischLabel(t);
      t.gold -= bet;
      theirs = roll();
    }
  }

  p.gold -= bet;
  const hit = mine > theirs;
  const tie = mine === theirs;

  if (pvp) {
    const opp = targetFromId(targetId!)!;
    if (tie) { opp.gold += bet; p.gold += bet; }
    else if (hit) p.gold += bet * 2;
    else opp.gold += bet * 2;
  } else if (hit) {
    p.gold += bet * 2;
  } else if (tie) {
    p.gold += bet;
  }

  if (hit && !tie) p.wins += 1; else p.losses += 1;
  addXp(p, 12);
  save();
  return [
    "🎲 *FISHERMAN'S DICE DUEL*",
    '━━━━━━━━━━━━━━━━━━━━',
    `You rolled ${mine}  ·  ${label} rolled ${theirs}`,
    tie ? 'Dead heat — stake returned' : hit ? `You take it — +${(bet * 2).toLocaleString()}g` : `You lose — -${bet.toLocaleString()}g`,
  ].join('\n');
}

// Single spin, multiplier and bust segments.
export function mgFryFortune(p: FischPlayer, betRaw: string | undefined): string {
  const bet = parseBet(p, betRaw);
  if (typeof bet === 'string') return `❌ ${bet}`;
  p.gold -= bet;
  const wheel = [
    { label: 'bust', mult: 0 }, { label: 'bust', mult: 0 }, { label: 'bust', mult: 0 },
    { label: '1.5x', mult: 1.5 }, { label: '1.5x', mult: 1.5 },
    { label: '2x', mult: 2 }, { label: '3x', mult: 3 }, { label: '5x', mult: 5 }, { label: '10x', mult: 10 },
  ];
  const seg = wheel[Math.floor(Math.random() * wheel.length)];
  const win = seg.mult > 0 ? payout(p, bet, seg.mult) : 0;
  addXp(p, 12);
  save();
  return [
    '🎡 *FISH FRY FORTUNE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Wheel landed on ${seg.label}`,
    win > 0 ? `+${win.toLocaleString()}g` : `-${bet.toLocaleString()}g`,
    'bust ×3 · 1.5x ×2 · 2x · 3x · 5x · 10x',
  ].join('\n');
}
}