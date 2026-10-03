/**
 * "Thinking" gif for .synai — any .mp4 / .gif / .webm / .mov in assets/aiasset/.
 * Shown as a looping gif while the AI works, then deleted so only the answer remains.
 * .gif files are converted to mp4 once (ffmpeg-static) and cached in the OS temp dir.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const DIR = path.join(process.cwd(), 'assets', 'aiasset');
const EXT = /\.(mp4|gif|webm|mov)$/i;
const cache = new Map<string, string>();

function listFiles(): string[] {
  try { return fs.readdirSync(DIR).filter((f) => EXT.test(f)).map((f) => path.join(DIR, f)); } catch { return []; }
}

/** Sync check so callers can pick gif vs text animation without waiting. */
export function hasAiGif(): boolean {
  return listFiles().length > 0;
}

async function ffmpegBin(): Promise<string> {
  try { const m: any = await import('ffmpeg-static'); return (m.default || m) as string; } catch { return 'ffmpeg'; }
}

async function toMp4(file: string): Promise<string | null> {
  if (/\.mp4$/i.test(file)) return file;
  const key = `${file}:${fs.statSync(file).mtimeMs}`;
  const hit = cache.get(key);
  if (hit && fs.existsSync(hit)) return hit;
  const out = path.join(os.tmpdir(), `aigif_${Buffer.from(key).toString('base64url').slice(-24)}.mp4`);
  const bin = await ffmpegBin();
  const ok = await new Promise<boolean>((resolve) => {
    const p = spawn(bin, ['-y', '-i', file, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', out], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (c) => resolve(c === 0));
  });
  if (!ok || !fs.existsSync(out)) { console.error('[aiGif] ffmpeg conversion failed for', file); return null; }
  cache.set(key, out);
  return out;
}

/** Send a random gif from assets/aiasset. Returns its message key (for deletion) or null. */
export async function startAiGif(sock: any, chatJid: string, quoted?: any): Promise<any | null> {
  try {
    const files = listFiles();
    if (!files.length) return null;
    const mp4 = await toMp4(files[Math.floor(Math.random() * files.length)]);
    if (!mp4) return null;
    const sent = await sock.sendMessage(chatJid, { video: fs.readFileSync(mp4), gifPlayback: true, mimetype: 'video/mp4' }, quoted ? { quoted } : {});
    return sent?.key || null;
  } catch (e: any) {
    console.error('[aiGif] send failed', e?.message || e);
    return null;
  }
}

/** Delete the gif message (works on the bot's own messages). Never throws. */
export async function stopAiGif(sock: any, chatJid: string, key: any): Promise<void> {
  if (!key) return;
  try { await sock.sendMessage(chatJid, { delete: key }); } catch { /* already gone */ }
}
