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
const REEL_MAX_PULLS = 9;
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
    cells.push(inZone ? '🟩' : '⬜');
  }
  const markerRow = Array(REEL_WIDTH).fill('　');
  markerRow[session.fishPos] = fish.emoji;
  const filled = Math.round((session.progress / 100) * 10);
  const meter = '▓'.repeat(filled) + '░'.repeat(10 - filled);
  return [
    `🎣 *${fish.name}* is pulling hard!`,
    '',
    cells.join(''),
    markerRow.join(''),
    `${meter} ${session.progress}%`,
    `Line: ${session.pullsLeft} pull${session.pullsLeft === 1 ? '' : 's'} left`,
    '',
    '🪝 .pull',
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
function boatById(id: string): FischBoat | undefined { return FISCH_BOATS.find(b => b.id === id); }
function rodById(id: string): FischRod | undefined { return FISCH_RODS.find(r => r.id === id); }
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
    '🎣 *FISCH — OCEAN TERMINAL*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🏅 Lv.${p.level}  🎣${p.fishingLevel} ⚓${p.sailingLevel} ⚔️${p.combatLevel} ✨${p.magicLevel}`,
    `💰 ${p.gold.toLocaleString()} gold   ❤️ ${p.hp}/${p.maxHp}   💙 ${p.mana}/${p.maxMana}`,
    `📍 ${zone.emoji} ${zone.name}`,
    `🚢 ${boat.emoji} ${boat.name}   🎣 ${rod.emoji} ${rod.name}`,
    p.streak >= 2 ? `🔥 Fishing streak: ${p.streak} — keep it alive!` : '',
    nextSpell ? `✨ Next spell: ${nextSpell.name} at Magic Lv.${nextSpell.tier * 10} (you're ${p.magicLevel})` : '',
    reelSessions.has(p.id) ? '🎣 *Something is on your line!* Use .pull' : '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🎣 .fish cast',
    '🪝 .pull — fight a hooked catch',
    '🗺️ .sea map',
    '⛵ .sail <zone>',
    '🚢 .boat list | .boat buy <id> | .boat info',
    '🎣 .rod list | .rod buy <id> | .rod info',
    '✨ .fisch spell [list|cast <spell>]',
    '💎 .sea treasure',
    '⚔️ .sea battle <playerId>',
    '🏴‍☠️ .sea rob <playerId>',
    '🏝️ .sea territory [claim|attack|map]',
    '🎒 .fisch inventory',
    '📊 .fisch stats',
    '🏆 .fisch leaderboard',
    '━━━━━━━━━━━━━━━━━━━━',
    '🌊 *Catch. Sail. Fight. Conquer.*',
  ].filter(Boolean).join('\n');
}

export function formatFischHelp(): string {
  return [
    '🎣 *FISCH COMMANDS*',
    '━━━━━━━━━━━━━━━━━━━━',
    '.fisch — main terminal',
    '.fish cast — fish in current zone',
    '.pull — fight a hooked catch (reel it in before the line snaps)',
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
    '⚠️ Sea PvP has capped, recoverable losses.',
  ].join('\n');
}

function pickFish(zone: FischZone, p: FischPlayer): FischFish {
  const candidates = FISH.filter(f => f.zones.includes(zone.id));
  // Guard against a future zone with no matching FISH entries (would
  // otherwise crash fishCast on `pool[NaN]`).
  if (!candidates.length) return FISH[0];

  const rod = rodById(p.rodId) ?? FISCH_RODS[0];
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
  const weighted = pool.map(f => ({ f, w: RARITY_WEIGHT[f.rarity] * (1 + rod.luck / 100) }));
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
  mark(p, 'fish');

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
  const roll = Math.random() * 100 + p.fishingLevel * 0.25 + boat.fishing * 0.5;
  if (roll < difficulty * 0.5) {
    p.streak = 0;
    addXp(p, 12);
    addSkillXp(p, 'fishing', 20);
    save();
    return `🌊 The water goes cold...\n🎣 Nothing bites.\n📈 +12 XP · +20 Fishing XP${dailyBonusLine}`;
  }

  const fish = pickFish(zone, p);
  const weight = Number((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)).toFixed(1));

  const fight = fightIntensity(fish, zone);
  const zoneWidth = Math.max(3, Math.round(8 - fight * 5));
  const zoneStart = Math.floor((REEL_WIDTH - zoneWidth) / 2);
  const driftBase = 1 + Math.round(fight * 4);
  const drift = Math.max(1, driftBase - Math.floor(rod.power / 4));
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

  return `🎣 *You've got a bite!*${dailyBonusLine}\n\n${renderReelBar(session, fish)}`;
}

