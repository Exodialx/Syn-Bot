import { getDb, saveDb } from '../db/database.js';

export type Player = {
  id: string;
  name: string;                 // display / unique username
  usernameSet: boolean;         // true after first successful .set name
  nameChangesUsed: number;      // free first set does not count; subsequent need card
  role: 'Businessman' | 'Mafia' | 'Hitman' | 'Unassigned';
  level: number;
  xp: number;
  classLevel: number;
  cash: number;
  bank: number;
  heat: number;
  wanted: number;
  inPrison: boolean;
  prisonUntil: number;
  banned: boolean;
  banReason?: string;
  isAdmin: boolean;
  achievements: string[];
  // combat / role stats
  strength: number;
  defense: number;
  stealth: number;
  charisma: number;
  intelligence: number;
  luck: number;
  security: number;
  // businesses owned (ids)
  businesses: string[];
  // last rob/raid times
  lastRob: number;
  lastRaid: number;
  lastHit: number;
  lastDaily?: string;
  dailyStreak?: number;
  classXp?: number;
  lastHeatDecay?: number;
  registered?: boolean;
  createdAt: number;
  lastActive: number;
};

function defaults(id: string): Player {
  const now = Date.now();
  return {
    id,
    name: '',                   // empty until .set name
    usernameSet: false,
    nameChangesUsed: 0,
    role: 'Unassigned',
    level: 1,
    xp: 0,
    classLevel: 1,
    cash: 15000,
    bank: 0,
    heat: 0,
    wanted: 0,
    inPrison: false,
    prisonUntil: 0,
    banned: false,
    isAdmin: false,
    achievements: [],
    strength: 5,
    defense: 5,
    stealth: 5,
    charisma: 5,
    intelligence: 5,
    luck: 5,
    security: 5,
    businesses: [],
    lastRob: 0,
    lastRaid: 0,
    lastHit: 0,
    lastDaily: undefined,
    dailyStreak: 0,
    classXp: 0,
    lastHeatDecay: now,
    registered: false,          // becomes true only after username is set
    createdAt: now,
    lastActive: now
  };
}


/** Personal heat & wanted decay over time */
export function decayPersonalHeat(p: Player) {
  const now = Date.now();
  const last = p.lastHeatDecay || p.lastActive || now;
  const mins = (now - last) / 60000;
  if (mins < 2) return;
  // ~1.2 heat per 5 min, wanted slower
  const heatDrop = Math.floor(mins / 5) * 1.2;
  const wantedDrop = Math.floor(mins / 12) * 1;
  if (heatDrop > 0) p.heat = Math.max(0, Math.floor(p.heat - heatDrop));
  if (wantedDrop > 0) p.wanted = Math.max(0, Math.floor(p.wanted - wantedDrop));
  // prison auto-clear
  if (p.inPrison && now >= p.prisonUntil) {
    p.inPrison = false;
    p.prisonUntil = 0;
  }
  p.lastHeatDecay = now;
}


/** True only if this id already has a save (used the bot before) */
export function playerExists(id: string): boolean {
  const db = getDb();
  return !!db.players[id];
}

/** Get player without creating. Returns null if never registered. */

/**
 * Identity aliases — map LID / alternate WhatsApp ids → canonical player id.
 * Stops "not registered" when the same human is seen under two JIDs.
 */
