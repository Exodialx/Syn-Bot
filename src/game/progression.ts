import { grantMoney } from './economy.js';
import type { Player } from './player.js';

export const GENERAL_LEVEL_CAP = 30;
export const CLASS_LEVEL_CAP = 10;

export const GENERAL_XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 100,
  3: 250,
  4: 450,
  5: 700,
  6: 1000,
  7: 1350,
  8: 1750,
  9: 2200,
  10: 2700,
  11: 3300,
  12: 4000,
  13: 4800,
  14: 5700,
  15: 6700,
  16: 7800,
  17: 9000,
  18: 10300,
  19: 11700,
  20: 13200,
  21: 14800,
  22: 16500,
  23: 18300,
  24: 20200,
  25: 22200,
  26: 24300,
  27: 26500,
  28: 28800,
  29: 31200,
  30: 33700
};

export const CLASS_XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 100,
  3: 250,
  4: 450,
  5: 700,
  6: 1000,
  7: 1350,
  8: 1750,
  9: 2200,
  10: 2700
};

export const GENERAL_LEVEL_REWARDS: Record<number, number> = {
  2: 5000,
  3: 7500,
  4: 10000,
  5: 15000,
  6: 20000,
  7: 25000,
  8: 30000,
  9: 35000,
  10: 50000,
  11: 60000,
  12: 70000,
  13: 80000,
  14: 90000,
  15: 125000,
  16: 150000,
  17: 175000,
  18: 200000,
  19: 225000,
  20: 300000,
  21: 350000,
  22: 400000,
  23: 450000,
  24: 500000,
  25: 600000,
  26: 700000,
  27: 800000,
  28: 900000,
  29: 1000000,
  30: 2000000
};

export const HITMAN_PRESTIGE_TABLE: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 6,
  5: 10,
  6: 15,
  7: 21,
  8: 28,
  9: 36,
  10: 46
};

export const VALID_XP_SOURCES = new Set([
  'JOB',
  'QUEST',
  'BUSINESS',
  'PROPERTY',
  'VEHICLE',
  'CRIME',
  'EXPLORATION',
  'ACHIEVEMENT',
  'LOTTO',
  'CRYPTO',
  'ADMIN',
  'SYSTEM',
  'WAR'
]);

export const VALID_CLASS_XP_SOURCES = new Set([
  'BUSINESS',
  'PROPERTY',
  'CRIME',
  'LOTTO',
  'CRYPTO',
  'ADMIN',
  'SYSTEM'
]);

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value) && value !== Infinity && value !== -Infinity;
}

export function getXpRequiredForLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  const safeLevel = Math.max(1, Math.min(GENERAL_LEVEL_CAP, Math.floor(level)));
  return GENERAL_XP_THRESHOLDS[safeLevel] ?? 33700;
}

export function getXpToNextLevel(player: Player): number {
  if (!player) return 0;
  if (player.level >= GENERAL_LEVEL_CAP) return 0;
  return getXpRequiredForLevel(player.level + 1) - getXpRequiredForLevel(player.level);
}

export function getXpProgress(player: Player): number {
  return Number.isFinite(player?.xp) ? Math.max(0, player.xp) : 0;
}

export function getLevelFromLifetimeXp(lifetimeXp: number): number {
  const safeValue = Number.isFinite(lifetimeXp) ? Math.max(0, lifetimeXp) : 0;
  let currentLevel = 1;
  for (let level = GENERAL_LEVEL_CAP; level >= 1; level -= 1) {
    if (safeValue >= getXpRequiredForLevel(level)) {
      currentLevel = level;
      break;
    }
  }
  return currentLevel;
}

export function getClassXpRequiredForLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  const safeLevel = Math.max(1, Math.min(CLASS_LEVEL_CAP, Math.floor(level)));
  return CLASS_XP_THRESHOLDS[safeLevel] ?? 2700;
}

export function getClassXpToNextLevel(player: Player): number {
  if (!player) return 0;
  if (player.classLevel >= CLASS_LEVEL_CAP) return 0;
  return getClassXpRequiredForLevel(player.classLevel + 1) - getClassXpRequiredForLevel(player.classLevel);
}

export function getClassXpProgress(player: Player): number {
  return Number.isFinite(player?.classXp) ? Math.max(0, player.classXp) : 0;
}

export function getClassLevelFromClassXp(classXp: number): number {
  const safeValue = Number.isFinite(classXp) ? Math.max(0, classXp) : 0;
  let currentLevel = 1;
  for (let level = CLASS_LEVEL_CAP; level >= 1; level -= 1) {
    if (safeValue >= getClassXpRequiredForLevel(level)) {
      currentLevel = level;
      break;
    }
  }
  return currentLevel;
}

