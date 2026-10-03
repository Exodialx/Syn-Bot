/**
 * SYN AI loading animation.
 * Sends a placeholder message, edits through staged frames (a rotating ASCII
 * spinner over a 9-segment diamond-cursor progress bar), then the caller swaps
 * in the real answer via finalizeWithEdit().
 *
 * Pacing is deliberately slow-ish (1.3–1.5s per step) so players can actually
 * read that the bot is working instead of the frames flashing past. If the
 * caller is still computing when the staged frames run out (a live-boost round
 * trip can take a few seconds), `keepAlive` keeps a spinner ticking instead of
 * freezing on "Writing it up...".
 */
import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { sleep } from './messageStyle.js';

const BAR_LEN = 9;

/** Braille spinner frames — plain text characters, so they render everywhere. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

/** filled=0 → cursor at the very start, all 9 slots empty ahead */
function bar(filled: number): string {
  const f = Math.max(0, Math.min(BAR_LEN, filled));
  if (f >= BAR_LEN) return '▬'.repeat(BAR_LEN);
  return '▬'.repeat(f) + '◈' + '▭'.repeat(BAR_LEN - f - 1);
}

/** One animation frame: `> spinner label · Ns` above the progress bar. */
function frame(step: number, label: string, elapsedSec: number, filled: number): string {
  const spin = SPINNER_FRAMES[step % SPINNER_FRAMES.length];
  return `> ${spin} ${label} · ${elapsedSec}s\n> ${bar(filled)}`;
}

/**
 * Staged frames plus how long each one is held. The delay lives on the frame
 * that is already on screen, so total on-screen time ≈ sum of delays (~5.7s).
 */
const FRAME_SPECS: Array<{ label: string; filled: number; delay: number }> = [
  { label: '🔍 Reading your question...', filled: 0, delay: 1300 },
  { label: '🧠 Thinking it through...', filled: 3, delay: 1500 },
  { label: '📂 Checking the game files...', filled: 6, delay: 1500 },
  { label: '✍️ Writing it up...', filled: 8, delay: 1400 },
];

/** Keep-alive tick pacing / cap once the staged frames are exhausted. */
const KEEP_ALIVE_DELAY_MS = 1600;
const MAX_KEEP_ALIVE_TICKS = 12; // ≈19s, matching the live-boost request timeout

export interface LoadingAnimationOptions {
  /** Checked before every extra tick — return false once the answer is ready. */
  keepAlive?: () => boolean;
  /** Used for the elapsed-seconds label (defaults to when the animation starts). */
  startedAt?: number;
}

/**
 * Run the loading animation. Returns the message key being edited (for
 * finalizeWithEdit), or null if the animation was skipped/failed.
 */
export async function runLoadingAnimation(
  sock: WASocket | null,
  chatJid: string,
  quoted?: WAMessage,
  opts?: LoadingAnimationOptions
): Promise<any | null> {
  if (!sock) return null;
  const startedAt = opts?.startedAt ?? Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);
  const send = (text: string, key?: any) =>
    sock.sendMessage(chatJid, key ? { text, edit: key } : { text }, quoted ? { quoted } : {});

  try {
    let sent: any = await send(frame(0, FRAME_SPECS[0].label, 0, FRAME_SPECS[0].filled));
    const messageKey = sent?.key;
    if (!messageKey) return null;

    for (let i = 1; i < FRAME_SPECS.length; i++) {
      await sleep(FRAME_SPECS[i - 1].delay);
      sent = await send(frame(i, FRAME_SPECS[i].label, elapsed(), FRAME_SPECS[i].filled), messageKey);
    }
    await sleep(FRAME_SPECS[FRAME_SPECS.length - 1].delay);

    // Still computing? Keep ticking so the placeholder never looks frozen.
    const keepAlive = opts?.keepAlive;
    for (let tick = 0; keepAlive && tick < MAX_KEEP_ALIVE_TICKS && keepAlive(); tick++) {
      sent = await send(
        frame(FRAME_SPECS.length + tick, '⏳ Still working on it...', elapsed(), BAR_LEN),
        messageKey
      );
      await sleep(KEEP_ALIVE_DELAY_MS);
    }
    return sent?.key || messageKey;
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
