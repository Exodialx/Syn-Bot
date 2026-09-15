export type ParsedCommand = {
  command: string;
  alias: string | null;
  args: string[];
  original: string;
  mention?: string;
  quoted?: string[];
};

export const COMMAND_ALIASES: Record<string, string> = {
  start: 'start',
  menu: 'menu',
  help: 'help',
  guide: 'guide',
  status: 'status',
  account: 'status',
  profile: 'profile',
  whoami: 'profile',
  level: 'level',
  xp: 'xp',
  class: 'class',
  stats: 'stats',
  balance: 'balance',
  inventory: 'inventory',
  inv: 'inventory',
  rank: 'leaderboard',
  leaderboard: 'leaderboard',
  rankings: 'leaderboard',
  lb: 'leaderboard',
  richlist: 'leaderboard',
  clanrank: 'leaderboard',
  warrank: 'leaderboard',
  titles: 'titles',
  achievements: 'achievements',
  history: 'history',
  compare: 'compare',
  biz: 'business',
  business: 'business',
  collect: 'collect',
  income: 'collect',
  production: 'production',
  profit: 'production',
  expenses: 'expenses',
  property: 'property',
  prop: 'property',
  vehicle: 'vehicle',
  vehicles: 'vehicle',
  bank: 'bank',
  deposit: 'bank',
  withdraw: 'bank',
  loan: 'loan',
  borrow: 'loan',
  debt: 'debt',
  credit: 'debt',
  liquidate: 'liquidate',
  assets: 'assets',
  networth: 'assets',
  invest: 'invest',
  investments: 'invest',
  market: 'market',
  auction: 'auction',
  trade: 'trade',
  crypto: 'crypto',
  jobs: 'jobs',
  job: 'jobs',
  quests: 'quests',
  quest: 'quests',
  explore: 'explore',
  events: 'events',
  event: 'events',
  clan: 'clan',
  combat: 'combat',
  train: 'combat',
  rob: 'rob',
  raid: 'raid',
  heist: 'heist',
  sh: 'heist',
  jh: 'heist',
  gmh: 'heist',
  dh: 'heist',
  bh: 'heist',
  wanted: 'wanted',
  heat: 'wanted',
  hit: 'hit',
  contracts: 'contracts',
  contract: 'contracts',
  bounty: 'bounty',
  blackjack: 'blackjack',
  bj: 'blackjack',
  gamble: 'gamble',
  slots: 'gamble',
  dice: 'gamble',
  coinflip: 'gamble',
  highlow: 'gamble',
  lotto: 'lotto',
  war: 'war',
  warground: 'war',
  territory: 'war',
  ping: 'ping',
  uptime: 'ping',
  botinfo: 'ping',
  version: 'ping',
  news: 'news',
  quote: 'news',
  rules: 'rules',
  support: 'rules',
  feedback: 'rules',
  report: 'rules',
  moderation: 'moderation',
  admin: 'admin',
  kick: 'moderation',
  ban: 'moderation',
  mute: 'moderation',
  unmute: 'moderation',
  warn: 'moderation',
  warns: 'moderation',
  unban: 'moderation',
  tempban: 'moderation',
  timeout: 'moderation',
  tagall: 'moderation',
  tagadmins: 'moderation',
  admins: 'moderation',
  groupinfo: 'moderation',
  setname: 'moderation',
  setdesc: 'moderation',
  welcome: 'moderation',
  goodbye: 'moderation',
  antilink: 'moderation',
  antispam: 'moderation',
  antiflood: 'moderation',
  antiraid: 'moderation',
  antibadword: 'moderation',
  antitag: 'moderation'
};

export function parseCommand(input: string): ParsedCommand {
  const original = input.trim();
  if (!original) {
    return { command: '', alias: null, args: [], original: '' };
  }

  const content = original.startsWith('.') ? original.slice(1) : original;
  const parts = content.split(/\s+/g).filter(Boolean);

  const base = parts[0]?.toLowerCase() ?? '';
  const canonical = COMMAND_ALIASES[base] ?? base;
  const args = parts.slice(1);
  const mentions = args.filter(part => part.startsWith('@'));
  const quoted = [...content.matchAll(/"([^"]+)"|'([^']+)'/g)].map(match => match[1] ?? match[2]).filter(Boolean);

  return {
    command: base || '',
    alias: canonical || null,
    args,
    original,
    mention: mentions[0],
    quoted
  };
}
