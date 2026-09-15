import { Player, savePlayer, addXp } from './player.js';

function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function claimDaily(p: Player): string {
  const today = dayKey();
  const last = (p as any).lastDaily as string | undefined;
  if (last === today) {
    return `❌ Daily already claimed today.\nCome back tomorrow.`;
  }

  // streak
  let streak = (p as any).dailyStreak || 0;
  const yesterday = dayKey(Date.now() - 86400000);
  if (last === yesterday) streak += 1;
  else streak = 1;

  (p as any).lastDaily = today;
  (p as any).dailyStreak = streak;

  const base = 2500 + p.level * 150;
  const bonus = Math.min(8000, streak * 400);
  const cash = base + bonus;
  const xp = 40 + streak * 8 + p.level * 2;

  p.cash += cash;
  const notes = addXp(p, xp);
  // slight heat relief for showing up
  p.heat = Math.max(0, p.heat - 3);
  savePlayer(p);

  return `🌑 *DAILY CLAIM*
━━━━━━━━━━━━━━━━━━━━
🔥 Streak: ${streak} day${streak === 1 ? '' : 's'}
💰 +$${cash.toLocaleString()}
⭐ +${xp} XP
🔥 Heat -3 → ${p.heat}
${notes.join('\n')}

Come back tomorrow to keep your streak!`;
}
