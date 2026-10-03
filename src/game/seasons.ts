/**
 * Season history — additive only. Never deletes prior seasons.
 *
 * S1 migration:
 *   snapshotCurrentPlayersAsS1()  → writes db.seasonSnapshots.s1 = [playerIds...]
 *   Then you may wipe/reset economy data; when players re-enter, ensureSeasonOnJoin()
 *   stamps ⚜️ S1 - 100 only for ids in that snapshot.
 *
 * New players (not in S1 snapshot) get ◆ S2 (or current season) only.
 */
import { getDb, saveDb } from '../db/database.js';
import type { Player } from './player.js';

export type SeasonEntry = { season: number; points?: number };

const DEFAULT_CURRENT_SEASON = 2;

export function getCurrentSeasonNumber(): number {
  const db = getDb() as any;
  const n = Number(db.currentSeason);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_CURRENT_SEASON;
}

export function setCurrentSeasonNumber(n: number): void {
  const db = getDb() as any;
  db.currentSeason = Math.max(1, Math.floor(n));
  saveDb();
}

/** IDs permanently marked as Season 1 originals. */
export function getS1SnapshotIds(): string[] {
  const db = getDb() as any;
  const snap = db.seasonSnapshots?.s1;
  return Array.isArray(snap) ? snap.map(String) : [];
}

/**
 * Call ONCE before wiping live player economy for S2.
 * Reads every existing player id and freezes them as S1.
 * Also stamps ⚜️ S1 - 100 onto each live player row so history survives partial resets.
 */
export function snapshotCurrentPlayersAsS1(): { count: number; ids: string[] } {
  const db = getDb() as any;
  if (!db.seasonSnapshots) db.seasonSnapshots = {};
  const ids = Object.keys(db.players || {});
  db.seasonSnapshots.s1 = ids;
  db.currentSeason = Math.max(2, Number(db.currentSeason) || 2);

  for (const id of ids) {
    const p = db.players[id];
    if (!p) continue;
    if (!Array.isArray(p.seasonHistory)) p.seasonHistory = [];
    if (!p.seasonHistory.some((e: SeasonEntry) => e.season === 1)) {
      p.seasonHistory.push({ season: 1, points: 100 });
    }
  }
  saveDb();
  return { count: ids.length, ids };
}

export function hasSeason(p: Player, season: number): boolean {
  return (p.seasonHistory || []).some(e => e.season === season);
}

export function appendSeason(p: Player, season: number, points?: number): void {
  if (!p.seasonHistory) p.seasonHistory = [];
  if (hasSeason(p, season)) return;
  const entry: SeasonEntry = { season };
  if (points != null) entry.points = points;
  p.seasonHistory.push(entry);
}

/**
 * On join / first touch after migration:
 * - S1 snapshot members keep/get ⚜️ S1 - 100
 * - Everyone gets current season marker (◆ S2, …) without wiping S1
 */
export function ensureSeasonOnJoin(p: Player): void {
  if (!p.seasonHistory) p.seasonHistory = [];
  const s1 = new Set(getS1SnapshotIds());
  if (s1.has(p.id) && !hasSeason(p, 1)) {
    appendSeason(p, 1, 100);
  }
  const cur = getCurrentSeasonNumber();
  if (cur >= 2 && !hasSeason(p, cur)) {
    // New season marker — no points badge unless specified
    if (cur === 1) appendSeason(p, 1, 100);
    else appendSeason(p, cur);
  }
}

/** Format block matching the requested style. */
export function formatSeasonHistory(p: Player): string {
  const seasons = (p.seasonHistory || []).slice().sort((a, b) => a.season - b.season);
  if (!seasons.length) return '';
  return seasons
    .map(se => {
      if (se.season === 1 && (se.points == null || se.points === 100)) return '⚜️ S1 - 100';
      if (se.points != null) return `⚜️ S${se.season} - ${se.points}`;
      return `◆ S${se.season}`;
    })
    .join('\n');
}

/** Admin helper: start next season for all existing players (append only). */
export function rollForwardSeason(): { from: number; to: number; stamped: number } {
  const from = getCurrentSeasonNumber();
  const to = from + 1;
  setCurrentSeasonNumber(to);
  let stamped = 0;
  const db = getDb() as any;
  for (const id of Object.keys(db.players || {})) {
    const p = db.players[id] as Player;
    if (!p) continue;
    if (!hasSeason(p, to)) {
      appendSeason(p, to);
      stamped++;
    }
  }
  saveDb();
  return { from, to, stamped };
}