function resolveFischCatch(p: FischPlayer, session: FischReelSession): string {
  const fish = FISH.find(f => f.id === session.fishId)!;
  const zone = zoneById(session.zoneId) ?? zoneById(p.currentZone)!;
  const weight = session.weight;
  p.streak += 1;
  const streakMult = 1 + Math.min(p.streak, 20) * 0.02; // caps at +40% around a 20-streak
  const perfect = !session.missed;
  const perfectMult = perfect ? 1.2 : 1;
  const value = Math.max(1, Math.floor(fish.baseValue * (weight / Math.max(1, fish.minWeight + fish.maxWeight) * 2) * zone.fishMultiplier * (RARITY_MULTIPLIER[fish.rarity] / 1.5) * streakMult * perfectMult));
  const inventoryKey = `fish:${fish.id}`;
  p.inventory[inventoryKey] ??= { name: fish.name, emoji: fish.emoji, rarity: fish.rarity, qty: 0, value };
  p.inventory[inventoryKey].qty += 1;
  p.gold += value;
  p.totalFish += 1;
  const isRecord = weight > p.biggestCatchKg;
  p.biggestCatchKg = Math.max(p.biggestCatchKg, weight);
  p.seaReputation += fish.rarity === 'Ancient' ? 8 : fish.rarity === 'Mythic' ? 5 : fish.rarity === 'Legendary' ? 3 : 1;
  const xp = Math.max(20, Math.floor(40 * RARITY_MULTIPLIER[fish.rarity] * perfectMult));
  addXp(p, xp);
  addSkillXp(p, 'fishing', xp);
  reelSessions.delete(p.id);
  save();

  const bigCatch = fish.rarity === 'Epic' || fish.rarity === 'Legendary' || fish.rarity === 'Mythic' || fish.rarity === 'Ancient';
  const flourish = bigCatch ? `\n🎉🎉🎉 *${fish.rarity.toUpperCase()} CATCH!!!* 🎉🎉🎉` : '';
  const luckyLine = session.isLucky ? `\n🍀 *A lucky bite you shouldn't have hooked yet!*` : '';
  const perfectLine = perfect ? `\n✨ *PERFECT REEL!* Not a single miss — bonus gold & XP.` : '';
  const recordLine = isRecord ? `\n🏆 *NEW PERSONAL BEST WEIGHT!*` : '';
  const streakLine = p.streak >= 3 ? `\n🔥 Streak: ${p.streak} (+${Math.min(p.streak, 20) * 2}% value) · don't break it!` : '';

  return [
    '╔════════════════════════════╗',
    '║      🎣 CATCH REPORT       ║',
    '╠════════════════════════════╣',
    `║ ${fish.emoji} ${fish.name}`,
    `║ ⭐ ${fish.rarity}`,
    `║ ⚖️ ${weight} kg`,
    `║ 💰 +${value.toLocaleString()} gold`,
    `║ 📈 +${xp} XP`,
    `║ 🎣 Fishing XP +${xp}`,
    '║ 🌊 The sea remembers you.',
    '╚════════════════════════════╝',
  ].join('\n') + flourish + perfectLine + luckyLine + recordLine + streakLine;
}

function resolveFischEscape(p: FischPlayer, session: FischReelSession): string {
  const fish = FISH.find(f => f.id === session.fishId)!;
  p.streak = 0;
  addXp(p, 15);
  addSkillXp(p, 'fishing', 15);
  reelSessions.delete(p.id);
  save();
  return `🎣💔 *The line snaps — it's gone.*\n${fish.emoji} The ${fish.name} slips back into the water.\n📈 +15 XP · +15 Fishing XP (consolation)`;
}

export function fishPull(p: FischPlayer): string {
  const session = reelSessions.get(p.id);
  if (!session) return "❌ Nothing's on your line. Cast with .fish first.";
  const fish = FISH.find(f => f.id === session.fishId)!;

  session.pullsLeft -= 1;
  const step = Math.floor(Math.random() * (session.drift * 2 + 1)) - session.drift;
  session.fishPos = Math.max(0, Math.min(REEL_WIDTH - 1, session.fishPos + step));
  const inZone = session.fishPos >= session.zoneStart && session.fishPos < session.zoneStart + session.zoneWidth;

  if (inZone) {
    session.progress = Math.min(100, session.progress + 14 + Math.floor(Math.random() * 9));
  } else {
    session.missed = true;
    session.progress = Math.max(0, session.progress - (6 + Math.floor(Math.random() * 9)));
  }

  if (session.progress >= 100) {
    return resolveFischCatch(p, session);
  }
  if (session.pullsLeft <= 0) {
    return resolveFischEscape(p, session);
  }
  return `${inZone ? '🎯 Solid pull!' : '💦 It slipped away from you.'}\n\n${renderReelBar(session, fish)}`;
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
  return `⛵ *ARRIVAL*\n${zone.emoji} ${zone.name}\n🌊 Danger: ${zone.danger}\n🎣 Fish multiplier: x${zone.fishMultiplier}\n💎 Treasure multiplier: x${zone.treasureMultiplier}\n📈 Sailing XP gained.\n${p.hp < p.maxHp ? `❤️ Hull crew stabilized you at ${p.hp} HP.` : '🛟 Ship is steady.'}`;
}

