import { getDb, saveDb } from '../db/database.js';

export function logCommand(opts: {
  playerId: string;
  command: string;
  args?: string[];
  isGroup?: boolean;
  success?: boolean;
  errorMsg?: string;
}) {
  try {
    const db = getDb();
    db.command_log.push({
      id: db.nextIds.command++,
      player_id: opts.playerId,
      command: opts.command,
      args: opts.args?.join(' ') || null,
      is_group: opts.isGroup ? 1 : 0,
      success: opts.success === false ? 0 : 1,
      error_msg: opts.errorMsg || null,
      created_at: Date.now()
    });
    if (db.command_log.length > 3000) db.command_log = db.command_log.slice(-2000);
    saveDb();
  } catch (e) {
    console.error('log failed', e);
  }
}

export function getRecentCommands(limit = 20, playerId?: string): string {
  const db = getDb();
  let rows = [...db.command_log].reverse();
  if (playerId) rows = rows.filter(r => r.player_id === playerId || r.player_id.endsWith(playerId));
  rows = rows.slice(0, limit);
  if (!rows.length) return 'No commands logged yet.';
  return rows.map(r => {
    const time = new Date(r.created_at).toLocaleTimeString();
    const who = String(r.player_id).slice(-6);
    const ok = r.success ? '✓' : '✗';
    const args = r.args ? ` ${r.args}` : '';
    return `${time} ${ok} ${who} .${r.command}${args}`;
  }).join('\n');
}

export function getCommandStats(): string {
  const db = getDb();
  const total = db.command_log.length;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const today = db.command_log.filter(r => r.created_at >= todayStart.getTime()).length;
  const counts: Record<string, number> = {};
  for (const r of db.command_log) counts[r.command] = (counts[r.command] || 0) + 1;
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);
  let out = `Total: ${total}\nToday: ${today}\n\nTop:\n`;
  for (const [c, n] of top) out += `  .${c} — ${n}\n`;
  return out.trim();
}
