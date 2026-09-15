/**
 * Unified outbound message style + command reactions
 */
import { SYN_VERSION, SYN_TAGLINE, CHANNEL_URL } from '../game/platform.js';

export const CHANNEL_LINK = CHANNEL_URL || 'https://whatsapp.com/channel/0029VbDMtb5545v3ntesmm40';

/** Short anti-spam delay before every reply (ms) */
export const REPLY_DELAY_MS = 80;

/** 30 command → reaction emoji map (plus fallbacks) */
export const COMMAND_REACTIONS: Record<string, string> = {
  start: '⚜️',
  menu: '📜',
  help: '❓',
  guide: '📖',
  story: '📖',
  profile: '👤',
  whoami: '👤',
  set: '🪪',
  setname: '🪪',
  role: '🎭',
  daily: '🎁',
  bank: '🏦',
  deposit: '💰',
  dep: '💰',
  withdraw: '💸',
  wd: '💸',
  rob: '🔫',
  raid: '💥',
  hit: '🎯',
  brob: '🏦',
  bankrob: '🏦',
  crime: '🕶️',
  crypto: '🪙',
  shop: '🛒',
  store: '🛒',
  inv: '🎒',
  inventory: '🎒',
  buy: '🛒',
  equip: '⚔️',
  lb: '🏆',
  leaderboard: '🏆',
  al: '🏅',
  achievements: '🏅',
  badges: '🏅',
  heist: '💎',
  riskyheist: '💎',
  safeheist: '💎',
  stalk: '👁️',
  ghost: '👻',
  contracts: '📜',
  crew: '👥',
  biz: '🏢',
  business: '🏢',
  collect: '💵',
  utility: '🛠️',
  util: '🛠️',
  tools: '🛠️',
  mod: '🛠️',
  sticker: '🎨',
  s: '🎨',
  toimg: '🖼️',
  steal: '🖼️',
  ping: '🏓',
  configure: '⚙️',
  config: '⚙️',
  channel: '📢',
  support: '📢',
  version: '📦',
  owner: '👑',
  botowner: '👑',
  news: '📰',
  city: '🌆',
  jail: '🔐',
  bail: '🔓',
  slots: '🎰',
  dice: '🎲',
  bj: '🃏',
  roulette: '🔫',
  shellgame: '🥣',
  futures: '📈',
  admin: '🔐',
  drain: '🩸',
  economy: '📊',
};

const FALLBACK_REACTIONS = [
  '👍', '🔥', '⚡', '✨', '💯', '🫡', '😎', '🤝', '📌', '⭐',
];

export function reactionForCommand(cmd: string): string {
  const key = (cmd || '').replace(/^\./, '').toLowerCase();
  if (COMMAND_REACTIONS[key]) return COMMAND_REACTIONS[key];
  // stable pick from fallbacks by hash
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % FALLBACK_REACTIONS.length;
  return FALLBACK_REACTIONS[h];
}

/**
 * Apply clean mobile formatting:
 * header already in content · body · — · italic footer · channel link last
 */
export function styleOutbound(text: string, opts?: { skipFooter?: boolean; skipChannel?: boolean }): string {
  let body = (text || '').trim();
  if (!body) return body;

  // strip any prior channel link / old footers so we don't double
  body = body
    .replace(/\n?https:\/\/whatsapp\.com\/channel\/[^\s]+/gi, '')
    .replace(/\n?—\n?_?SYN v[\d.]+[^\n]*/gi, '')
    .trim();

  if (opts?.skipFooter) return body;

  const footer = `—

🚀 _${SYN_TAGLINE || `SYN ${SYN_VERSION} • Next Generation of Text Based Games`}_`;

  let out = `${body}\n${footer}`;
  if (!opts?.skipChannel) {
    out += `\n\n${CHANNEL_LINK}`;
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
