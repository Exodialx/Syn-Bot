/**
 * Guilds + territories — EXPENSIVE, intense endgame layer
 * Create: $3,000,000 · wars, upgrades, vault, prestige territories
 */
import { Player, savePlayer, getPlayer, resolveExistingPlayerId } from './player.js';
import { getDb, saveDb } from '../db/database.js';

export type Guild = {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  officers: string[];
  members: string[];
  bank: number;
  created: number;
  wins: number;
  losses: number;
  // upgrades
  level: number; // 1-5 HQ
  armory: number; // 0-3 war power
  vault: number; // 0-3 bank capacity mult
  influence: number;
  warBondUntil?: number;
  lastWar?: number;
  motto?: string;
};

export type Territory = {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  income: number;
  tier: 1 | 2 | 3 | 4;
  ownerGuildId?: string;
  claimedAt?: number;
  defense?: number;
};

const CREATE_COST = 3_000_000;
const RENAME_COST = 500_000;
const OFFICER_COST = 250_000;
const WAR_DECLARE_COST = 750_000;
const WAR_CD_MS = 2 * 60 * 60 * 1000; // 2h
const HQ_UPGRADE = [0, 2_000_000, 4_000_000, 7_500_000, 12_000_000]; // to reach level 2..5
const ARMORY_COST = [1_500_000, 3_000_000, 5_000_000];
const VAULT_COST = [1_000_000, 2_500_000, 5_000_000];

const TERRITORIES: Territory[] = [
  // Tier 1 — entry
  { id: 'alley', name: 'Back Alley', emoji: '🗑️', cost: 800_000, income: 12_000, tier: 1 },
  { id: 'corner', name: 'Street Corner', emoji: '🚦', cost: 1_200_000, income: 18_000, tier: 1 },
  { id: 'oldtown', name: 'Old Town Blocks', emoji: '🏚️', cost: 1_500_000, income: 22_000, tier: 1 },
  { id: 'subway', name: 'Subway Tunnels', emoji: '🚇', cost: 1_800_000, income: 26_000, tier: 1 },
  // Tier 2
  { id: 'docks', name: 'The Docks', emoji: '⚓', cost: 3_500_000, income: 45_000, tier: 2 },
  { id: 'market', name: 'Night Market', emoji: '🏮', cost: 4_000_000, income: 52_000, tier: 2 },
  { id: 'industrial', name: 'Industrial Row', emoji: '🏭', cost: 4_500_000, income: 58_000, tier: 2 },
  { id: 'warehouse', name: 'Warehouse District', emoji: '📦', cost: 5_000_000, income: 65_000, tier: 2 },
  // Tier 3
  { id: 'heights', name: 'Ridge Heights', emoji: '🏙️', cost: 8_000_000, income: 95_000, tier: 3 },
  { id: 'harbor', name: 'Smuggler Harbor', emoji: '🚢', cost: 9_500_000, income: 110_000, tier: 3 },
  { id: 'casino', name: 'Neon Strip', emoji: '🎰', cost: 12_000_000, income: 140_000, tier: 3 },
  { id: 'airport', name: 'Private Airstrip', emoji: '✈️', cost: 14_000_000, income: 160_000, tier: 3 },
  // Tier 4 — legend
  { id: 'capitol', name: 'Capitol Shadow Wing', emoji: '🏛️', cost: 25_000_000, income: 280_000, tier: 4 },
  { id: 'offshore', name: 'Offshore Platform', emoji: '🛢️', cost: 30_000_000, income: 320_000, tier: 4 },
  { id: 'vault-city', name: 'City Vault Access', emoji: '🔐', cost: 40_000_000, income: 400_000, tier: 4 },
  { id: 'throne', name: 'Underworld Throne', emoji: '👑', cost: 55_000_000, income: 500_000, tier: 4 },
];

function dbAny(): any {
  return getDb() as any;
}

function guilds(): Record<string, Guild> {
  const db = dbAny();
  if (!db.guilds) db.guilds = {};
  return db.guilds;
}

