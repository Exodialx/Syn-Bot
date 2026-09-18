/**
 * Tiny, dependency-free `.env` loader.
 *
 * Imported for its side effect as the FIRST import in bot.ts, so it runs before
 * any other module reads process.env (module evaluation follows import order).
 * That is what lets a plain `npm run dev` / `npm run bot` pick up
 * OPENROUTER_API_KEY from the git-ignored `.env` file, while a deployed host
 * (Railway, Docker, systemd) keeps injecting the real thing.
 *
 * Real environment variables always win: we only fill in keys that are missing
 * or empty, so an injected value can never be shadowed by a stale local file.
 */
import fs from 'fs';
import path from 'path';

/** Parse `KEY=value` lines — skips blanks/comments, strips optional quotes. */
function parseEnv(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) pairs.push([key, value]);
  }
  return pairs;
}

/** Load `.env` then `.env.local` from `dir`. Never throws, never overrides real env vars. */
export function loadLocalEnv(dir: string = process.cwd()): void {
  for (const file of ['.env', '.env.local']) {
    try {
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) continue;
      for (const [key, value] of parseEnv(fs.readFileSync(full, 'utf8'))) {
        const current = process.env[key];
        if (current === undefined || current.trim() === '') process.env[key] = value;
      }
    } catch {
      // .env is a convenience only — a broken file must never stop the bot booting
    }
  }
}

// Side effect on import (bot.ts imports this module first).
loadLocalEnv();