export function formatBoatList(p: FischPlayer): string {
  return [
    '🚢 *SHIPYARD*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_BOATS.map(b => `${b.id === p.boatId ? '✅' : '▫️'} ${b.emoji} *${b.name}* — ${b.price === 0 ? 'STARTER' : b.price.toLocaleString() + 'g'} | ⚡${b.speed} 🛡️${b.hull} 🎣${b.fishing} 📦${b.cargo}`),
    '━━━━━━━━━━━━━━━━━━━━',
    '.boat buy <id>',
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
  return `🚢 *NEW VESSEL ACQUIRED*\n${boat.emoji} ${boat.name}\n💰 -${boat.price.toLocaleString()}g\n⚡ Speed ${boat.speed}\n🛡️ Hull ${boat.hull}\n🎣 Fishing +${boat.fishing}\n📦 Cargo ${boat.cargo}`;
}

export function formatBoatInfo(p: FischPlayer): string {
  const b = boatById(p.boatId)!;
  return [
    `🚢 *${b.emoji} ${b.name.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `⚡ Speed       ${b.speed}`,
    `🛡️ Hull       ${b.hull}`,
    `🎣 Fishing    ${b.fishing}`,
    `📦 Cargo      ${b.cargo}`,
    `✨ Magic      ${b.magic}`,
    `👻 Conceal.   ${b.concealment}`,
    `📍 Zone       ${zoneById(p.currentZone)?.name}`,
  ].join('\n');
}

export function formatRodList(p: FischPlayer): string {
  return [
    '🎣 *ROD SHOP*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...FISCH_RODS.map(r => `${r.id === p.rodId ? '✅' : '▫️'} ${r.emoji} *${r.name}* — ${r.price === 0 ? 'STARTER' : r.price.toLocaleString() + 'g'} | ⏱️-${(r.power * 0.8).toFixed(1)}s cast · 🍀+${r.luck}% rare odds`),
    '━━━━━━━━━━━━━━━━━━━━',
    '.rod buy <id>',
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
  return `🎣 *NEW ROD EQUIPPED*\n${rod.emoji} ${rod.name}\n💰 -${rod.price.toLocaleString()}g\n⏱️ Faster casts, 🍀 better odds on rare fish.`;
}

export function formatRodInfo(p: FischPlayer): string {
  const r = rodById(p.rodId) ?? FISCH_RODS[0];
  return [
    `🎣 *${r.emoji} ${r.name.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `⏱️ Cast cooldown  ${Math.max(6, 20 - r.power * 0.8).toFixed(1)}s`,
    `🍀 Rare-fish luck  +${r.luck}%`,
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
    ...FISCH_SPELLS.map(s => `${p.spellsUnlocked.includes(s.id) ? '✅' : '🔒'} ${s.emoji} ${s.name} · Tier ${s.tier} · ${s.mana} mana`),
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
    ...items.slice(0, 30).map(x => `${x.emoji} ${x.name} ×${x.qty} · ${x.rarity} · ${x.value.toLocaleString()}g each`),
    '━━━━━━━━━━━━━━━━━━━━',
    `📦 Slots: ${items.length}/30`,
  ].join('\n');
}

export function formatFischStats(p: FischPlayer): string {
  const b = boatById(p.boatId)!;
  const r = rodById(p.rodId) ?? FISCH_RODS[0];
  return [
    '🌊 *FISCH CHARACTER SHEET*',
    '━━━━━━━━━━━━━━━━━━━━',
    `👤 ${p.id}`,
    `🏅 Level       ${p.level} (${p.xp}/${xpForNext(p.level)} XP)`,
    `🎣 Fishing     ${p.fishingLevel}`,
    `⚓ Sailing     ${p.sailingLevel}`,
    `⚔️ Combat      ${p.combatLevel}`,
    `✨ Magic       ${p.magicLevel} (${p.spellsUnlocked.length}/${FISCH_SPELLS.length} spells)`,
    `⭐ Reputation  ${Math.floor(p.seaReputation)}`,
    `💰 Gold        ${p.gold.toLocaleString()}`,
    `❤️ HP          ${p.hp}/${p.maxHp}`,
    `💙 Mana        ${p.mana}/${p.maxMana}`,
    `🚢 Vessel      ${b.name}`,
    `🎣 Rod         ${r.name}`,
    `🔥 Streak      ${p.streak}`,
    `🐟 Fish        ${p.totalFish}`,
    `🐋 Biggest     ${p.biggestCatchKg.toFixed(1)} kg`,
    `💎 Treasure    ${p.totalTreasure.toLocaleString()}g`,
    `🏴‍☠️ Robbed     ${p.totalRobbery.toLocaleString()}g`,
    `⚔️ W/L         ${p.wins}/${p.losses}`,
    `🏝️ Territory   ${p.ownedTerritories.length}`,
  ].join('\n');
}

export function formatFischLeaderboard(): string {
  const rows = Object.values(data()).sort((a, b) => {
    const pa = b.level * 1000 + b.seaReputation * 10 + b.totalTreasure * 0.001;
    const pb = a.level * 1000 + a.seaReputation * 10 + a.totalTreasure * 0.001;
    return pa - pb;
  });
  return [
    '🏆 *FISCH OCEAN LEADERBOARD*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...rows.slice(0, 10).map((p, i) => `${i + 1}. ${p.id} · Lv.${p.level} · ⭐${Math.floor(p.seaReputation)} · 🏝️${p.ownedTerritories.length}`),
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