function territories(): Record<string, Territory> {
  const db = dbAny();
  if (!db.territories) {
    db.territories = {};
    for (const t of TERRITORIES) db.territories[t.id] = { ...t };
  }
  // merge any new catalog ids
  for (const t of TERRITORIES) {
    if (!db.territories[t.id]) db.territories[t.id] = { ...t };
    else {
      // keep ownership, refresh costs/income from catalog
      const o = db.territories[t.id];
      o.cost = t.cost;
      o.income = t.income;
      o.name = t.name;
      o.emoji = t.emoji;
      o.tier = t.tier;
    }
  }
  return db.territories;
}

function playerGuildId(p: Player): string | null {
  return (p as any).guildId || null;
}

function genId(): string {
  return 'g' + Math.random().toString(36).slice(2, 8);
}

function ensureGuild(g: Guild): Guild {
  if (!g.level) g.level = 1;
  if (!g.armory) g.armory = 0;
  if (!g.vault) g.vault = 0;
  if (!g.influence) g.influence = 0;
  if (!g.officers) g.officers = [];
  return g;
}

function memberCap(g: Guild): number {
  return 5 + g.level * 3; // 8..20
}

function bankCap(g: Guild): number {
  return (5_000_000 + g.level * 5_000_000) * (1 + g.vault);
}

function warPower(g: Guild): number {
  return (
    g.members.length * 12 +
    g.wins * 5 +
    g.armory * 25 +
    g.level * 15 +
    Math.min(80, Math.floor(g.bank / 1_000_000) * 3) +
    Object.values(territories()).filter((t) => t.ownerGuildId === g.id).length * 10
  );
}

export function guildCreate(p: Player, nameRaw: string): string {
  if (playerGuildId(p)) return '❌ Already in a guild. `.guild leave` first.';
  const name = (nameRaw || '').trim().slice(0, 28);
  if (name.length < 3) return 'Usage: `.guild create <name>`\nCost: *$3,000,000*';
  if (p.cash < CREATE_COST) {
    return `❌ Founding a guild costs *$${CREATE_COST.toLocaleString()}*\nYou have $${p.cash.toLocaleString()}`;
  }
  p.cash -= CREATE_COST;
  const id = genId();
  const g: Guild = {
    id,
    name,
    tag: name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GILD',
    ownerId: p.id,
    officers: [],
    members: [p.id],
    bank: 0,
    created: Date.now(),
    wins: 0,
    losses: 0,
    level: 1,
    armory: 0,
    vault: 0,
    influence: 10,
  };
  guilds()[id] = g;
  (p as any).guildId = id;
  savePlayer(p);
  saveDb();
  return `⚔️ *GUILD FOUNDED*
━━━━━━━━━━━━━━━━━━━━
*${name}* [${g.tag}]
👑 Owner: you
💸 −$${CREATE_COST.toLocaleString()}
HQ Lv 1 · Cap ${memberCap(g)} members
━━━━━━━━━━━━━━━━━━━━
*Next moves*
.guild deposit <amt>  — fund the war chest
.guild upgrade hq|armory|vault
.territory list
.guild war @player
.guild setname / .guild motto
━━━━━━━━━━━━━━━━━━━━
This is endgame money. Spend like a boss.`;
}

export function guildSetName(p: Player, nameRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id) return '❌ Owner only.';
  const name = (nameRaw || '').trim().slice(0, 28);
  if (name.length < 3) return 'Usage: `.guild setname <name>` · *$500,000* from guild bank';
  if (g.bank < RENAME_COST) return `❌ Guild bank needs $${RENAME_COST.toLocaleString()}`;
  g.bank -= RENAME_COST;
  g.name = name;
  g.tag = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || g.tag;
  saveDb();
  return `✅ Renamed to *${name}* [${g.tag}]\n−$${RENAME_COST.toLocaleString()} guild bank`;
}

export function guildMotto(p: Player, motto: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id && !g.officers.includes(p.id)) return '❌ Owner/officer only.';
  const cost = 100_000;
  if (g.bank < cost) return `❌ Need $${cost.toLocaleString()} in guild bank`;
  g.bank -= cost;
  g.motto = (motto || '').slice(0, 60);
  saveDb();
  return `📜 Motto set: _${g.motto}_\n−$${cost.toLocaleString()}`;
}

