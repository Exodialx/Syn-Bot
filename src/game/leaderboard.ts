import { getAllPlayers, Player } from './player.js';
import { getDb } from '../db/database.js';

function displayName(p: Player): string {
  if ((p as any).usernameSet && p.name) return p.name;
  return `…${p.id.slice(-4)}`;
}

function roleTag(p: Player): string {
  return p.role === 'Mafia' ? '🕴️' : p.role === 'Hitman' ? '🎯' : p.role === 'Businessman' ? '💼' : '·';
}

function shortMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function podiumBlock(
  top: Player[],
  valueFn: (p: Player) => string
): string {
  if (!top.length) return 'No players yet.\n';
  const medals = ['🥇', '🥈', '🥉'];
  let out = '';
  for (let i = 0; i < Math.min(3, top.length); i++) {
    const p = top[i];
    out += `${medals[i]}  ${roleTag(p)} *${displayName(p)}*\n`;
    out += `     ${valueFn(p)}\n\n`;
  }
  return out;
}

function listRows(
  slice: Player[],
  startRank: number,
  valueFn: (p: Player) => string
): string {
  if (!slice.length) return '';
  let out = '';
  slice.forEach((p, i) => {
    const rank = startRank + i;
    out += `\`${String(rank).padStart(2, ' ')}\`  ${roleTag(p)} ${displayName(p)}\n`;
    out += `      ${valueFn(p)}\n`;
  });
  return out;
}

export function formatLeaderboard(kind?: string): string {
  const players = getAllPlayers().filter(p => !p.banned);
  const raw = (kind || 'rich').toLowerCase().trim();
  const parts = raw.split(/\s+/);
  const mode = parts[0] || 'rich';
  const pageArg = parts[1];
  const wantFull = pageArg === 'full' || pageArg === 'all' || pageArg === '30';
  const page = Math.max(1, parseInt(pageArg || '1', 10) || 1);

  if (['achievements', 'achievement', 'badges', 'badge', 'al'].includes(mode)) {
    return formatAchievementLeaderboard(wantFull ? 1 : page, wantFull);
  }

  let sorted: Player[] = [];
  let title = 'RICHEST';
  let valueFn: (p: Player) => string = p => shortMoney(p.cash + p.bank);

  if (mode === 'level' || mode === 'xp') {
    sorted = [...players].sort((a, b) => b.level - a.level || b.xp - a.xp);
    title = 'LEVEL';
    valueFn = p => `Lv ${p.level}  ·  ${p.xp.toLocaleString()} XP`;
  } else if (mode === 'heat' || mode === 'wanted') {
    sorted = [...players].sort((a, b) => b.heat - a.heat || b.wanted - a.wanted);
    title = 'HEAT';
    valueFn = p => `🔥 ${p.heat}   🚨 ${p.wanted}`;
  } else if (mode === 'class') {
    sorted = [...players].sort((a, b) => b.classLevel - a.classLevel || b.level - a.level);
    title = 'CLASS';
    valueFn = p => `Class ${p.classLevel}  ·  Lv ${p.level}`;
  } else {
    sorted = [...players].sort((a, b) => (b.cash + b.bank) - (a.cash + a.bank));
    title = 'RICHEST';
    valueFn = p => shortMoney(p.cash + p.bank);
  }

  const pageSize = 12; // ranks 4–15 on page 1, etc.
  const maxShow = wantFull ? 30 : Math.min(30, 3 + pageSize);

  if (!sorted.length) {
    return `📊 *LEADERBOARD*
━━━━━━━━━━━━━━━━━━━━
No players yet.
━━━━━━━━━━━━━━━━━━━━
.lb rich · .lb level · .lb heat · .lb class`;
  }

  const top3 = sorted.slice(0, 3);
  let body = '';

  if (wantFull || page <= 1) {
    body += `*Podium*\n`;
    body += podiumBlock(top3, valueFn);
  }

  if (wantFull) {
    const rest = sorted.slice(3, 30);
    if (rest.length) {
      body += `*Ranks 4–${3 + rest.length}*\n`;
      body += listRows(rest, 4, valueFn);
    }
  } else {
    // page 1: ranks 4–15; page 2: 16–27; page 3: 28–30
    const start = page === 1 ? 3 : 3 + pageSize * (page - 1);
    const end = Math.min(30, start + pageSize);
    const slice = sorted.slice(start, end);
    if (page === 1 && slice.length) {
      body += `*Ranks 4–${end}*\n`;
      body += listRows(slice, 4, valueFn);
    } else if (page > 1) {
      if (!slice.length) {
        return `📊 *LEADERBOARD · ${title}*
━━━━━━━━━━━━━━━━━━━━
No more entries on page ${page}.
━━━━━━━━━━━━━━━━━━━━
.lb ${mode} · .lb ${mode} 2 · .lb ${mode} full`;
      }
      body += `*Ranks ${start + 1}–${end}*\n`;
      body += listRows(slice, start + 1, valueFn);
    }
  }

  const total = Math.min(30, sorted.length);
  const footer = wantFull
    ? `Showing top ${total}`
    : page <= 1
      ? `Page 1 · .lb ${mode} 2  ·  .lb ${mode} full`
      : `Page ${page} · .lb ${mode}  ·  .lb ${mode} full`;

  return `📊 *LEADERBOARD · ${title}*
━━━━━━━━━━━━━━━━━━━━
${body}━━━━━━━━━━━━━━━━━━━━
${footer}
.lb rich · level · heat · class · al`;
}

export function formatAchievementLeaderboard(page = 1, full = false): string {
  const players = getAllPlayers().filter(
    p => !p.banned && ((p.achievements || []).length > 0 || (p as any).usernameSet)
  );
  const sorted = [...players].sort((a, b) => {
    const ba = (b.achievements || []).length;
    const aa = (a.achievements || []).length;
    if (ba !== aa) return ba - aa;
    return (b.level || 0) - (a.level || 0);
  });

  const db = getDb() as any;
  const founders: string[] = db.founders || [];

  if (!sorted.length) {
    return `🏆 *ACHIEVEMENTS*
━━━━━━━━━━━━━━━━━━━━
No badges yet.
.type .achievements to start
━━━━━━━━━━━━━━━━━━━━`;
  }

  const valueFn = (p: Player) => {
    const count = (p.achievements || []).length;
    const founderIdx = founders.indexOf(p.id);
    const marks =
      (founderIdx >= 0 ? '🏛️ ' : '') + (p.isAdmin ? '🔐 ' : '');
    return `${marks}🏆 ${count} badges  ·  Lv ${p.level}`;
  };

  let body = '';
  if (full || page <= 1) {
    body += `*Podium*\n`;
    body += podiumBlock(sorted.slice(0, 3), valueFn);
    const rest = sorted.slice(3, full ? 30 : 15);
    if (rest.length) {
      body += `*Ranks 4–${3 + rest.length}*\n`;
      body += listRows(rest, 4, valueFn);
    }
  } else {
    const start = 15 + (page - 2) * 12;
    const slice = sorted.slice(start, start + 12);
    body += listRows(slice, start + 1, valueFn);
  }

  return `🏆 *ACHIEVEMENT LEADERBOARD*
━━━━━━━━━━━━━━━━━━━━
${body}━━━━━━━━━━━━━━━━━━━━
.al · .lb achievements · .lb al full`;
}
