import { getOrCreatePlayer, savePlayer, getPlayerCount, getAllPlayers, Player, resolveExistingPlayerId, resolveCanonicalId, getPlayer } from './player.js';
import { getDb, saveDb, forceBackup, dataStatus } from '../db/database.js';
import { getCityHeat } from './city.js';
import { adminSetHearts, healHearts } from './health.js';
import { getRecentCommands, getCommandStats } from '../systems/commandLogger.js';

export function isAdmin(id: string): boolean {
  const clean = String(id || '').replace(/[^0-9]/g, '');
  if (!clean) return false;
  try {
    const p = getPlayer(clean) ?? getOrCreatePlayer(clean);
    return !!p?.isAdmin;
  } catch {
    return false;
  }
}

function logAdmin(adminId: string, action: string, targetId: string | null, details: string) {
  const db = getDb();
  if (!db.admin_log) db.admin_log = [];
  if (!db.nextIds) db.nextIds = { crime: 1, admin: 1, command: 1 };
  db.admin_log.push({
    id: db.nextIds.admin++,
    admin_id: adminId,
    action,
    target_id: targetId,
    details,
    created_at: Date.now()
  });
  saveDb();
}

export function promoteToAdmin(playerId: string): string {
  const p = getOrCreatePlayer(playerId);
  if (p.isAdmin) return '🔐 Already admin.';
  p.isAdmin = true;
  savePlayer(p);
  logAdmin(playerId, 'self_promote', playerId, '.admin01');
  return `🔐 *ADMIN ACCESS GRANTED*
━━━━━━━━━━━━━━━━━━━━
Permanent. Use .adm`;
}

/** Economy health model */
export function calcEconomyHealth(): {
  players: number;
  totalCash: number;
  totalBank: number;
  totalNet: number;
  estimated: number;
  ratio: number;
  status: 'healthy' | 'warm' | 'overheated' | 'critical';
  avgNet: number;
} {
  const players = getAllPlayers().filter(p => !p.banned);
  let totalCash = 0;
  let totalBank = 0;
  for (const p of players) {
    totalCash += p.cash || 0;
    totalBank += p.bank || 0;
  }
  const totalNet = totalCash + totalBank;
  const n = Math.max(1, players.length);
  // Expected liquidity curve: base bankroll + progressive play allowance
  // ~$25k starter + $8k per level-equivalent + soft cap pressure
  let estimated = 0;
  for (const p of players) {
    const lvl = Math.max(1, p.level || 1);
    const classL = Math.max(1, p.classLevel || 1);
    // Higher soft target — mid/late game players are expected to hold more liquidity
    estimated += 120000 + lvl * 85000 + classL * 140000 + Math.min(lvl, 50) * 45000 + Math.min(lvl, 100) * 35000;
  }
  // floor estimated to avoid div zero weirdness
  estimated = Math.max(estimated, n * 250000);
  const ratio = totalNet / estimated;
  let status: 'healthy' | 'warm' | 'overheated' | 'critical' = 'healthy';
  if (ratio >= 3.5) status = 'critical';
  else if (ratio >= 2.2) status = 'overheated';
  else if (ratio >= 1.4) status = 'warm';
  return {
    players: n,
    totalCash,
    totalBank,
    totalNet,
    estimated: Math.floor(estimated),
    ratio,
    status,
    avgNet: Math.floor(totalNet / n)
  };
}

export function formatEconomy(): string {
  const e = calcEconomyHealth();
  const icon = e.status === 'healthy' ? '🟢' : e.status === 'warm' ? '🟡' : e.status === 'overheated' ? '🟠' : '🔴';
  return `📊 *ECONOMY HEALTH*
━━━━━━━━━━━━━━━━━━━━
Players     ${e.players}
Cash        $${e.totalCash.toLocaleString()}
Bank        $${e.totalBank.toLocaleString()}
Total net   $${e.totalNet.toLocaleString()}
Estimated   $${e.estimated.toLocaleString()}
Avg net     $${e.avgNet.toLocaleString()}
Ratio       ${e.ratio.toFixed(2)}x  ${icon} ${e.status.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━
.admin drain — if critical/overheated
Pulls total down toward estimated
Equal share from every non-banned player`;
}

/**
 * Drain excess liquidity equally across all players until near estimated.
 * Returns public announcement text (players all "tagged" in message).
 */