export function guildInfo(p: Player): string {
  const gid = playerGuildId(p);
  if (!gid || !guilds()[gid]) {
    return `⚔️ *GUILD SYSTEM* — ENDGAME
━━━━━━━━━━━━━━━━━━━━
Found a crew. Own the city. Bleed rivals dry.

*.guild create <name>* — *$${CREATE_COST.toLocaleString()}*
.guild accept · .guild leave · .guild disband

*Economy*
.guild deposit <amt>
.guild bank
.guild upgrade hq | armory | vault

*War*
.guild war @player  (declare *$${WAR_DECLARE_COST.toLocaleString()}*)
.guild bond  — war bond boost ($${(1_000_000).toLocaleString()})

*Land*
.territory list
.territory buy <id>  — multi-million claims

*Social*
.guild invite @ · .guild setname · .guild motto
.guild promote @ · .guild kick @
━━━━━━━━━━━━━━━━━━━━
Territories go up to *$55,000,000*.
Guilds that don't deposit *die in war*.`;
  }
  const g = ensureGuild(guilds()[gid]);
  const turfs = Object.values(territories()).filter((t) => t.ownerGuildId === g.id);
  const income = turfs.reduce((s, t) => s + t.income, 0);
  const names = g.members.slice(0, 15).map((id) => {
    const m = getPlayer(id);
    let role = '';
    if (id === g.ownerId) role = ' 👑';
    else if (g.officers.includes(id)) role = ' ⭐';
    return `▸ ${m?.name || id.slice(-4)}${role}`;
  }).join('\n');
  return `⚔️ *${g.name}* [${g.tag}]
━━━━━━━━━━━━━━━━━━━━
${g.motto ? `_"${g.motto}"_\n` : ''}HQ *Lv ${g.level}* · Armory ${g.armory}/3 · Vault ${g.vault}/3
Members ${g.members.length}/${memberCap(g)}
Bank $${g.bank.toLocaleString()} / cap $${bankCap(g).toLocaleString()}
Power ~${Math.floor(warPower(g))} · Record ${g.wins}W-${g.losses}L
Influence ${g.influence}
Territories: *${turfs.length}* · +$${income.toLocaleString()}/cycle
${turfs.map((t) => `${t.emoji} ${t.name}`).join('\n') || '— none —'}
━━━━━━━━━━━━━━━━━━━━
${names}
━━━━━━━━━━━━━━━━━━━━
.guild upgrade · .territory list · .guild war`;
}

export function guildInvite(p: Player, targetRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id && !g.officers.includes(p.id)) return '❌ Owner/officer only.';
  if (g.members.length >= memberCap(g)) return `❌ Member cap ${memberCap(g)}. Upgrade HQ.`;
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (playerGuildId(resolved.player)) return '❌ Already in a guild.';
  const db = dbAny();
  if (!db.guildInvites) db.guildInvites = {};
  db.guildInvites[resolved.id] = { guildId: gid, by: p.id, at: Date.now() };
  saveDb();
  return `📨 Invite → *${resolved.player.name || 'player'}*\nThey: \`.guild accept\``;
}

export function guildAccept(p: Player): string {
  if (playerGuildId(p)) return '❌ Already in a guild.';
  const db = dbAny();
  const inv = db.guildInvites?.[p.id];
  if (!inv || Date.now() - inv.at > 24 * 3600_000) return '❌ No valid invite.';
  const g = ensureGuild(guilds()[inv.guildId]);
  if (!g) return '❌ Guild gone.';
  if (g.members.length >= memberCap(g)) return '❌ Guild full.';
  g.members.push(p.id);
  (p as any).guildId = g.id;
  delete db.guildInvites[p.id];
  savePlayer(p);
  saveDb();
  return `✅ Joined *${g.name}* [${g.tag}]`;
}

export function guildLeave(p: Player): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId === p.id) return '❌ Owner: `.guild disband` (destroys everything).';
  g.members = g.members.filter((id) => id !== p.id);
  g.officers = g.officers.filter((id) => id !== p.id);
  (p as any).guildId = null;
  savePlayer(p);
  saveDb();
  return `✅ Left *${g.name}*`;
}