export function linkIdentities(ids: string[]): string {
  const cleaned = [...new Set(ids.map(x => String(x).replace(/[^0-9]/g, '')).filter(x => x.length >= 8 && x.length <= 15))];
  if (!cleaned.length) return '';
  const db = getDb() as any;
  if (!db.identityMap) db.identityMap = {};

  const hasPlayerRow = cleaned.filter(id => !!db.players?.[id]);
  const phoneLike = cleaned.filter(id => /^[0-9]{10,15}$/.test(id));
  let canonical = hasPlayerRow[0] || phoneLike[0] || cleaned[0];

  for (const id of cleaned) {
    const mapped = db.identityMap[id];
    if (mapped && mapped !== id) {
      const existingCanonical = db.identityMap[mapped] || mapped;
      if (existingCanonical !== canonical && canonical !== existingCanonical && existingCanonical !== id) {
        console.warn('linkIdentities conflict:', { id, canonical, mapped, existingCanonical });
        continue;
      }
      canonical = existingCanonical || canonical;
    }

    if (db.players?.[id] && db.players?.[canonical] && id !== canonical) {
      const existingId = db.players[canonical]?.id;
      if (existingId && existingId !== id) {
        console.warn('linkIdentities conflicting canonical player:', { id, canonical, existing: existingId });
        continue;
      }
    }
  }

  const phoneId = cleaned.find(id => /^[0-9]{10,15}$/.test(id) && !!db.players?.[id]);
  const lidIds = cleaned.filter(id => !/^[0-9]{10,15}$/.test(id) && !!db.players?.[id]);

  for (const id of cleaned) {
    if (id === canonical) continue;
    if (db.players?.[id] && db.players?.[canonical]) {
      const isIdPhone = /^[0-9]{10,15}$/.test(id);
      const isCanonicalPhone = /^[0-9]{10,15}$/.test(canonical);

      if (isCanonicalPhone && !isIdPhone) {
        try {
          mergePlayerRows(db.players[canonical], db.players[id]);
          db.identityMap[id] = canonical;
          delete db.players[id];
        } catch (error) {
          console.warn('linkIdentities refusing merge due to conflict:', { loser: id, winner: canonical, reason: (error as Error).message });
        }
        continue;
      }

      if (isCanonicalPhone && isIdPhone) {
        console.warn('linkIdentities refusing merge between phone numbers:', { loser: id, winner: canonical, phoneId, lidIds });
        continue;
      }

      if (!isCanonicalPhone && !isIdPhone) {
        console.warn('linkIdentities refusing merge between LIDs:', { loser: id, winner: canonical, phoneId, lidIds });
        continue;
      }
    } else if (db.players?.[id] && !db.players?.[canonical]) {
      db.identityMap[id] = canonical;
      db.players[canonical] = db.players[id];
      db.players[canonical].id = canonical;
      delete db.players[id];
    }
  }
  saveDb();
  return canonical;
}