export function drainEconomy(adminId: string): string {
  const e = calcEconomyHealth();
  if (e.status === 'healthy' || e.status === 'warm') {
    return `✅ Economy ${e.status} (${e.ratio.toFixed(2)}x). Drain not required.`;
  }
  const excess = e.totalNet - e.estimated;
  if (excess <= 0) return '✅ No excess to drain.';

  const players = getAllPlayers().filter(p => !p.banned);
  const n = players.length;
  if (!n) return '❌ No players.';

  // equal share of excess removed from each player's cash then bank
  const perPlayer = Math.floor(excess / n);
  const lines: string[] = [];
  let actuallyRemoved = 0;

  for (const p of players) {
    let need = perPlayer;
    let took = 0;
    if (p.cash > 0 && need > 0) {
      const fromCash = Math.min(p.cash, need);
      p.cash -= fromCash;
      need -= fromCash;
      took += fromCash;
    }
    if (p.bank > 0 && need > 0) {
      const fromBank = Math.min(p.bank, need);
      p.bank -= fromBank;
      need -= fromBank;
      took += fromBank;
    }
    actuallyRemoved += took;
    const name = (p as any).usernameSet && p.name ? p.name : `...${p.id.slice(-4)}`;
    lines.push(`▸ @${name}  −$${took.toLocaleString()}`);
    savePlayer(p);
  }

  logAdmin(adminId, 'drain', null, `removed ${actuallyRemoved} toward estimated ${e.estimated}`);
  const after = calcEconomyHealth();

  return `🩸 *ECONOMY DRAIN EXECUTED*
━━━━━━━━━━━━━━━━━━━━
Target estimated: $${e.estimated.toLocaleString()}
Excess removed:   $${actuallyRemoved.toLocaleString()}
Share per player: ~$${perPlayer.toLocaleString()}
New ratio: ${after.ratio.toFixed(2)}x (${after.status})

*TAGGED PLAYERS*
${lines.slice(0, 30).join('\n')}
${lines.length > 30 ? `… +${lines.length - 30} more\n` : ''}━━━━━━━━━━━━━━━━━━━━
All players share the correction equally.`;
}


