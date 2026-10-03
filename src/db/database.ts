import fs from 'fs';
import path from 'path';

const DATA_DIR =
  process.env.SYNDICATE_DATA_DIR ||
  process.env.DATA_DIR ||
  path.join(process.cwd(), 'data');

const DB_FILE = path.join(DATA_DIR, 'syndicates.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const LIVE_CANDIDATES = [
  path.join(process.cwd(), 'syndicates-LIVE.json'),
  path.join(process.cwd(), 'syndicates-live.json'),
  path.join(process.cwd(), 'data', 'syndicates-LIVE.json'),
  path.join(DATA_DIR, 'syndicates-LIVE.json'),
];

export type DbShape = {
  players: Record<string, any>;
  crime_log: any[];
  admin_log: any[];
  command_log: any[];
  nextIds: {
    crime: number;
    admin: number;
    command: number;
  };
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
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function defaultDb(): DbShape {
  return {
    players: {},
    crime_log: [],
    admin_log: [],
    command_log: [],
    nextIds: {
      crime: 1,
      admin: 1,
      command: 1,
    },
  };
}

function playerCount(obj: any): number {
  return obj?.players ? Object.keys(obj.players).length : 0;
}

/**
 * Safely read a JSON file.
 *
 * Handles UTF-8 BOM files such as syndicates-LIVE.json.
 */
function readJsonSafe(file: string): any | null {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }

    const raw = fs
      .readFileSync(file, 'utf8')
      .replace(/^\uFEFF/, '');

    if (!raw.trim()) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`[db] Failed to read JSON: ${file}`, error);
    return null;
  }
}

function findLiveFile(): string | null {
  for (const p of LIVE_CANDIDATES) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Prefer LIVE economy when it has more players than
 * data/syndicates.json.
 *
 * Never wipes a richer local DB.
 */
function bootstrapFromLive(): DbShape | null {
  const livePath = findLiveFile();

  if (!livePath) {
    return null;
  }

  const live = readJsonSafe(livePath);

  if (!live?.players) {
    console.warn(
      `[db] LIVE file exists but could not be loaded: ${livePath}`,
    );
    return null;
  }

  const liveN = playerCount(live);

  const existing = readJsonSafe(DB_FILE);
  const existN = playerCount(existing);

  if (liveN > existN) {
    console.log(
      `[db] Seeding from LIVE (${liveN} players > ${existN} in data)`,
    );
    console.log(`[db] LIVE path: ${livePath}`);

    return live as DbShape;
  }

  if (!existing && liveN > 0) {
    console.log(
      `[db] No data file \u2014 loading LIVE (${liveN} players)`,
    );
    console.log(`[db] LIVE path: ${livePath}`);

    return live as DbShape;
  }

  console.log(
    `[db] Keeping data/syndicates.json (${existN} players; LIVE has ${liveN})`,
  );

  return null;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDbPath(): string {
  return DB_FILE;
}

export function getDb(): DbShape {
  if (cache) {
    return cache;
  }

  ensureDir();

  const seeded = bootstrapFromLive();

  if (seeded) {
    cache = seeded;

    // Persist LIVE into the active data path so leaderboards
    // and runtime state stay in sync.
    try {
      const tmp = DB_FILE + '.tmp';

      fs.writeFileSync(
        tmp,
        JSON.stringify(cache, null, 2),
        'utf8',
      );

      fs.renameSync(tmp, DB_FILE);

      console.log(
        `[db] Wrote LIVE economy \u2192 ${DB_FILE}`,
      );
    } catch (error) {
      console.error(
        '[db] Failed to persist LIVE seed',
        error,
      );
    }
  } else if (fs.existsSync(DB_FILE)) {
    const existing = readJsonSafe(DB_FILE);

    if (existing) {
      cache = existing as DbShape;
    } else {
      const backups = listBackups();
      let restored: DbShape | null = null;

      for (const backup of backups) {
        const backupDb = readJsonSafe(backup);

        if (backupDb && playerCount(backupDb) > 0) {
          console.log(
            `[db] Restoring backup: ${backup} (${playerCount(
              backupDb,
            )} players)`,
          );

          restored = backupDb as DbShape;
          break;
        }
      }

      cache = restored ?? defaultDb();
    }
  } else {
    const backups = listBackups();
    let restored: DbShape | null = null;

    for (const backup of backups) {
      const backupDb = readJsonSafe(backup);

      if (backupDb && playerCount(backupDb) > 0) {
        console.log(
          `[db] No active DB \u2014 restoring backup: ${backup} (${playerCount(
            backupDb,
          )} players)`,
        );

        restored = backupDb as DbShape;
        break;
      }
    }

    cache = restored ?? defaultDb();
  }

  if (!cache.players) {
    cache.players = {};
  }

  if (!cache.crime_log) {
    cache.crime_log = [];
  }

  if (!cache.admin_log) {
    cache.admin_log = [];
  }

  if (!cache.command_log) {
    cache.command_log = [];
  }

  if (!cache.nextIds) {
    cache.nextIds = {
      crime: 1,
      admin: 1,
      command: 1,
    };
  }

  return cache;
}

function listBackups(): string[] {
  try {
    ensureDir();

    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(BACKUP_DIR, f))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function maybeBackup() {
  const t = Date.now();

  if (t - lastBackupAt < 10 * 60 * 1000) {
    return;
  }

  lastBackupAt = t;

  try {
    ensureDir();

    const name = `syndicates_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;

    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(
        DB_FILE,
        path.join(BACKUP_DIR, name),
      );
    }

    const all = listBackups();

    for (const old of all.slice(20)) {
      try {
        fs.unlinkSync(old);
      } catch {
        // Ignore individual backup deletion failures.
      }
    }
  } catch (error) {
    console.error('backup failed', error);
  }
}

export function saveDb() {
  if (!cache) {
    return;
  }

  ensureDir();

  const tmp = DB_FILE + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify(cache, null, 2),
    'utf8',
  );

  fs.renameSync(tmp, DB_FILE);

  maybeBackup();
}

export function forceBackup(): string {
  ensureDir();

  if (!fs.existsSync(DB_FILE)) {
    saveDb();
  }

  const name = `manual_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`;

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

  const size = fs.existsSync(DB_FILE)
    ? fs.statSync(DB_FILE).size
    : 0;

  const backups = listBackups().length;
  const live = findLiveFile();

  return `\u{1F4BE} *PLAYER DATA*

Path: \`${DB_FILE}\`

Players: *${n}*

File size: ${(size / 1024).toFixed(1)} KB

Backups: ${backups}

LIVE file: ${
    live ? '`' + live + '`' : '*none*'
  }

Data dir: \`${DATA_DIR}\`

\u2014

*SYN v2.1.0 \u2022 economy online*`;
}