function mergePlayerRows(primary: Player, other: Player) {
  if (primary.name && other.name && primary.name !== other.name) {
    throw new Error(`mergePlayerRows: conflicting names: primary=${primary.name}, other=${other.name}`);
  }
  if (primary.role && other.role && primary.role !== 'Unassigned' && other.role !== 'Unassigned' && primary.role !== other.role) {
    throw new Error(`mergePlayerRows: conflicting roles: primary=${primary.role}, other=${other.role}`);
  }

  primary.cash = (primary.cash || 0) + (other.cash || 0);
  primary.bank = (primary.bank || 0) + (other.bank || 0);
  primary.xp = (primary.xp || 0) + (other.xp || 0);
  primary.classXp = (primary.classXp || 0) + (other.classXp || 0);

  primary.level = Math.max(primary.level || 1, other.level || 1);
  primary.classLevel = Math.max(primary.classLevel || 1, other.classLevel || 1);

  primary.lastActive = Math.max(primary.lastActive || 0, other.lastActive || 0);
  primary.lastDaily = primary.lastDaily && other.lastDaily ? (primary.lastDaily > other.lastDaily ? primary.lastDaily : other.lastDaily) : (primary.lastDaily || other.lastDaily);
  primary.lastRob = Math.max(primary.lastRob || 0, other.lastRob || 0);
  primary.lastRaid = Math.max(primary.lastRaid || 0, other.lastRaid || 0);
  primary.lastHit = Math.max(primary.lastHit || 0, other.lastHit || 0);
  primary.lastHeatDecay = Math.max(primary.lastHeatDecay || 0, other.lastHeatDecay || 0);
  primary.createdAt = Math.max(primary.createdAt || 0, other.createdAt || 0);
  primary.prisonUntil = Math.max(primary.prisonUntil || 0, other.prisonUntil || 0);

  const ach = new Set([...(primary.achievements || []), ...(other.achievements || [])]);
  primary.achievements = [...ach];
  const biz = new Set([...(primary.businesses || []), ...(other.businesses || [])]);
  primary.businesses = [...biz];

  primary.usernameSet = !!primary.usernameSet || !!other.usernameSet;
  primary.registered = !!primary.registered || !!other.registered;
  primary.isAdmin = !!primary.isAdmin || !!other.isAdmin;
  primary.banned = !!primary.banned || !!other.banned;
  primary.inPrison = !!primary.inPrison || !!other.inPrison;

  primary.nameChangesUsed = (primary.nameChangesUsed || 0) + (other.nameChangesUsed || 0);
  primary.dailyStreak = Math.max(primary.dailyStreak || 0, other.dailyStreak || 0);

  if (other.name && !primary.name) primary.name = other.name;
  if (other.role && other.role !== 'Unassigned' && (!primary.role || primary.role === 'Unassigned')) primary.role = other.role;

  const unhandled: string[] = [];
  for (const field of Object.keys(other) as Array<keyof Player>) {
    if (field === 'id') continue;
    if (
      field === 'name' ||
      field === 'usernameSet' ||
      field === 'nameChangesUsed' ||
      field === 'role' ||
      field === 'level' ||
      field === 'xp' ||
      field === 'classLevel' ||
      field === 'cash' ||
      field === 'bank' ||
      field === 'heat' ||
      field === 'wanted' ||
      field === 'inPrison' ||
      field === 'prisonUntil' ||
      field === 'banned' ||
      field === 'banReason' ||
      field === 'isAdmin' ||
      field === 'achievements' ||
      field === 'strength' ||
      field === 'defense' ||
      field === 'stealth' ||
      field === 'charisma' ||
      field === 'intelligence' ||
      field === 'luck' ||
      field === 'security' ||
      field === 'businesses' ||
      field === 'lastRob' ||
      field === 'lastRaid' ||
      field === 'lastHit' ||
      field === 'lastDaily' ||
      field === 'dailyStreak' ||
      field === 'classXp' ||
      field === 'lastHeatDecay' ||
      field === 'registered' ||
      field === 'createdAt' ||
      field === 'lastActive'
    ) continue;
    unhandled.push(String(field));
  }

  if (unhandled.length > 0) {
    console.warn('mergePlayerRows: unhandled fields preserved from primary:', { primaryId: primary.id, otherId: other.id, fields: unhandled });
  }
}

export function resolveCanonicalId(id: string): string {
  const clean = String(id).replace(/[^0-9]/g, '');
  const db = getDb() as any;
  if (!db.identityMap) db.identityMap = {};
  return db.identityMap[clean] || clean;
}

export function isRegistered(p: Player | null | undefined): boolean {
  if (!p) return false;
  if (p.usernameSet) return true;
  if (p.registered) return true;
  // Legacy / recovered profiles: real name already set
  if (p.name && p.name.length >= 3 && p.name !== p.id.slice(-4) && !/^User/i.test(p.name)) {
    p.usernameSet = true;
    p.registered = true;
    savePlayer(p);
    return true;
  }
  return false;
}


export function getPlayer(id: string): Player | null {
  const db = getDb();
  if (!db.players[id]) return null;
  const p = db.players[id] as Player;
  // backfill
  if (p.usernameSet == null || p.usernameSet === false) {
    if (p.name && p.name.length >= 3 && p.name !== (p.id || id).slice(-4) && !/^User/i.test(p.name)) {
      p.usernameSet = true;
      p.registered = true;
    } else if (p.usernameSet == null) {
      p.usernameSet = false;
    }
  }
  if (p.nameChangesUsed == null) p.nameChangesUsed = 0;
  p.lastActive = Date.now();
  decayPersonalHeat(p);
  return p;
}

