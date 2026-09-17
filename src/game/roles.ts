import { Player, savePlayer } from './player.js';

export const ROLES = {
  Businessman: {
    icon: '💼',
    pitch: 'Build empires. Launder. Dominate markets.',
    bonuses: { charisma: 8, intelligence: 8, security: 6, strength: 3, stealth: 3 },
    incomeMult: 1.25,
    crimeMult: 0.85,
    startCash: 500,
    startBank: 2000
  },
  Mafia: {
    icon: '🕴️',
    pitch: 'Territory. Muscle. Protection. Fear.',
    bonuses: { strength: 9, defense: 8, stealth: 6, charisma: 5, intelligence: 4 },
    incomeMult: 1.0,
    crimeMult: 1.2,
    startCash: 1000,
    startBank: 500
  },
  Hitman: {
    icon: '🎯',
    pitch: 'Contracts. Precision. No one is safe.',
    bonuses: { stealth: 10, strength: 7, luck: 7, defense: 4, security: 3 },
    incomeMult: 0.7,
    crimeMult: 1.1,
    startCash: 1500,
    startBank: 0
  }
} as const;

/** Look up a role's static definition by name (case-insensitive). */
export function getRoleInfo(roleName: string) {
  const key = Object.keys(ROLES).find(r => r.toLowerCase() === roleName.toLowerCase()) as keyof typeof ROLES | undefined;
  if (!key) throw new Error(`Unknown role: ${roleName}`);
  return { key, ...ROLES[key] };
}

export function formatRoleSelect(): string {
  return `🔱 *CHOOSE YOUR PATH* 🔱
━━━━━━━━━━━━━━━━━━━━

1️⃣  💼 *BUSINESSMAN*
    Build. Trade. Own the city.
    Unique: *.launder @player*

2️⃣  🕴️ *MAFIA*
    Muscle. Territory. Control.

3️⃣  🎯 *HITMAN*
    Contracts. Fear. Precision.
━━━━━━━━━━━━━━━━━━━━
.role businessman
.role mafia
.role hitman

Switching roles later costs *half your XP* and *half your class XP*.
You will see the cost before confirming.`;
}

function switchCost(p: Player): { xpLoss: number; classXpLoss: number; newXp: number; newClassXp: number } {
  const xp = p.xp || 0;
  const cx = p.classXp || 0;
  const xpLoss = Math.floor(xp * 0.5);
  const classXpLoss = Math.floor(cx * 0.5);
  return {
    xpLoss,
    classXpLoss,
    newXp: xp - xpLoss,
    newClassXp: cx - classXpLoss
  };
}

/**
 * Set or switch role.
 * Switching (not first pick) requires confirm=true after previewing cost.
 */
export function setRole(p: Player, roleName: string, confirm = false): string {
  const key = Object.keys(ROLES).find(r => r.toLowerCase() === roleName.toLowerCase()) as keyof typeof ROLES | undefined;
  if (!key) return '❌ Valid roles: businessman | mafia | hitman';

  const switching = p.role !== 'Unassigned' && p.role !== key;

  if (switching && !confirm) {
    const c = switchCost(p);
    return `⚠️ *ROLE SWITCH COST*
━━━━━━━━━━━━━━━━━━━━
${p.role} → *${key}*
You will lose:
• Half level XP: −${c.xpLoss.toLocaleString()} XP  (keep ${c.newXp.toLocaleString()})
• Half class XP: −${c.classXpLoss.toLocaleString()}  (keep ${c.newClassXp.toLocaleString()})
Class level stays ${p.classLevel} (not reset).
━━━━━━━━━━━━━━━━━━━━
To proceed:
*.role confirm ${key.toLowerCase()}*`;
  }

  if (switching && confirm) {
    const c = switchCost(p);
    p.xp = c.newXp;
    p.classXp = c.newClassXp;
  }

  p.role = key;
  const b = ROLES[key].bonuses as Partial<Record<'strength' | 'defense' | 'stealth' | 'charisma' | 'intelligence' | 'luck' | 'security', number>>;
  p.strength = Math.max(p.strength, b.strength ?? 5);
  p.defense = Math.max(p.defense, b.defense ?? 5);
  p.stealth = Math.max(p.stealth, b.stealth ?? 5);
  p.charisma = Math.max(p.charisma, b.charisma ?? 5);
  p.intelligence = Math.max(p.intelligence, b.intelligence ?? 5);
  p.luck = Math.max(p.luck, b.luck ?? 5);
  p.security = Math.max(p.security, b.security ?? 5);

  savePlayer(p);
  const extra =
    key === 'Businessman'
      ? '\nUnique skill: *.launder @player* (5h CD — skim half their biz income from cash+bank)'
      : '';
  return `${ROLES[key].icon} *YOU ARE NOW ${key.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
${ROLES[key].pitch}
Stats adjusted to role focus.${extra}
Type .menu to continue.`;
}
