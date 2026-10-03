import type { WASocket } from '@whiskeysockets/baileys';
import { getDb } from '../db/database.js';

export async function sendWantedBoard(sock: WASocket, chatJid: string): Promise<void> {
  const db = getDb() as { players?: Record<string, any> };
  const players = Object.values(db.players || {});
  const wanted = players
    .filter((p) => (p.wanted || 0) > 0 || (p.heat || 0) >= 50)
    .sort((a, b) => (b.wanted || 0) - (a.wanted || 0) || (b.heat || 0) - (a.heat || 0))
    .slice(0, 15);

  let body: string;
  if (!wanted.length) {
    body = '🔫 *WANTED BOARD*\n━━━━━━━━━━━━━━━━━━━━\n_Streets are quiet. No active marks._';
  } else {
    const lines = wanted.map((p, i) => {
      const name = p.name || p.id?.slice(-6) || '?';
      return `${i + 1}. *${name}* · wanted ${p.wanted || 0} · heat ${p.heat || 0}`;
    });
    body = `🔫 *WANTED BOARD*\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`;
  }
  await sock.sendMessage(chatJid, { text: body });
}
