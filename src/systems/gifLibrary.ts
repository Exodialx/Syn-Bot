/**
 * GIF / looping-MP4 library for SynAI and game flavor messages.
 *
 * WhatsApp has no true GIF type — we send short MP4s with gifPlayback: true.
 * Source files must be .mp4 (Option A from the master spec). Raw .gif files
 * will not animate correctly.
 *
 * Every call site checks gifExists() first and silently skips if missing —
 * normal replies stay fully functional with zero GIFs present.
 */
import fs from 'fs';
import path from 'path';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';

export type GifCategory =
  | 'drops'
  | 'crime'
  | 'war'
  | 'casino'
  | 'business'
  | 'fisch'
  | 'synai';

function gifPath(category: GifCategory, name: string): string {
  const file = name.endsWith('.mp4') ? name : `${name}.mp4`;
  return path.join(process.cwd(), 'assets', 'gifs', category, file);
}

export function gifExists(category: GifCategory, name: string): boolean {
  try {
    return fs.existsSync(gifPath(category, name));
  } catch {
    return false;
  }
}

/**
 * Send a looping MP4 as a WhatsApp "gif". Silently no-ops if the file is
 * missing or the send fails — never crashes the reply path.
 */
export async function sendGif(
  sock: WASocket | null,
  chatJid: string,
  category: GifCategory,
  name: string,
  caption?: string,
  quotedMsg?: WAMessage
): Promise<void> {
  if (!sock) return;
  if (!gifExists(category, name)) return;
  try {
    const buf = fs.readFileSync(gifPath(category, name));
    await sock.sendMessage(
      chatJid,
      {
        video: buf,
        gifPlayback: true,
        caption: caption || '',
      },
      quotedMsg ? { quoted: quotedMsg } : {}
    );
  } catch (err) {
    console.warn('[gif] send failed:', (err as any)?.message || err);
  }
}

/** Simple keyword → synai gif name heuristic (cheap version from §5.5). */
export function pickSynAiGif(question: string): string | null {
  const q = (question || '').toLowerCase();
  if (/^(hi|hey|yo|sup|hello|good\s*(morning|afternoon|evening))\b/i.test(q)) {
    return 'greeting';
  }
  if (/\b(joke|funny|laugh|lol|lmao|haha)\b/i.test(q)) return 'joke';
  if (/\b(roast|insult|burn|trash|destroy)\b/i.test(q)) return 'roast';
  return null;
}

/** Per-player rate limit: max one SynAI GIF per 10 minutes. */
const lastGifAt = new Map<string, number>();
const GIF_COOLDOWN_MS = 10 * 60 * 1000;

export function canSendSynAiGif(playerId: string): boolean {
  const last = lastGifAt.get(playerId) || 0;
  return Date.now() - last >= GIF_COOLDOWN_MS;
}

export function markSynAiGifSent(playerId: string): void {
  lastGifAt.set(playerId, Date.now());
}

/** Supported animated-media extensions (MP4 preferred for WhatsApp gifPlayback). */
const MEDIA_EXTS = new Set(['.mp4', '.MP4']);

function subcategoryDir(category: GifCategory, subcategory: string): string {
  return path.join(process.cwd(), 'assets', 'gifs', category, subcategory);
}

/**
 * Pick a random media filename from assets/gifs/<category>/<subcategory>/.
 * Returns null when the folder is missing or empty — never throws.
 */
export function getRandomMedia(
  category: GifCategory,
  subcategory: string
): string | null {
  try {
    const dir = subcategoryDir(category, subcategory);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
    const files = fs
      .readdirSync(dir)
      .filter((f) => MEDIA_EXTS.has(path.extname(f)));
    if (!files.length) return null;
    return files[Math.floor(Math.random() * files.length)];
  } catch {
    return null;
  }
}

/**
 * Send a random looping MP4 from a subcategory folder.
 * Silently no-ops when media is missing — same contract as sendGif().
 */
export async function sendRandomGif(
  sock: WASocket | null,
  chatJid: string,
  category: GifCategory,
  subcategory: string,
  caption?: string,
  quotedMsg?: WAMessage
): Promise<void> {
  if (!sock) return;
  const file = getRandomMedia(category, subcategory);
  if (!file) return;
  try {
    const full = path.join(subcategoryDir(category, subcategory), file);
    const buf = fs.readFileSync(full);
    await sock.sendMessage(
      chatJid,
      {
        video: buf,
        gifPlayback: true,
        caption: caption || '',
      },
      quotedMsg ? { quoted: quotedMsg } : {}
    );
  } catch (err) {
    console.warn('[gif] sendRandom failed:', (err as any)?.message || err);
  }
}