export function hydratePlayerProgression(player: Player): Player {
  if (!player) return player;
  const currentLevel = Number.isFinite(player.level) ? Math.max(1, Math.min(GENERAL_LEVEL_CAP, Math.floor(player.level))) : 1;
  const safeXp = Number.isFinite(player.xp) ? Math.max(0, player.xp) : 0;
  const safeLifetimeXp = Number.isFinite(player.lifetimeXp) ? Math.max(0, player.lifetimeXp) : 0;
  const currentClassLevel = Number.isFinite(player.classLevel) ? Math.max(1, Math.min(CLASS_LEVEL_CAP, Math.floor(player.classLevel))) : 1;
  const safeClassXp = Number.isFinite(player.classXp) ? Math.max(0, player.classXp) : 0;

  if (!Number.isFinite(player.lifetimeXp) || player.lifetimeXp < 0) {
    const legacyThreshold = getXpRequiredForLevel(currentLevel);
    player.lifetimeXp = Math.max(legacyThreshold, legacyThreshold + safeXp);
  }

  const migratedLevel = Number.isFinite(player.level) ? Math.max(1, Math.min(GENERAL_LEVEL_CAP, Math.floor(player.level))) : 1;
  const minimumLifetime = getXpRequiredForLevel(migratedLevel);
  if (player.lifetimeXp < minimumLifetime) {
    player.lifetimeXp = minimumLifetime;
  }
  player.level = getLevelFromLifetimeXp(player.lifetimeXp);
  player.xp = Math.max(0, player.lifetimeXp - getXpRequiredForLevel(player.level));

  player.classLevel = Number.isFinite(player.classLevel) ? Math.max(1, Math.min(CLASS_LEVEL_CAP, Math.floor(player.classLevel))) : 1;
  player.classXp = Number.isFinite(player.classXp) ? Math.max(0, player.classXp) : 0;

  if (player.classLevel > 1 && player.classXp < 0) {
    player.classXp = 0;
  }

  const classMinimum = getClassXpRequiredForLevel(player.classLevel);
  if (player.classXp < classMinimum) {
    player.classXp = Math.max(0, player.classXp);
  }

  const classDerivedLevel = getClassLevelFromClassXp(player.classXp);
  if (classDerivedLevel > player.classLevel) {
    player.classLevel = classDerivedLevel;
  }

  if (!Array.isArray(player.claimedLevelRewards)) player.claimedLevelRewards = [];
  if (!Array.isArray(player.claimedClassRewards)) player.claimedClassRewards = [];
  if (!player.xpEventHistory || typeof player.xpEventHistory !== 'object') player.xpEventHistory = {};
  if (!player.classXpEventHistory || typeof player.classXpEventHistory !== 'object') player.classXpEventHistory = {};

  return player;
}

function hasDuplicateEvent(player: Player, eventId: string | undefined, ledgerKey: 'xpEventHistory' | 'classXpEventHistory'): boolean {
  if (!eventId) return false;
  const ledger = player[ledgerKey] as Record<string, number> | undefined;
  if (!ledger) return false;
  return Boolean(ledger[eventId]);
}

function registerEvent(player: Player, eventId: string | undefined, ledgerKey: 'xpEventHistory' | 'classXpEventHistory'): void {
  if (!eventId) return;
  const ledger = player[ledgerKey] as Record<string, number> | undefined;
  if (!ledger) {
    (player as unknown as Record<string, Record<string, number>>)[ledgerKey] = {};
  }
  (player[ledgerKey] as Record<string, number>)[eventId] = Date.now();
}

function grantLevelReward(player: Player, level: number): number {
  const reward = GENERAL_LEVEL_REWARDS[level];
  if (!reward) return 0;
  if (!Array.isArray(player.claimedLevelRewards)) player.claimedLevelRewards = [];
  if (player.claimedLevelRewards.includes(level)) return 0;

  player.claimedLevelRewards.push(level);
  grantMoney({
    player,
    amount: reward,
    source: 'REWARD',
    reason: `Level ${level} reward`,
    transactionId: `level-reward:${player.id}:${level}`
  });
  return reward;
}