/** Resolve a target id from raw text or mention digits. Does NOT create. */
export function resolveExistingPlayerId(raw: string): { ok: true; id: string; player: Player } | { ok: false; error: string } {
  const input = String(raw || '').trim();
  if (!input) {
    return { ok: false, error: '❌ Mention a player, use their number, or their username.' };
  }

  const db = getDb() as any;
  const digits = input.replace(/[^0-9]/g, '');

  // 1) Direct / canonical phone-or-lid
  if (digits.length >= 8) {
    const cid = resolveCanonicalId(digits);
    let pl = getPlayer(cid) || getPlayer(digits);
    if (pl) return { ok: true, id: pl.id, player: pl };

    // 2) Suffix match (last 7–10 digits) — handles country-code / mention truncation
    const players = Object.values(db.players || {}) as Player[];
    const suffixHits = players.filter(x => x.id.endsWith(digits) || digits.endsWith(x.id.slice(-10)));
    if (suffixHits.length === 1) {
      return { ok: true, id: suffixHits[0].id, player: suffixHits[0] };
    }
    if (suffixHits.length > 1) {
      // prefer registered
      const reg = suffixHits.find(x => isRegistered(x));
      if (reg) return { ok: true, id: reg.id, player: reg };
    }
  }

  // 3) Username match (case-insensitive)
  const nameKey = input.replace(/^@/, '').toLowerCase();
  if (nameKey.length >= 2) {
    const players = Object.values(db.players || {}) as Player[];
    const byName = players.filter(x => (x.name || '').toLowerCase() === nameKey);
    if (byName.length === 1) return { ok: true, id: byName[0].id, player: byName[0] };
    if (byName.length > 1) {
      const reg = byName.find(x => isRegistered(x)) || byName[0];
      return { ok: true, id: reg.id, player: reg };
    }
  }

  // 4) Identity map values pointing at a known player
  if (digits.length >= 8 && db.identityMap) {
    for (const [alias, canon] of Object.entries(db.identityMap as Record<string, string>)) {
      if (alias.endsWith(digits.slice(-8)) || digits.endsWith(alias.slice(-8))) {
        const pl = getPlayer(String(canon));
        if (pl) return { ok: true, id: pl.id, player: pl };
      }
    }
  }

  return {
    ok: false,
    error: '❌ Could not find that player.\\nTry @mention, their full number, or exact username.\\nThey must have used .set name at least once.'
  };
}


export function getOrCreatePlayer(id: string): Player {
  const db = getDb();
  if (!db.players[id]) {
    db.players[id] = defaults(id);
    saveDb();
  }
  const p = db.players[id] as Player;
  // backfill new fields for old saves
  if (p.strength == null) p.strength = 5;
  if (p.defense == null) p.defense = 5;
  if (p.stealth == null) p.stealth = 5;
  if (p.charisma == null) p.charisma = 5;
  if (p.intelligence == null) p.intelligence = 5;
  if (p.luck == null) p.luck = 5;
  if (p.security == null) p.security = 5;
  if (!p.businesses) p.businesses = [];
  if (p.lastRob == null) p.lastRob = 0;
  if (p.lastRaid == null) p.lastRaid = 0;
  if (p.lastHit == null) p.lastHit = 0;
  if (p.isAdmin == null) p.isAdmin = false;
  if (!p.achievements) p.achievements = [];
  if (p.usernameSet == null || p.usernameSet === false) {
    if (p.name && p.name.length >= 3 && p.name !== (p.id || id).slice(-4) && !/^User/i.test(p.name)) {
      p.usernameSet = true;
      p.registered = true;
    } else if (p.usernameSet == null) {
      p.usernameSet = false;
    }
  }
  if (p.nameChangesUsed == null) p.nameChangesUsed = 0;
  if (p.registered == null) p.registered = p.usernameSet;
  p.lastActive = Date.now();
  decayPersonalHeat(p);
  return p;
}