export function guildDisband(p: Player): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id) return '❌ Owner only.';
  for (const id of g.members) {
    const m = getPlayer(id);
    if (m) {
      (m as any).guildId = null;
      savePlayer(m);
    }
  }
  for (const t of Object.values(territories())) {
    if (t.ownerGuildId === gid) {
      t.ownerGuildId = undefined;
      t.claimedAt = undefined;
    }
  }
  delete guilds()[gid];
  saveDb();
  return `💥 *${g.name}* disbanded. Territories released. Bank vaporized.`;
}

export function guildDeposit(p: Player, amtRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  const amt = parseInt(String(amtRaw).replace(/[^0-9]/g, ''), 10);
  if (!amt || amt < 10_000) return 'Usage: `.guild deposit <amount>` (min $10k)';
  if (p.cash < amt) return '❌ Not enough cash';
  if (g.bank + amt > bankCap(g)) return `❌ Vault cap $${bankCap(g).toLocaleString()}. Upgrade vault/HQ.`;
  p.cash -= amt;
  g.bank += amt;
  g.influence += Math.floor(amt / 500_000);
  savePlayer(p);
  saveDb();
  return `🏦 +$${amt.toLocaleString()} → guild\nBank *$${g.bank.toLocaleString()}* / ${bankCap(g).toLocaleString()}`;
}

export function guildUpgrade(p: Player, what: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id) return '❌ Owner only.';
  const w = (what || '').toLowerCase();
  if (w === 'hq' || w === 'base') {
    if (g.level >= 5) return '✅ HQ already max (Lv 5).';
    const cost = HQ_UPGRADE[g.level];
    if (g.bank < cost) return `❌ HQ → Lv ${g.level + 1} costs *$${cost.toLocaleString()}* guild bank`;
    g.bank -= cost;
    g.level++;
    g.influence += 25;
    saveDb();
    return `🏗️ *HQ UPGRADED* → Lv *${g.level}*\nMember cap ${memberCap(g)} · −$${cost.toLocaleString()}`;
  }
  if (w === 'armory' || w === 'arms') {
    if (g.armory >= 3) return '✅ Armory max.';
    const cost = ARMORY_COST[g.armory];
    if (g.bank < cost) return `❌ Armory ${g.armory + 1} costs *$${cost.toLocaleString()}*`;
    g.bank -= cost;
    g.armory++;
    saveDb();
    return `🔫 Armory *${g.armory}/3* · war power up · −$${cost.toLocaleString()}`;
  }
  if (w === 'vault' || w === 'bank') {
    if (g.vault >= 3) return '✅ Vault max.';
    const cost = VAULT_COST[g.vault];
    if (g.bank < cost) return `❌ Vault ${g.vault + 1} costs *$${cost.toLocaleString()}*`;
    g.bank -= cost;
    g.vault++;
    saveDb();
    return `🔐 Vault *${g.vault}/3* · cap $${bankCap(g).toLocaleString()} · −$${cost.toLocaleString()}`;
  }
  return `Usage: \`.guild upgrade hq|armory|vault\`
HQ: ${g.level < 5 ? `$${HQ_UPGRADE[g.level].toLocaleString()} → Lv ${g.level + 1}` : 'MAX'}
Armory: ${g.armory < 3 ? `$${ARMORY_COST[g.armory].toLocaleString()}` : 'MAX'}
Vault: ${g.vault < 3 ? `$${VAULT_COST[g.vault].toLocaleString()}` : 'MAX'}`;
}

export function guildWarBond(p: Player): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Not in a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id && !g.officers.includes(p.id)) return '❌ Owner/officer only.';
  const cost = 1_000_000;
  if (g.bank < cost) return `❌ War bond costs *$${cost.toLocaleString()}* from guild bank`;
  g.bank -= cost;
  g.warBondUntil = Date.now() + 60 * 60 * 1000;
  saveDb();
  return `📜 *WAR BOND ACTIVE* 1h\n+25% war power · −$${cost.toLocaleString()}`;
}

