import { getRoleInfo } from './game/roles.js';
import { COMMAND_MATRIX, GUIDE_TOPICS, MENU_GROUPS } from './game/commandCatalog.js';

export * from './connection/whatsapp.js';
export * from './game/roles.js';
export * from './game/commandParser.js';
export * from './game/player.js';
// ── Retired subsystems (not part of the live build) ──────────────────────────
// `businessSystem`, `economy`, `properties`, `vehicles` and `war` are unfinished
// legacy modules that reference Player fields which no longer exist in the live
// model (economyLedger, loans, debt, credit, properties, vehicles, stats, …).
// They are unreachable from the running bot: their only importers were the
// retired commandRegistry.ts / messageRouter.ts. They are intentionally NOT
// re-exported here so they stay out of the TypeScript program, and are listed in
// tsconfig.json "exclude". The files themselves are left on disk untouched.
export * from './game/inventory.js';
export * from './game/jobs.js';
export * from './game/quests.js';
export * from './game/achievements.js';
export * from './game/market.js';
export * from './game/crypto.js';
export * from './game/clans.js';
export * from './game/territory.js';
export * from './game/crime.js';
export * from './game/gambling.js';
export * from './game/lotto.js';
export * from './game/fisch.js';
export * from './game/moderation.js';
export * from './game/admin.js';
export * from './game/commandCatalog.js';

export type PlayerRole = 'Businessman' | 'Mafia' | 'Hitman';

export type PlayerState = {
  id: string;
  displayName: string;
  role: PlayerRole;
  level: number;
  xp: number;
  cash: number;
  bank: number;
  debt: number;
  credit: number;
  heat: number;
  clan?: string;
  businesses: number;
  properties: number;
  vehicles: number;
};

export function createPlayer(id: string, role: PlayerRole = 'Businessman', displayName = 'New Player'): PlayerState {
  const roleInfo = getRoleInfo(role);
  return {
    id,
    displayName,
    role,
    level: 1,
    xp: 0,
    cash: roleInfo.startCash,
    bank: roleInfo.startBank,
    debt: 0,
    credit: 5000,
    heat: 0,
    businesses: 0,
    properties: 0,
    vehicles: 0
  };
}

export function buildMainMenu(role: PlayerRole): string {
  const block = MENU_GROUPS[role] ?? MENU_GROUPS.Businessman;

  const lines = [
    '⚜️ *SYNDICATZ — MAIN TERMINAL* ⚜️',
    '━━━━━━━━━━━━━━━━━━━━'
  ];

  for (const item of block) {
    lines.push(item);
  }

  lines.push('');
  lines.push('📖 .guide     ❓ .help');

  return lines.join('\n');
}

export function startUnderworldDynasty(): void {
  const sample = createPlayer('boot', 'Businessman', 'Boot Player');
  console.log('⚜️ SYNDICATZ BOOTING');
  console.log('');
  console.log(buildMainMenu(sample.role));
  console.log('');
  console.log(buildGuide());
  console.log('');
  console.log(formatBankroll(sample));
}

if (process.argv[1] && process.argv[1].endsWith('src/index.js')) {
  startUnderworldDynasty();
}

export function buildGuide(): string {
  const summary = COMMAND_MATRIX.slice(0, 12).map(entry => `• .${entry.command}`).join(' ');
  const topics = GUIDE_TOPICS.map(topic => `.${topic}`).join('  ');

  return [
    '⚜️ *SYNDICATZ* ⚜️',
    '━━━━━━━━━━━━━━━━━━━━',
    'Roles: Businessman / Mafia / Hitman',
    '',
    `Core: ${summary.slice(0, 40)}`,
    '',
    `Topics: ${topics.slice(0, 40)}`,
    '',
    '.menu  .profile  .biz  .loan',
    '.crypto  .clan  .war  .leaderboard',
    '.blackjack  .lotto  .help'
  ].join('\n');
}

export function formatBankroll(player: PlayerState): string {
  return `💵 Cash: $${player.cash.toLocaleString()} | 🏦 Bank: $${player.bank.toLocaleString()} | 📉 Debt: $${player.debt.toLocaleString()}`;
}
