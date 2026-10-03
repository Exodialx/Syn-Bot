import type { WASocket } from '@whiskeysockets/baileys';

const TIPS = [
  '🏙️ Street tip: .collect on a 10h cycle — plan your runs.',
  '🎣 FISCH gold converts at the .merchant.',
  '🔫 .streetjob for quick cash — watch your heat.',
  '💼 .mission ties business, street and sea together.',
];

let started = false;

export function startSeasonalEvents(sock: WASocket, getGroupIds: () => string[]): void {
  if (started) return;
  started = true;
  const t = setInterval(async () => {
    try {
      const groups = getGroupIds();
      if (!groups.length) return;
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      const gid = groups[Math.floor(Math.random() * groups.length)];
      await sock.sendMessage(gid, { text: tip });
    } catch {}
  }, 6 * 60 * 60 * 1000);
  if (typeof t.unref === 'function') t.unref();
}