export function guildBattle(p: Player, targetRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Need a guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id && !g.officers.includes(p.id)) return '❌ Owner/officer declares war.';
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  const ogid = playerGuildId(resolved.player);
  if (!ogid || !guilds()[ogid]) return '❌ Target not in a guild.';
  if (ogid === gid) return '❌ Same guild.';
  const enemy = ensureGuild(guilds()[ogid]);
  const now = Date.now();
  if ((g.lastWar || 0) + WAR_CD_MS > now) {
    const left = Math.ceil(((g.lastWar || 0) + WAR_CD_MS - now) / 60000);
    return `⏳ War cooldown: *${left}m*`;
  }
  if (g.bank < WAR_DECLARE_COST) {
    return `❌ Declaring war costs *$${WAR_DECLARE_COST.toLocaleString()}* from guild bank`;
  }
  g.bank -= WAR_DECLARE_COST;
  g.lastWar = now;
  enemy.lastWar = now;

  let pa = warPower(g) + Math.random() * 30;
  let pb = warPower(enemy) + Math.random() * 30;
  if ((g.warBondUntil || 0) > now) pa *= 1.25;
  if ((enemy.warBondUntil || 0) > now) pb *= 1.25;

  // territory edge
  const aTurf = Object.values(territories()).filter((t) => t.ownerGuildId === g.id).length;
  const bTurf = Object.values(territories()).filter((t) => t.ownerGuildId === enemy.id).length;
  pa += aTurf * 5;
  pb += bTurf * 5;

  if (pa >= pb) {
    g.wins++;
    enemy.losses++;
    const loot = Math.min(enemy.bank, 500_000 + Math.floor(Math.random() * 1_500_000) + g.armory * 200_000);
    enemy.bank -= loot;
    g.bank += loot;
    g.influence += 15;
    // chance to contest a weak territory
    let stealMsg = '';
    const enemyTurfs = Object.values(territories()).filter((t) => t.ownerGuildId === enemy.id);
    if (enemyTurfs.length && Math.random() < 0.25 + g.armory * 0.05) {
      const weak = enemyTurfs.sort((a, b) => a.tier - b.tier)[0];
      weak.ownerGuildId = g.id;
      weak.claimedAt = now;
      stealMsg = `\n🏴 Seized territory: ${weak.emoji} *${weak.name}*`;
    }
    saveDb();
    return `⚔️ *GUILD WAR — VICTORY*
━━━━━━━━━━━━━━━━━━━━
*${g.name}* crushed *${enemy.name}*
Declare −$${WAR_DECLARE_COST.toLocaleString()}
Loot *$${loot.toLocaleString()}* from their vault
Power ${Math.floor(pa)} vs ${Math.floor(pb)}${stealMsg}
Record ${g.wins}W`;
  }
  g.losses++;
  enemy.wins++;
  const loss = Math.min(g.bank, 300_000 + Math.floor(Math.random() * 1_000_000));
  g.bank -= loss;
  enemy.bank += loss;
  saveDb();
  return `⚔️ *GUILD WAR — DEFEAT*
━━━━━━━━━━━━━━━━━━━━
*${enemy.name}* held.
−$${WAR_DECLARE_COST.toLocaleString()} declare
−$${loss.toLocaleString()} looted from your vault
Record ${g.losses}L
.guild bond · .guild upgrade armory`;
}

export function territoryList(): string {
  const ts = Object.values(territories()).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  let out = `🗺️ *TERRITORIES* — BUY WITH GUILD BANK
━━━━━━━━━━━━━━━━━━━━\n`;
  let tier = 0;
  for (const t of ts) {
    if (t.tier !== tier) {
      tier = t.tier;
      out += `\n*Tier ${tier}*\n`;
    }
    const owner = t.ownerGuildId ? guilds()[t.ownerGuildId]?.name || '???' : '_unclaimed_';
    out += `${t.emoji} \`${t.id}\` *${t.name}*
   $${t.cost.toLocaleString()} · +$${t.income.toLocaleString()}/cycle
   ${owner}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.territory buy <id>
Owner only · paid from *guild bank*
Wars can seize low-tier land`;
  return out;
}

export function territoryBuy(p: Player, idRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ Guild required.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id) return '❌ Guild owner only.';
  const id = (idRaw || '').toLowerCase().trim();
  const t = territories()[id];
  if (!t) return '❌ Unknown id. `.territory list`';
  if (t.ownerGuildId === gid) return '✅ Already yours.';
  if (t.ownerGuildId) {
    return `❌ Owned by *${guilds()[t.ownerGuildId]?.name || 'another guild'}*.\nWin a \`.guild war\` to seize — or wait.`;
  }
  if (g.bank < t.cost) return `❌ Need *$${t.cost.toLocaleString()}* in guild bank`;
  g.bank -= t.cost;
  t.ownerGuildId = gid;
  t.claimedAt = Date.now();
  g.influence += 10 * t.tier;
  saveDb();
  return `🏴 *TERRITORY CLAIMED*
━━━━━━━━━━━━━━━━━━━━
${t.emoji} *${t.name}* (T${t.tier})
−$${t.cost.toLocaleString()}
Income +$${t.income.toLocaleString()}/cycle
Bank left $${g.bank.toLocaleString()}`;
}