export function savePlayer(p: Player) {
  const db = getDb();
  db.players[p.id] = p;
  saveDb();
}

export function savePlayers() {
  saveDb();
}

export function getAllPlayers(): Player[] {
  const db = getDb();
  return Object.values(db.players) as Player[];
}

export function getPlayerCount(): number {
  return Object.keys(getDb().players).length;
}

/** Check if a username is already taken (case-insensitive) by another player */
export function isUsernameTaken(name: string, excludeId?: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return true;
  const players = getAllPlayers();
  return players.some(p => p.id !== excludeId && p.name && p.name.toLowerCase() === lower);
}

/**
 * Set or change a player's unique username.
 * First set is free. Subsequent changes require a Name Change Card (caller must consume it).
 * Returns success message or error string.
 */
export function setUsername(p: Player, newName: string, consumeCard: boolean): string {
  const cleaned = newName.trim().replace(/[^\w\s\-_.]/g, '').slice(0, 20);
  if (cleaned.length < 3) return '❌ Name must be 3–20 characters (letters, numbers, _ - .)';
  if (cleaned.length > 20) return '❌ Name too long (max 20)';
  if (isUsernameTaken(cleaned, p.id)) return `❌ Username "${cleaned}" is already taken. Choose another.`;

  const isFirst = !p.usernameSet;
  if (!isFirst && !consumeCard) {
    return `❌ You already set your name once.\nBuy a *Name Change Card* from .shop then use .set name again.`;
  }

  const old = p.name || '(none)';
  p.name = cleaned;
  p.usernameSet = true;
  p.registered = true;
  if (!isFirst) {
    p.nameChangesUsed = (p.nameChangesUsed || 0) + 1;
  }
  savePlayer(p);
  if (isFirst) {
    return `✅ Welcome, *${cleaned}*!\nYour unique name is locked in.\nType .menu to begin.`;
  }
  return `✅ Name changed: ${old} → *${cleaned}*\n(Name Change Card consumed)`;
}

/** Slow XP curve — designed for ~30+ days to level 100 with daily play */
export function xpForLevel(level: number): number {
  // Levels 1-35 fast, then ramps hard
  if (level <= 35) return Math.floor(100 * Math.pow(level, 1.45));
  if (level <= 70) return Math.floor(100 * Math.pow(level, 1.65));
  return Math.floor(100 * Math.pow(level, 1.85));
}

export function addXp(p: Player, amount: number): string[] {
  const notes: string[] = [];
  if (amount <= 0) return notes;
  p.xp = (p.xp || 0) + amount;
  notes.push(`+${amount} XP`);
  while (p.xp >= xpForLevel(p.level + 1) && p.level < 100) {
    p.level += 1;
    notes.push(`🎉 LEVEL UP → ${p.level}`);
    // small cash bonus every 5 levels
    if (p.level % 5 === 0) {
      p.cash += p.level * 2500;
      notes.push(`💰 Milestone bonus +$${(p.level * 2500).toLocaleString()}`);
    }
  }
  return notes;
}


/** Class XP — levels 1-10, slower than general XP */
export function classXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 5) return Math.floor(80 * Math.pow(level, 1.5));
  return Math.floor(80 * Math.pow(level, 1.7));
}

export function addClassXp(p: Player, amount: number, source = ''): string[] {
  const notes: string[] = [];
  if (amount <= 0 || p.role === 'Unassigned') return notes;
  p.classXp = (p.classXp || 0) + amount;
  notes.push(`+${amount} Class XP` + (source ? ` (${source})` : ''));
  while (p.classLevel < 10 && (p.classXp || 0) >= classXpForLevel(p.classLevel + 1)) {
    p.classLevel += 1;
    notes.push(`👑 CLASS LEVEL UP → ${p.classLevel}`);
  }
  savePlayer(p);
  return notes;
}