/** Parse 5000, 5,000, 50k, 1.5m, 2b */
export function parseMoney(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) {
    const n = parseInt(s.replace(/[^0-9-]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  let n = parseFloat(m[1]);
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'k') n *= 1_000;
  else if (suf === 'm') n *= 1_000_000;
  else if (suf === 'b') n *= 1_000_000_000;
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function resolveAdminTarget(raw: string, createIfMissing = false): Player | null {
  const input = String(raw || '').trim();
  if (!input) return null;
  // strip leading @
  const cleaned = input.replace(/^@+/, '');

  const resolved = resolveExistingPlayerId(cleaned);
  if (resolved.ok) return resolved.player;

  const digits = cleaned.replace(/[^0-9]/g, '');
  if (digits) {
    const byId = getPlayer(digits);
    if (byId) return byId;
    const canonicalId = resolveCanonicalId(digits);
    if (canonicalId) {
      const byCanonical = getPlayer(canonicalId);
      if (byCanonical) return byCanonical;
    }
    // last-4 / last-6 match among known players
    const all = getAllPlayers();
    const hits = all.filter(p => p.id.endsWith(digits) || p.id.includes(digits));
    if (hits.length === 1) return hits[0];
    // match by name
  }
  const byName = getAllPlayers().find(
    p => (p.name || '').toLowerCase() === cleaned.toLowerCase()
  );
  if (byName) return byName;

  if (createIfMissing && digits) {
    return getOrCreatePlayer(digits);
  }
  return null;
}

/** Pull target from args: prefer explicit mention ids, else first non-keyword token */
function pickTarget(args: string[], mentioned: string[] = []): Player | null {
  for (const m of mentioned) {
    const t = resolveAdminTarget(m, true);
    if (t) return t;
  }
  const skip = new Set([
    'give', 'set', 'debit', 'ban', 'unban', 'inspect', 'make', 'promote', 'demote',
    'cash', 'money', 'xp', 'heat', 'wanted', 'level', 'admin', 'bank', 'hearts', 'health'
  ]);
  for (const a of args) {
    const low = a.toLowerCase().replace(/^@+/, '');
    if (skip.has(low)) continue;
    if (/^\d+[kmb]?$/i.test(low.replace(/,/g, ''))) continue; // amount-like
    const t = resolveAdminTarget(a, true);
    if (t) return t;
  }
  return null;
}

function pickAmount(args: string[]): number | null {
  // scan from the end for a money-like token
  for (let i = args.length - 1; i >= 0; i--) {
    const n = parseMoney(args[i]);
    if (n != null && n !== 0) return n;
  }
  return null;
}

function pickKind(args: string[], fallback: string): string {
  for (const a of args) {
    const low = a.toLowerCase();
    if (['cash', 'money', 'xp', 'heat', 'wanted', 'level', 'bank', 'hearts', 'health'].includes(low)) {
      if (low === 'money') return 'cash';
      if (low === 'health' || low === 'hearts') return 'hearts';
      return low;
    }
  }
  return fallback;
}

export function runAdmin(adminId: string, args: string[], mentioned: string[] = []): string {
  if (!args.length || args[0] === 'panel' || args[0] === 'help') {
    const e = calcEconomyHealth();
    const icon = e.status === 'healthy' ? '🟢' : e.status === 'warm' ? '🟡' : e.status === 'overheated' ? '🟠' : '🔴';
    return `🔐 *ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━
Players: ${getPlayerCount()}
Economy: ${icon} ${e.status} (${e.ratio.toFixed(2)}x)
Net $${e.totalNet.toLocaleString()} / est $${e.estimated.toLocaleString()}

*Economy*
.admin economy
.admin drain
.admin heat drain

*Players*
.admin give @user cash 500k
.admin give @user 1m          (cash default)
.admin set @user level 20
.admin set @user cash 0
.admin debit @user 50k
.admin make @user admin
.admin demote @user
.admin addhealth @user 3
.admin ban @user [reason]
.admin unban @user
.admin inspect @user

*Data*\n.admin backup\n.admin data\n\n*Logs*
.admin cmds
.admin cmdstats
━━━━━━━━━━━━━━━━━━━━
Amounts: 5000 · 50k · 1m · 1.5m`;
  }

  const sub = args[0].toLowerCase();
  const rest = args.slice(1);

  if (sub === 'economy' || sub === 'eco' || sub === 'health') {
    return formatEconomy();
  }

  if (sub === 'drain') {
    return drainEconomy(adminId);
  }

  if (sub === 'heat' && (rest[0] || '').toLowerCase() === 'drain') {
    const db = getDb() as any;
    if (!db.city) db.city = { heat: 0, lockdownUntil: 0, lastEvent: '', news: [] };
    const before = db.city.heat || 0;
    db.city.heat = 0;
    db.city.lockdownUntil = 0;
    db.city.lastEvent = 'Admin cooled the city.';
    saveDb();
    logAdmin(adminId, 'heat_drain', null, `was ${before}`);
    return `❄️ *CITY HEAT DRAINED*
━━━━━━━━━━━━━━━━━━━━
Was ${before} → now 0
Lockdown cleared.`;
  }

  if (sub === 'addhealth' || sub === 'addheart' || sub === 'heal') {
    const tplayer = pickTarget(rest, mentioned) || resolveAdminTarget(rest[0], true);
    if (!tplayer) return '❌ Could not find that player. Tag them or use their number.';
    const amt = pickAmount(rest) ?? 3;
    const msg = adminSetHearts(tplayer, Math.max(0, Math.min(3, amt)));
    logAdmin(adminId, 'addhealth', tplayer.id, String(amt));
    return `💉 ${msg}
Target ${tplayer.name || '...' + tplayer.id.slice(-6)}`;
  }

  // .admin make @user admin  |  .admin promote @user
  if (sub === 'make' || sub === 'promote') {
    const t = pickTarget(rest, mentioned) || resolveAdminTarget(rest[0], true);
    if (!t) return '❌ Could not find that player.\nUsage: .admin make @user admin';
    // optional trailing "admin" word ignored
    if (t.isAdmin) return `🔐 ${t.name || t.id.slice(-6)} is already admin.`;
    t.isAdmin = true;
    savePlayer(t);
    logAdmin(adminId, 'promote', t.id, 'make admin');
    return `🔐 *PROMOTED*
━━━━━━━━━━━━━━━━━━━━
${t.name || 'Player'} (...${t.id.slice(-6)}) is now admin.
They can use .admin panel`;
  }

  if (sub === 'demote') {
    const t = pickTarget(rest, mentioned) || resolveAdminTarget(rest[0], true);
    if (!t) return '❌ Could not find that player.';
    if (t.id === adminId) return '❌ Cannot demote yourself.';
    t.isAdmin = false;
    savePlayer(t);
    logAdmin(adminId, 'demote', t.id, '');
    return `⬇️ Demoted ...${t.id.slice(-6)}`;
  }

  if (sub === 'give') {
    // Flexible:
    // .admin give @user cash 500k
    // .admin give @user 500k
    // .admin give cash @user 1m
    // .admin give 500k @user cash
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.\nUsage: .admin give @user cash 500k';
    const kind = pickKind(rest, 'cash');
    const amount = pickAmount(rest);
    if (amount == null || amount <= 0) {
      return '❌ Bad amount. Examples: 5000 · 50k · 1m · 1.5m';
    }
    if (kind === 'cash') {
      t.cash = (t.cash || 0) + amount;
    } else if (kind === 'xp') {
      t.xp = (t.xp || 0) + amount;
    } else if (kind === 'bank') {
      t.bank = (t.bank || 0) + amount;
    } else {
      return '❌ give supports: cash · bank · xp\n.admin give @user cash 500k';
    }
    savePlayer(t);
    logAdmin(adminId, 'give', t.id, `${kind} ${amount}`);
    return `✅ Gave *${kind}* $${amount.toLocaleString()} → ${t.name || '...' + t.id.slice(-6)}
💰 Cash $${t.cash.toLocaleString()} · Bank $${(t.bank || 0).toLocaleString()}`;
  }

  if (sub === 'set') {
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.\nUsage: .admin set @user cash 100k';
    const kind = pickKind(rest, 'cash');
    const v = pickAmount(rest);
    if (v == null) return '❌ Bad value. Use a number like 50 or 100k';
    if (kind === 'heat') t.heat = Math.max(0, Math.min(100, v));
    else if (kind === 'wanted') t.wanted = Math.max(0, Math.min(100, v));
    else if (kind === 'cash') t.cash = Math.max(0, v);
    else if (kind === 'bank') t.bank = Math.max(0, v);
    else if (kind === 'level') t.level = Math.max(1, v);
    else if (kind === 'hearts') adminSetHearts(t, Math.max(0, Math.min(3, v)));
    else return '❌ set: heat · wanted · cash · bank · level · hearts';
    savePlayer(t);
    logAdmin(adminId, 'set', t.id, `${kind}=${v}`);
    return `✅ Set *${kind}* = ${v.toLocaleString()} on ${t.name || '...' + t.id.slice(-6)}`;
  }

  if (sub === 'debit') {
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.';
    const amount = pickAmount(rest);
    if (amount == null || amount <= 0) return '❌ Bad amount.';
    const fromCash = Math.min(t.cash || 0, amount);
    const remaining = amount - fromCash;
    t.cash = Math.max(0, (t.cash || 0) - fromCash);
    t.bank = Math.max(0, (t.bank || 0) - remaining);
    savePlayer(t);
    logAdmin(adminId, 'debit', t.id, `${amount}`);
    return `💸 Debited $${amount.toLocaleString()} from ${t.name || '...' + t.id.slice(-6)}`;
  }

  if (sub === 'ban') {
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.';
    t.banned = true;
    t.banReason = rest.filter(a => !a.startsWith('@') && parseMoney(a) == null).slice(1).join(' ') || 'Banned by admin';
    savePlayer(t);
    logAdmin(adminId, 'ban', t.id, t.banReason || '');
    return `🚫 Banned ${t.name || '...' + t.id.slice(-6)}`;
  }

  if (sub === 'unban') {
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.';
    t.banned = false;
    t.banReason = undefined;
    savePlayer(t);
    logAdmin(adminId, 'unban', t.id, '');
    return `✅ Unbanned ${t.name || '...' + t.id.slice(-6)}`;
  }

  if (sub === 'inspect') {
    const t = pickTarget(rest, mentioned);
    if (!t) return '❌ Could not find that player.';
    return '```\n' + JSON.stringify({
      id: t.id, name: t.name, role: t.role, level: t.level, classLevel: t.classLevel,
      cash: t.cash, bank: t.bank, heat: t.heat, wanted: t.wanted,
      banned: t.banned, isAdmin: t.isAdmin, businesses: t.businesses?.length,
      hearts: (t as any).hearts, achievements: t.achievements?.length
    }, null, 2) + '\n```';
  }

  if (sub === 'backup') {
    const path = forceBackup();
    return `💾 Backup saved:\n\`${path}\``;
  }
  if (sub === 'data' || sub === 'datastatus') return dataStatus();
  if (sub === 'cmds') return getRecentCommands();
  if (sub === 'cmdstats') return getCommandStats();

  return 'Unknown. .admin panel';
}

