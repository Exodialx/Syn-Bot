/**
 * SYN multi-game platform — per-group module config (max 2)
 * Games: syndicates | konoha (soon) | utility
 */
import { getDb, saveDb } from '../db/database.js';
import { formatMenu as formatSyndicatesMenu } from './menu.js';
import { Player } from './player.js';

export const SYN_VERSION = 'v2.1.0';
export const SYN_TAGLINE = 'SYN v2.1.0 • Next Generation of Text Based Games';
export const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDMtb5545v3ntesmm40';
export const CHANNEL_NAME = 'SYN';
export const BOT_OWNER_NAME = 'Exodial';

export type GameId = 'syndicates' | 'konoha' | 'utility';

export type GroupPlatformConfig = {
  modules: GameId[]; // max 2
  configuredBy?: string;
  configuredAt?: number;
};

const REGISTRY: Record<
  GameId,
  { id: GameId; name: string; emoji: string; status: 'live' | 'soon'; blurb: string }
> = {
  syndicates: {
    id: 'syndicates',
    name: 'Syndicates',
    emoji: '🏙️',
    status: 'live',
    blurb: 'Crime city · biz · PvP · heists',
  },
  konoha: {
    id: 'konoha',
    name: 'Konoha',
    emoji: '🍃',
    status: 'soon',
    blurb: 'Shinobi ranks · missions · villages',
  },
  utility: {
    id: 'utility',
    name: 'Utility',
    emoji: '🛠️',
    status: 'live',
    blurb: 'Mod tools · stickers · antiword · fun',
  },
};

function store(): Record<string, GroupPlatformConfig> {
  const db = getDb() as any;
  if (!db.platformGroups) db.platformGroups = {};
  return db.platformGroups;
}

export function getGroupPlatform(chatJid: string): GroupPlatformConfig {
  if (!chatJid || !chatJid.endsWith('@g.us')) {
    return { modules: ['syndicates', 'utility'] }; // DMs: both live modules
  }
  const s = store();
  if (!s[chatJid]) {
    s[chatJid] = { modules: [] }; // unlocked
    saveDb();
  }
  const c = s[chatJid];
  if (!Array.isArray(c.modules)) c.modules = [];
  return c;
}

export function isUnlocked(chatJid: string): boolean {
  if (!chatJid?.endsWith('@g.us')) return true;
  return getGroupPlatform(chatJid).modules.length === 0;
}

export function hasModule(chatJid: string, game: GameId): boolean {
  if (!chatJid?.endsWith('@g.us')) {
    return game === 'syndicates' || game === 'utility';
  }
  const m = getGroupPlatform(chatJid).modules;
  if (m.length === 0) return true; // unlocked = all available
  return m.includes(game);
}

