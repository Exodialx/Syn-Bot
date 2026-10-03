/**
 * Command execution log for .admin cmds / cmdstats.
 * Persists into db.command_log (same shape bot/handler already read).
 */
import { getDb, saveDb } from '../db/database.js';

export type CommandLogEntry = {
  player_id: string;
  command: string;
  args: string;
  is_group: boolean;
  created_at: number;
};

const MAX_LOG = 2000;

function ensureLog(): CommandLogEntry[] {
  const db = getDb() as { command_log?: CommandLogEntry[] };
  if (!Array.isArray(db.command_log)) db.command_log = [];
  return db.command_log;
}

export function logCommand(input: {
  playerId: string;
  command: string;
  args?: string[];
  isGroup?: boolean;
}): void {
  try {
    const log = ensureLog();
    log.push({
      player_id: String(input.playerId || ''),
      command: String(input.command || '').replace(/^\./, ''),
      args: Array.isArray(input.args) ? input.args.join(' ').slice(0, 200) : '',
      is_group: !!input.isGroup,
      created_at: Date.now(),
    });
    while (log.length > MAX_LOG) log.shift();
    if (log.length % 25 === 0) {
      try { saveDb(); } catch {}
    }
  } catch {}
}

export function getRecentCommands(limit = 25): string {
  const log = ensureLog();
  const rows = log.slice(-Math.max(1, Math.min(100, limit))).reverse();
  if (!rows.length) return '📋 *RECENT COMMANDS*\n_No commands logged yet._';
  const lines = rows.map((r) => {
    const t = new Date(r.created_at).toLocaleTimeString();
    const id = String(r.player_id).slice(-6);
    const args = r.args ? ` ${r.args}` : '';
    return `${t} · ${id} · .${r.command}${args}`;
  });
  return `📋 *RECENT COMMANDS* (last ${rows.length})\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`;
}

export function getCommandStats(): string {
  const log = ensureLog();
  if (!log.length) return '📊 *COMMAND STATS*\n_No data yet._';
  const counts = new Map<string, number>();
  for (const r of log) {
    const c = r.command || '?';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const lines = top.map(([c, n], i) => `${i + 1}. .${c} — ${n}`);
  const since = log[0]?.created_at ? new Date(log[0].created_at).toLocaleString() : '?';
  return [
    '📊 *COMMAND STATS*',
    `Total logged: ${log.length}`,
    `Window starts: ${since}`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines,
  ].join('\n');
}
