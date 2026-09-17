/**
 * RanAI-exact loading animation, ported to SynAI branding.
 * Sends a placeholder message, edits through staged frames (a 9-segment
 * diamond-cursor progress bar under a rotating status line), then the
 * caller swaps in the real answer via finalizeWithEdit().
 */
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { sleep } from './messageStyle.js';

const BAR_LEN = 9;
const SPINNER = '⠐';

/** filled=0 → cursor at the very start, all 9 slots empty ahead */
function bar(filled: number): string {
  const f = Math.max(0, Math.min(BAR_LEN, filled));
  if (f >= BAR_LEN) return '▬'.repeat(BAR_LEN);
  return '▬'.repeat(f) + '◈' + '▭'.repeat(BAR_LEN - f - 1);
}

const FRAMES = [
  { text: `> ${SPINNER} 🎯 Locking in... · 0s\n> ${bar(0)}`, delay: 700 },
  { text: `> ${SPINNER} 🧠 Thinking it through... · 1s\n> ${bar(2)}`, delay: 700 },
  { text: `> ${SPINNER} 🧠 Thinking it through... · 2s\n> ${bar(5)}`, delay: 700 },
  { text: `> ${SPINNER} ✍️ Writing it up... · 3s\n> ${bar(9)}`, delay: 500 },
];

/**
 * Run the loading animation. Returns the last sent message key (for editing),
 * or null if animation was skipped.
 */
export async function runLoadingAnimation(
  sock: WASocket | null,
  chatJid: string,
  quoted?: WAMessage
): Promise<any | null> {
  if (!sock) return null;
  try {
    let sent: any = await sock.sendMessage(
      chatJid,
      { text: FRAMES[0].text },
      quoted ? { quoted } : {}
    );
    if (!sent?.key) return null;

    for (let i = 1; i < FRAMES.length; i++) {
      await sleep(FRAMES[i - 1].delay);
      sent = await sock.sendMessage(
        chatJid,
        { text: FRAMES[i].text, edit: sent.key },
        quoted ? { quoted } : {}
      );
    }
    await sleep(FRAMES[FRAMES.length - 1].delay);
    return sent?.key || null;
  } catch {
    // Animation is cosmetic — never let it break the answer
    return null;
  }
}

/**
 * Edit the final answer into the animated placeholder.
 * Falls back to a fresh send if the edit fails.
 */
export async function finalizeWithEdit(
  sock: WASocket | null,
  chatJid: string,
  editKey: any,
  finalText: string,
  quoted?: WAMessage
): Promise<void> {
  if (sock && editKey) {
    try {
      await sock.sendMessage(chatJid, { text: finalText, edit: editKey });
      return;
    } catch {
      // fall through to plain send
    }
  }
  try {
    await sock?.sendMessage(chatJid, { text: finalText }, quoted ? { quoted } : {});
  } catch {
    // both failed — nothing else we can do here
  }
}