export function guildPromote(p: Player, targetRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ No guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id) return '❌ Owner only.';
  if (g.bank < OFFICER_COST) return `❌ Promoting costs *$${OFFICER_COST.toLocaleString()}* guild bank`;
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (!g.members.includes(resolved.id)) return '❌ Not a member.';
  if (g.officers.includes(resolved.id)) return 'Already officer.';
  g.bank -= OFFICER_COST;
  g.officers.push(resolved.id);
  saveDb();
  return `⭐ *${resolved.player.name}* is now an officer (−$${OFFICER_COST.toLocaleString()})`;
}

export function guildKick(p: Player, targetRaw: string): string {
  const gid = playerGuildId(p);
  if (!gid) return '❌ No guild.';
  const g = ensureGuild(guilds()[gid]);
  if (g.ownerId !== p.id && !g.officers.includes(p.id)) return '❌ Owner/officer only.';
  const resolved = resolveExistingPlayerId(targetRaw);
  if (!resolved.ok) return resolved.error;
  if (resolved.id === g.ownerId) return '❌ Cannot kick owner.';
  if (!g.members.includes(resolved.id)) return '❌ Not a member.';
  g.members = g.members.filter((id) => id !== resolved.id);
  g.officers = g.officers.filter((id) => id !== resolved.id);
  (resolved.player as any).guildId = null;
  savePlayer(resolved.player);
  saveDb();
  return `👢 Kicked *${resolved.player.name || resolved.id.slice(-4)}*`;
}

export function handleGuildCommand(p: Player, args: string[]): string {
  const sub = (args[0] || '').toLowerCase();
  if (!sub || sub === 'info' || sub === 'status') return guildInfo(p);
  if (sub === 'create') return guildCreate(p, args.slice(1).join(' '));
  if (sub === 'setname' || sub === 'rename') return guildSetName(p, args.slice(1).join(' '));
  if (sub === 'motto') return guildMotto(p, args.slice(1).join(' '));
  if (sub === 'invite') return guildInvite(p, args[1] || '');
  if (sub === 'accept' || sub === 'join') return guildAccept(p);
  if (sub === 'leave') return guildLeave(p);
  if (sub === 'disband') return guildDisband(p);
  if (sub === 'deposit' || sub === 'dep') return guildDeposit(p, args[1] || '');
  if (sub === 'upgrade' || sub === 'up') return guildUpgrade(p, args[1] || '');
  if (sub === 'bond' || sub === 'warbond') return guildWarBond(p);
  if (sub === 'battle' || sub === 'war') return guildBattle(p, args[1] || '');
  if (sub === 'promote') return guildPromote(p, args[1] || '');
  if (sub === 'kick') return guildKick(p, args[1] || '');
  if (sub === 'bank') {
    const gid = playerGuildId(p);
    if (!gid) return '❌ No guild.';
    const g = ensureGuild(guilds()[gid]);
    return `🏦 $${g.bank.toLocaleString()} / ${bankCap(g).toLocaleString()}`;
  }
  return guildInfo(p);
}

export function handleTerritoryCommand(p: Player, args: string[]): string {
  const sub = (args[0] || 'list').toLowerCase();
  if (sub === 'list' || sub === 'ls') return territoryList();
  if (sub === 'buy' || sub === 'claim') return territoryBuy(p, args[1] || '');
  return territoryList();
}