export function formatProfile(p: Player): string {
  const heatPct = Math.min(100, p.heat);
  const heatBar = '▓'.repeat(Math.round(heatPct / 10)) + '░'.repeat(10 - Math.round(heatPct / 10));
  const adminTag = p.isAdmin ? ' 🔐' : '';
  const roleIcon = p.role === 'Mafia' ? '🕴️' : p.role === 'Hitman' ? '🎯' : p.role === 'Businessman' ? '💼' : '❓';
  const displayName = p.usernameSet && p.name ? p.name : `User...${p.id.slice(-4)}`;
  const badges = (p.achievements || []);
  const badgeLine = badges.length
    ? `🏆 ${badges.length} badges · .achievements`
    : `🏆 No badges yet · .achievements`;

  const db = getDb() as any;
  const inv = ((p as any).inventory || []) as string[];
  const premium = inv.includes('premium');
  const cs = db.classState?.[p.id];
  const sigKills = cs?.signatureKills || 0;
  const crewSize = (cs?.crew || []).length;

  // net worth rank (cash+bank only for speed; full rank via .lb)
  const nw = (p.cash || 0) + (p.bank || 0);
  const players = Object.values(db.players || {}) as Player[];
  const better = players.filter(x => !x.banned && ((x.cash || 0) + (x.bank || 0)) > nw).length;
  const nwRank = `#${better + 1}`;

  const topBizId = (p.businesses || [])[0];
  const topBiz = topBizId ? String(topBizId) : '—';

  const prem = premium ? ' ⭐' : '';
  const revenge = (p as any).revengeToken ? ' · 🩸 revenge ready' : '';
  const hearts = (() => {
    const h = (p as any).hearts != null ? Math.max(0, Math.min(3, (p as any).hearts)) : 3;
    return '❤️'.repeat(h) + '🖤'.repeat(3 - h);
  })();
  const hosp = ((p as any).hospitalUntil || 0) > Date.now() ? ' · 🏥 HOSPITAL' : '';
  const roleLine =
    p.role === 'Hitman' ? `🎯 Signature kills ${sigKills}` :
    p.role === 'Mafia' ? `👥 Crew ${crewSize}` :
    p.role === 'Businessman' ? `💼 Portfolio ${(p.businesses || []).length} fronts` :
    '❓ Pick a role · .role';

  // guild abbreviation
  const guildId = (p as any).guildId;
  const guild = guildId ? (db.guilds?.[guildId] as any) : null;
  const guildTag = guild?.tag || null;

  return `👤 *PROFILE*${adminTag}${prem}
━━━━━━━━━━━━━━━━━━━━
${roleIcon} *${displayName}*${guildTag ? ` [${guildTag}]` : ''}  ·  ${p.role || 'None'}
Lv ${p.level} · Class ${p.classLevel} · Rank ${nwRank}
ID …${p.id.slice(-6)}
${guildTag ? `⚔️ Guild [${guildTag}]${guild?.motto ? ` · _"${guild.motto}"_` : ''}` : ''}
━━━━━━━━━━━━━━━━━━━━
💰 $${(p.cash || 0).toLocaleString()}  🏦 $${(p.bank || 0).toLocaleString()}
🏢 Biz ${(p.businesses || []).length}  ·  Top: ${topBiz}
${roleLine}
━━━━━━━━━━━━━━━━━━━━
⚔️${p.strength} 🛡️${p.defense} 🕴️${p.stealth} 🎭${p.charisma} 🔮${p.intelligence} 🎲${p.luck} 🧲${p.security}
━━━━━━━━━━━━━━━━━━━━
❤️ ${hearts}${hosp}
🔥 [${heatBar}] ${p.heat}  🚨 ${p.wanted}${revenge}
${badgeLine}`;
❤️ ${hearts}${hosp}
🔥 [${heatBar}] ${p.heat}  🚨 ${p.wanted}${revenge}
${badgeLine}`;
}
