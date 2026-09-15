import fs from 'fs';
import path from 'path';

/**
 * Persistent player storage.
 * Railway: mount a volume at /data and set SYNDICATE_DATA_DIR=/data
 * Local default: ./data/syndicates.json
 */
const DATA_DIR =
  process.env.SYNDICATE_DATA_DIR ||
  process.env.DATA_DIR ||
  path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'syndicates.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export type DbShape = {
  players: Record<string, any>;
  crime_log: any[];
  admin_log: any[];
  command_log: any[];
  nextIds: { crime: number; admin: number; command: number };
  city?: any;
  crypto?: any;
  portfolios?: Record<string, any>;
  heistLobbies?: any[];
  groupConfig?: Record<string, any>;
  activeEvent?: any;
  bounties?: any[];
  contracts?: any[];
  classState?: Record<string, any>;
  manhunts?: Record<string, any>;
  [k: string]: any;
};

let cache: DbShape | null = null;
let lastBackupAt = 0;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function defaultDb(): DbShape {
  return {
    players: {},
    crime_log: [],
    admin_log: [],
    command_log: [],
    nextIds: { crime: 1, admin: 1, command: 1 }
  };
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbPath(): string {
  return DB_FILE;
}

export function getDb(): DbShape {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
      // try latest backup
      const backups = listBackups();
      if (backups.length) {
        try {
          cache = JSON.parse(fs.readFileSync(backups[0], 'utf8'));
        } catch {
          cache = defaultDb();
        }
      } else {
        cache = defaultDb();
      }
    }
  } else {
    cache = defaultDb();
  }
  if (!cache!.players) cache!.players = {};
  if (!cache!.crime_log) cache!.crime_log = [];
  if (!cache!.admin_log) cache!.admin_log = [];
  if (!cache!.command_log) cache!.command_log = [];
  if (!cache!.nextIds) cache!.nextIds = { crime: 1, admin: 1, command: 1 };
  return cache!;
}

function listBackups(): string[] {
  ensureDir();
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(BACKUP_DIR, f))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Snapshot every 10 minutes max on save */
function maybeBackup() {
  const t = Date.now();
  if (t - lastBackupAt < 10 * 60 * 1000) return;
  lastBackupAt = t;
  try {
    ensureDir();
    const name = `syndicates_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, name));
    // keep last 20
    const all = listBackups();
    for (const old of all.slice(20)) {
      try { fs.unlinkSync(old); } catch { /* */ }
    }
  } catch (e) {
    console.error('backup failed', e);
  }
}

export function saveDb() {
  if (!cache) return;
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
  maybeBackup();
}

export function forceBackup(): string {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) saveDb();
  const name = `manual_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const dest = path.join(BACKUP_DIR, name);
  fs.copyFileSync(DB_FILE, dest);
  return dest;
}

export function closeDb() {
  saveDb();
  cache = null;
}

export function dataStatus(): string {
  const db = getDb();
  const n = Object.keys(db.players || {}).length;
  const size = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
  const backups = listBackups().length;
  return `💾 *PLAYER DATA*
━━━━━━━━━━━━━━━━━━━━
Path: \`${DB_FILE}\`
Players: *${n}*
File size: ${(size / 1024).toFixed(1)} KB
Backups: ${backups}
Data dir: \`${DATA_DIR}\`
━━━━━━━━━━━━━━━━━━━━
Railway: attach Volume → mount \'/data\'
Env: SYNDICATE_DATA_DIR=/data
.admin backup — force snapshot`;
}