export function configureGroup(
  chatJid: string,
  adminId: string,
  args: string[]
): string {
  if (!chatJid.endsWith('@g.us')) return '❌ .configure is for *groups* only.';
  const sub = (args[0] || '').toLowerCase();
  const c = getGroupPlatform(chatJid);

  if (!sub || sub === 'status' || sub === 'list') {
    return formatConfigureStatus(chatJid);
  }
  if (sub === 'off' || sub === 'none' || sub === 'clear' || sub === 'unlock') {
    c.modules = [];
    c.configuredBy = adminId;
    c.configuredAt = Date.now();
    store()[chatJid] = c;
    saveDb();
    return `🔓 *GROUP UNLOCKED*
━━━━━━━━━━━━━━━━━━━━
All SYN modules available.
.menu for the full list`;
  }
  if (sub === 'remove' || sub === 'rm') {
    const id = normalizeGame(args[1] || '');
    if (!id) return 'Usage: .configure remove syndicates|utility|konoha';
    c.modules = c.modules.filter((x) => x !== id);
    store()[chatJid] = c;
    saveDb();
    return `➖ Removed *${id}*\nActive: ${c.modules.join(', ') || 'none (unlocked)'}`;
  }

  const id = normalizeGame(sub);
  if (!id) {
    return `Usage:
.configure syndicates
.configure utility
.configure konoha
.configure remove <game>
.configure off
.configure status

Max *2* modules per group.`;
  }
  if (REGISTRY[id].status === 'soon' && id === 'konoha') {
    // allow configuring as "soon" lock for branding
  }
  if (c.modules.includes(id)) {
    return `✅ *${REGISTRY[id].name}* already configured here.`;
  }
  if (c.modules.length >= 2) {
    return `❌ Max *2* modules per group.
Active: ${c.modules.map((m) => REGISTRY[m].name).join(', ')}
Remove one: .configure remove <game>`;
  }
  c.modules.push(id);
  c.configuredBy = adminId;
  c.configuredAt = Date.now();
  store()[chatJid] = c;
  saveDb();
  return `🔒 *CONFIGURED*
━━━━━━━━━━━━━━━━━━━━
Added: ${REGISTRY[id].emoji} *${REGISTRY[id].name}*
Active modules (${c.modules.length}/2):
${c.modules.map((m) => `▸ ${REGISTRY[m].emoji} ${REGISTRY[m].name}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━
.menu updates for this group.`;
}

function normalizeGame(raw: string): GameId | null {
  const s = raw.toLowerCase().trim();
  if (['syn', 'syndicate', 'syndicates', 'crime', '1'].includes(s)) return 'syndicates';
  if (['konoha', 'naruto', 'ninja', 'shinobi', '2'].includes(s)) return 'konoha';
  if (['util', 'utility', 'tools', 'mod', '3'].includes(s)) return 'utility';
  return null;
}

export function formatConfigureStatus(chatJid: string): string {
  const c = getGroupPlatform(chatJid);
  const lines =
    c.modules.length === 0
      ? '▸ Unlocked — all modules visible'
      : c.modules.map((m) => `▸ ${REGISTRY[m].emoji} ${REGISTRY[m].name} (${REGISTRY[m].status})`).join('\n');
  return `⚙️ *GROUP CONFIG*
━━━━━━━━━━━━━━━━━━━━
${lines}
━━━━━━━━━━━━━━━━━━━━
.configure <game>  ·  max 2
.configure off  ·  unlock
${SYN_TAGLINE}`;
}

export function formatPlatformMenu(player: Player, chatJid: string): string {
  const c = getGroupPlatform(chatJid);
  const locked = c.modules.length > 0;

  // Locked to single live game only → that game menu
  if (locked && c.modules.length === 1 && c.modules[0] === 'syndicates') {
    return formatSyndicatesMenu(player) + footer();
  }
  if (locked && c.modules.length === 1 && c.modules[0] === 'utility') {
    return (
      `🛠️ *UTILITY MODULE*\n━━━━━━━━━━━━━━━━━━━━\nType *.utility* for the full tool list.\n.mod · .sticker · .antiword · .ping\n` +
      footer()
    );
  }
  if (locked && c.modules.length === 1 && c.modules[0] === 'konoha') {
    return formatKonohaSoon() + footer();
  }

  // Multi or unlocked — catalog
  let out = `⚜️ *SYN ${SYN_VERSION}*
━━━━━━━━━━━━━━━━━━━━
*Next Generation of Text Based Games*

`;
  const show = locked ? c.modules : (['syndicates', 'konoha', 'utility'] as GameId[]);
  for (const id of show) {
    const g = REGISTRY[id];
    const badge = g.status === 'soon' ? '_coming soon_' : '*LIVE*';
    out += `${g.emoji} *${g.name}* · ${badge}
   ${g.blurb}\n\n`;
  }
  if (!locked) {
    out += `Admin: *.configure syndicates*
        *.configure utility*
   (max 2 modules per group)\n`;
  } else {
    out += `Active: ${c.modules.join(' + ')}\n.configure status · .configure off\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
🏙️ Syndicates → .profile · .crime · .biz
🛠️ Utility → .utility · .mod
🍃 Konoha → soon
━━━━━━━━━━━━━━━━━━━━
${SYN_TAGLINE}
${CHANNEL_URL}`;
  return out;
}

export function formatKonohaSoon(): string {
  return `🍃 *KONOHA*
━━━━━━━━━━━━━━━━━━━━
Shinobi ranks · missions · villages
*Coming soon.*

Configure placeholder:
.configure konoha

Meanwhile play *Syndicates* or enable *Utility*.
━━━━━━━━━━━━━━━━━━━━
${SYN_TAGLINE}`;
}

function footer(): string {
  return `\n━━━━━━━━━━━━━━━━━━━━\n${SYN_TAGLINE}\n${CHANNEL_URL}`;
}

/** Commands that belong to syndicates game */
export const SYNDICATE_CMDS = new Set([
  'profile','whoami','balance','role','daily','cd','cooldown','cooldowns','class','achievements',
  'bank','deposit','withdraw','pay','biz','business','businesses','collect','launder',
  'crime','crimes','wanted','rob','revenge','brob','raid','hit','bounty','bounties','claim',
  'quest','onboard','tutorial','contracts','ghost','evidence','stalk','list','silent',
  'news','city','cityheat','crypto','sh','jh','gmh','dh','bh','safe','risky','join',
  'shop','store','market','buy','inv','inventory','equip','unequip','hire','fire','guards',
  'jail','bail','escape','work','commissary','smuggle','prison','bj','blackjack','dice',
  'coinflip','poker','spell','spelling','slots','shell','shellgame','roulette','count','fake',
  'battle','lb','leaderboard','rankings','richlist','guide','story','path','dailies','dclaim',
  'crew','recruit','racket','intimidate','guild','territory','heist','whatsnew','whats','changelog',
  'al','alb','achievement','dcontracts','jobs','bizstory','mafiastory','hitstory','hitmanstory',
  'howto','walkthrough','revenge','brob'
]);

export const UTILITY_CMDS = new Set([
  'utility','util','tools','tool','mod','antiword','nsfw','sticker','s','kick','promote','demote',
  'tagall','hidetag','everyone','grouplink','invite','revoke','listadmins','admins','ping',
  'runtime','uptime','botstatus','status','say','owner','botowner','version','vv','toimg',
  'quote','emojimix','calc','pick','flip','random','weather','define','shorten','translate',
  'ascii','password','uuid','base64','binary','morse','reverse','fakeinfo','ship','compat',
  'truth','dare','wyr','joke','fact','quote2','remind','poll','totext','steal','attp','ttp',
  'smeme','qc','tour','device','speed','alive','script','creator','support','channel','gcinfo',
  'hidetag','afk','del','delete','link','resetlink','setname','setdesc','hidetag','open','close',
  'mute','unmute','warn','warnings','unwarn','antibot','antispam','welcome','goodbye'
]);

export const PLATFORM_CMDS = new Set([
  'menu','help','start','configure','config','games','syn','version','botowner','owner','channel','announcement','announce','event'
]);

export function commandAllowed(chatJid: string, cmd: string): { ok: boolean; msg?: string } {
  const c = cmd.replace(/^\./, '').toLowerCase();
  if (PLATFORM_CMDS.has(c)) return { ok: true };
  if (!chatJid?.endsWith('@g.us')) return { ok: true };

  const conf = getGroupPlatform(chatJid);
  if (conf.modules.length === 0) return { ok: true }; // unlocked

  const needSyn = SYNDICATE_CMDS.has(c);
  const needUtil = UTILITY_CMDS.has(c);
  const hasSyn = conf.modules.includes('syndicates');
  const hasUtil = conf.modules.includes('utility');
  const hasKonoha = conf.modules.includes('konoha');

  if (needSyn && !hasSyn) {
    return {
      ok: false,
      msg: `🔒 This group is locked to: *${conf.modules.join(', ')}*\nSyndicates commands are off.\n.menu · .configure status`,
    };
  }
  if (needUtil && !hasUtil && !hasSyn) {
    return {
      ok: false,
      msg: `🔒 Utility not enabled here.\nAdmin: .configure utility\nActive: ${conf.modules.join(', ')}`,
    };
  }
  // syndicates lock alone still allows utility moderation tools
  if (needUtil && !hasUtil && hasSyn) {
    return { ok: true };
  }
  if (c.startsWith('kono') || c === 'jutsu' || c === 'mission') {
    if (!hasKonoha) {
      return { ok: false, msg: '🍃 Konoha is not enabled / coming soon.\n.configure konoha (placeholder)' };
    }
    return { ok: false, msg: formatKonohaSoon() };
  }
  return { ok: true };
}

export function formatVersion(): string {
  return `📦 *SYN ${SYN_VERSION}*

${SYN_TAGLINE}

Modules
🏙️ Syndicates — live
🍃 Konoha — coming soon
🛠️ Utility — live

Owner: *${BOT_OWNER_NAME}*`;
}

export function formatBotOwner(): string {
  return `👑 *BOT OWNER*

*Exodial*
SYN — text-based games for WhatsApp

Version: ${SYN_VERSION}`;
}