function resolveEventId(player: Player, eventId: string | undefined, source: string, prefix: string): string | undefined {
  if (eventId) return eventId;
  return `${prefix}:${source}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function grantXp(player: Player, amount: number, source: string, eventId?: string): { granted: number; source: string; eventId?: string; duplicate: boolean; lifetimeXp: number; level: number; xp: number; oldLevel: number; newLevel: number; levelRewardsGranted: number[]; } {
  if (!player || typeof player !== 'object') {
    throw new Error('Invalid player for XP grant.');
  }
  if (!Number.isFinite(amount)) {
    throw new Error('XP amount must be finite.');
  }
  if (Number.isNaN(amount) || amount === Infinity || amount === -Infinity) {
    throw new Error('XP amount cannot be NaN or infinite.');
  }
  if (amount < 0) {
    throw new Error('XP amount cannot be negative.');
  }
  if (!source || !VALID_XP_SOURCES.has(source)) {
    throw new Error(`Invalid XP source: ${source ?? 'undefined'}`);
  }

  const safeEventId = resolveEventId(player, eventId, source, 'xp');
  if (hasDuplicateEvent(player, safeEventId, 'xpEventHistory')) {
    return {
      granted: 0,
      source,
      eventId: safeEventId,
      duplicate: true,
      lifetimeXp: player.lifetimeXp,
      level: player.level,
      xp: player.xp,
      oldLevel: player.level,
      newLevel: player.level,
      levelRewardsGranted: []
    };
  }

  const oldLevel = player.level;
  const oldXp = player.xp;
  const oldLifetimeXp = player.lifetimeXp ?? 0;

  if (amount === 0) {
    return {
      granted: 0,
      source,
      eventId: safeEventId,
      duplicate: false,
      lifetimeXp: player.lifetimeXp,
      level: player.level,
      xp: player.xp,
      oldLevel,
      newLevel: player.level,
      levelRewardsGranted: []
    };
  }

  player.lifetimeXp = Number((player.lifetimeXp + amount).toFixed(2));
  player.level = getLevelFromLifetimeXp(player.lifetimeXp);
  player.xp = Math.max(0, player.lifetimeXp - getXpRequiredForLevel(player.level));
  registerEvent(player, safeEventId, 'xpEventHistory');

  const rewardsGranted: number[] = [];
  for (let level = oldLevel + 1; level <= player.level; level += 1) {
    const reward = grantLevelReward(player, level);
    if (reward > 0) rewardsGranted.push(level);
  }

  if (player.level > GENERAL_LEVEL_CAP) {
    player.level = GENERAL_LEVEL_CAP;
    player.xp = 0;
  }

  return {
    granted: Number((player.lifetimeXp - oldLifetimeXp).toFixed(2)),
    source,
    eventId: safeEventId,
    duplicate: false,
    lifetimeXp: player.lifetimeXp,
    level: player.level,
    xp: player.xp,
    oldLevel,
    newLevel: player.level,
    levelRewardsGranted: rewardsGranted
  };
}

export function grantClassXp(player: Player, amount: number, source: string, eventId?: string): { granted: number; source: string; eventId?: string; duplicate: boolean; classLevel: number; classXp: number; oldClassLevel: number; newClassLevel: number; } {
  if (!player || typeof player !== 'object') {
    throw new Error('Invalid player for class XP grant.');
  }
  if (!Number.isFinite(amount)) {
    throw new Error('Class XP amount must be finite.');
  }
  if (Number.isNaN(amount) || amount === Infinity || amount === -Infinity) {
    throw new Error('Class XP amount cannot be NaN or infinite.');
  }
  if (amount < 0) {
    throw new Error('Class XP amount cannot be negative.');
  }
  if (!source || !VALID_CLASS_XP_SOURCES.has(source)) {
    throw new Error(`Invalid class XP source: ${source ?? 'undefined'}`);
  }

  const safeEventId = resolveEventId(player, eventId, source, 'class-xp');
  if (hasDuplicateEvent(player, safeEventId, 'classXpEventHistory')) {
    return {
      granted: 0,
      source,
      eventId: safeEventId,
      duplicate: true,
      classLevel: player.classLevel,
      classXp: player.classXp,
      oldClassLevel: player.classLevel,
      newClassLevel: player.classLevel
    };
  }

  const oldClassLevel = player.classLevel ?? 1;
  const oldClassXp = Number.isFinite(player.classXp) ? Number(player.classXp) : 0;

  if (amount === 0) {
    return {
      granted: 0,
      source,
      eventId: safeEventId,
      duplicate: false,
      classLevel: player.classLevel,
      classXp: player.classXp,
      oldClassLevel,
      newClassLevel: player.classLevel
    };
  }

  player.classXp = Number(((player.classXp ?? 0) + amount).toFixed(2));
  player.classLevel = getClassLevelFromClassXp(player.classXp);
  if (player.classLevel > CLASS_LEVEL_CAP) {
    player.classLevel = CLASS_LEVEL_CAP;
  }

  registerEvent(player, safeEventId, 'classXpEventHistory');

  return {
    granted: Number((player.classXp - oldClassXp).toFixed(2)),
    source,
    eventId: safeEventId,
    duplicate: false,
    classLevel: player.classLevel,
    classXp: player.classXp,
    oldClassLevel,
    newClassLevel: player.classLevel
  };
}

export function getBusinessEfficiencyModifier(player: Player): number {
  if (player.role !== 'Businessman') return 0;
  let modifier = 0;
  if (player.classLevel >= 2) modifier += 0.02;
  if (player.classLevel >= 5) modifier += 0.03;
  if (player.classLevel >= 10) modifier += 0.05;
  return modifier;
}

export function getBusinessCollectionModifier(player: Player): number {
  if (player.role !== 'Businessman') return 0;
  let modifier = 0;
  if (player.classLevel >= 3) modifier += 0.02;
  if (player.classLevel >= 8) modifier += 0.03;
  return modifier;
}

export function getPropertyIncomeModifier(player: Player): number {
  if (player.role !== 'Businessman') return 0;
  let modifier = 0;
  if (player.classLevel >= 4) modifier += 0.02;
  if (player.classLevel >= 6) modifier += 0.03;
  if (player.classLevel >= 9) modifier += 0.03;
  return modifier;
}

export function getBusinessPurchaseCostModifier(player: Player): number {
  if (player.role !== 'Businessman') return 0;
  return player.classLevel >= 7 ? 0.02 : 0;
}

export function getCrimeSuccessModifier(player: Player): number {
  if (player.role !== 'Mafia') return 0;
  let modifier = 0;
  if (player.classLevel >= 2) modifier += 0.01;
  if (player.classLevel >= 5) modifier += 0.02;
  if (player.classLevel >= 8) modifier += 0.03;
  return modifier;
}

export function getCrimePayoutModifier(player: Player): number {
  if (player.role !== 'Mafia') return 0;
  let modifier = 0;
  if (player.classLevel >= 3) modifier += 0.02;
  if (player.classLevel >= 6) modifier += 0.03;
  if (player.classLevel >= 9) modifier += 0.04;
  return modifier;
}

export function getCrimeHeatModifier(player: Player): number {
  if (player.role !== 'Mafia') return 0;
  let modifier = 0;
  if (player.classLevel >= 4) modifier -= 0.02;
  if (player.classLevel >= 7) modifier -= 0.03;
  if (player.classLevel >= 10) modifier -= 0.05;
  return modifier;
}

export function getHitmanPrestige(player: Player): number {
  if (player.role !== 'Hitman') return 0;
  return HITMAN_PRESTIGE_TABLE[Math.min(CLASS_LEVEL_CAP, Math.max(1, player.classLevel))] ?? 0;
}

export function getClassRewardText(player: Player): string[] {
  if (player.role === 'Businessman') {
    const lines: string[] = [];
    if (player.classLevel >= 2) lines.push('🏢 Business Efficiency: +2%');
    if (player.classLevel >= 3) lines.push('💰 Business Collection: +2%');
    if (player.classLevel >= 4) lines.push('🏠 Property Income: +2%');
    if (player.classLevel >= 5) lines.push('🏢 Business Efficiency: +3%');
    if (player.classLevel >= 6) lines.push('🏠 Property Income: +3%');
    if (player.classLevel >= 7) lines.push('💸 Business Purchase Cost: -2%');
    if (player.classLevel >= 8) lines.push('💰 Business Collection: +3%');
    if (player.classLevel >= 9) lines.push('🏠 Property Income: +3%');
    if (player.classLevel >= 10) lines.push('🏢 Business Efficiency: +5%');
    return lines;
  }
  if (player.role === 'Mafia') {
    const lines: string[] = [];
    if (player.classLevel >= 2) lines.push('🎯 Crime Success: +1%');
    if (player.classLevel >= 3) lines.push('💵 Crime Payout: +2%');
    if (player.classLevel >= 4) lines.push('🛡️ Crime Heat: -2%');
    if (player.classLevel >= 5) lines.push('🎯 Crime Success: +2%');
    if (player.classLevel >= 6) lines.push('💵 Crime Payout: +3%');
    if (player.classLevel >= 7) lines.push('🛡️ Crime Heat: -3%');
    if (player.classLevel >= 8) lines.push('🎯 Crime Success: +3%');
    if (player.classLevel >= 9) lines.push('💵 Crime Payout: +4%');
    if (player.classLevel >= 10) lines.push('🛡️ Crime Heat: -5%');
    return lines;
  }
  if (player.role === 'Hitman') {
    const lines: string[] = [];
    if (player.classLevel >= 2) lines.push('🎭 Prestige: +1');
    if (player.classLevel >= 3) lines.push('🎭 Prestige: +2');
    if (player.classLevel >= 4) lines.push('🎭 Prestige: +3');
    if (player.classLevel >= 5) lines.push('🎭 Prestige: +4');
    if (player.classLevel >= 6) lines.push('🎭 Prestige: +5');
    if (player.classLevel >= 7) lines.push('🎭 Prestige: +6');
    if (player.classLevel >= 8) lines.push('🎭 Prestige: +7');
    if (player.classLevel >= 9) lines.push('🎭 Prestige: +8');
    if (player.classLevel >= 10) lines.push('🎭 Prestige: +10');
    return lines;
  }
  return [];
}
