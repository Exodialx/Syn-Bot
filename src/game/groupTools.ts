/**
 * Group / utility tools — .mod · .tools · antiword · nsfw · sticker
 */
import fs from 'fs';
import path from 'path';
import { getDb, saveDb } from '../db/database.js';

export type GroupConfig = {
  antiWords: string[];
  antiwordOn: boolean;
  nsfwOn: boolean;
};

function groups(): Record<string, GroupConfig> {
  const db = getDb() as any;
  if (!db.groupConfig) db.groupConfig = {};
  return db.groupConfig;
}

export function getGroupConfig(chatJid: string): GroupConfig {
  const g = groups();
  const key = chatJid || 'global';
  if (!g[key]) {
    g[key] = { antiWords: [], antiwordOn: false, nsfwOn: false };
    saveDb();
  }
  const c = g[key];
  if (!Array.isArray(c.antiWords)) c.antiWords = [];
  if (typeof c.antiwordOn !== 'boolean') c.antiwordOn = false;
  if (typeof c.nsfwOn !== 'boolean') c.nsfwOn = false;
  return c;
}

function saveGroup(chatJid: string, c: GroupConfig) {
  groups()[chatJid || 'global'] = c;
  saveDb();
}

/** Normalize for antiword: strip leetspeak / symbols so "n1gga" still matches "nigga" */
export function normalizeForAntiword(text: string): string {
  let s = String(text || '').toLowerCase();
  s = s
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
  // collapse spaced letters: n i g g a
  s = s.replace(/([^a-z0-9])+/g, ' ');
  // also build compact form without spaces
  return s;
}

export function shouldDeleteForAntiword(chatJid: string, text: string): boolean {
  if (!chatJid || !chatJid.endsWith('@g.us')) return false;
  const c = getGroupConfig(chatJid);
  if (!c.antiwordOn || !c.antiWords.length) return false;
  const raw = String(text || '');
  if (!raw.trim()) return false;
  // never delete bot commands
  if (raw.trim().startsWith('.')) return false;

  const lower = raw.toLowerCase();
  const norm = normalizeForAntiword(raw);
  const compact = norm.replace(/\s+/g, '');

  for (const w of c.antiWords) {
    if (!w || w.length < 2) continue;
    const wl = w.toLowerCase().trim();
    const wn = normalizeForAntiword(wl).replace(/\s+/g, '');
    if (!wn) continue;
    // direct includes
    if (lower.includes(wl) || compact.includes(wn)) return true;
    // word boundary regex on original
    try {
      const esc = wl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i').test(lower)) return true;
    } catch { /* ignore bad regex */ }
  }
  return false;
}

export function antiwordCmd(chatJid: string, args: string[]): string {
  if (!chatJid.endsWith('@g.us')) return '❌ Antiword is *groups only*.';
  const c = getGroupConfig(chatJid);
  const sub = (args[0] || '').toLowerCase();
  if (!sub || sub === 'list' || sub === 'status') {
    return `🚫 *ANTIWORD* — ${c.antiwordOn ? '✅ ON' : '❌ OFF'}
━━━━━━━━━━━━━━━━━━━━
${c.antiWords.length ? c.antiWords.map(w => `▸ ${w}`).join('\n') : '_No words yet._'}
━━━━━━━━━━━━━━━━━━━━
.antiword on
.antiword off
.antiword add <word>
.antiword del <word>
.antiword list

Bot must be *group admin* to delete messages.`;
  }
  if (sub === 'on' || sub === 'enable') {
    c.antiwordOn = true;
    saveGroup(chatJid, c);
    return `🚫 Antiword *ON* for this group.
Words: ${c.antiWords.length || 'none yet — .antiword add nigga'}
Bot must be group admin to delete.`;
  }
  if (sub === 'off' || sub === 'disable') {
    c.antiwordOn = false;
    saveGroup(chatJid, c);
    return '🚫 Antiword *OFF*.';
  }
  if (sub === 'add' && args[1]) {
    const w = args.slice(1).join(' ').toLowerCase().trim();
    if (w.length < 2) return '❌ Word too short.';
    if (c.antiWords.includes(w)) return `Already listed: ${w}`;
    c.antiWords.push(w);
    if (!c.antiwordOn) c.antiwordOn = true; // auto-enable on first add
    saveGroup(chatJid, c);
    return `➕ Added *${w}* · list size ${c.antiWords.length}
Antiword is ON.`;
  }
  if ((sub === 'del' || sub === 'remove' || sub === 'rm') && args[1]) {
    const w = args.slice(1).join(' ').toLowerCase().trim();
    const before = c.antiWords.length;
    c.antiWords = c.antiWords.filter(x => x !== w);
    saveGroup(chatJid, c);
    return before === c.antiWords.length ? `Not found: ${w}` : `➖ Removed *${w}*`;
  }
  return 'Usage: .antiword on|off|add|del|list';
}

function collectImageDirs(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'nsfw'),
    path.join(cwd, 'pictures'),
    path.join(cwd, 'assets', 'nsfw'),
    path.join(cwd, 'media', 'nsfw'),
  ];
}

export function listNsfwFiles(): string[] {
  const out: string[] = [];
  for (const dir of collectImageDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.(jpe?g|png|webp|gif)$/i.test(f)) out.push(path.join(dir, f));
    }
  }
  return out;
}

export function nsfwCmd(chatJid: string, args: string[]): { text?: string; imagePath?: string } {
  const sub = (args[0] || '').toLowerCase();
  const isGroup = chatJid.endsWith('@g.us');

  if (sub === 'enable' || sub === 'on') {
    if (!isGroup) return { text: '❌ Enable NSFW inside a *group*.' };
    const c = getGroupConfig(chatJid);
    c.nsfwOn = true;
    saveGroup(chatJid, c);
    const n = listNsfwFiles().length;
    return { text: `🔥 NSFW *enabled* here.\nImages found: *${n}*\nType .nsfw` };
  }
  if (sub === 'disable' || sub === 'off') {
    if (!isGroup) return { text: '❌ Groups only.' };
    const c = getGroupConfig(chatJid);
    c.nsfwOn = false;
    saveGroup(chatJid, c);
    return { text: '🔥 NSFW *disabled* for this group.' };
  }
  if (sub === 'status' || sub === 'count') {
    const n = listNsfwFiles().length;
    const on = isGroup ? getGroupConfig(chatJid).nsfwOn : true;
    return { text: `🔥 NSFW files: *${n}* · group: ${on ? 'ON' : 'OFF'}` };
  }

  if (isGroup && !getGroupConfig(chatJid).nsfwOn) {
    return { text: '❌ NSFW is off here.\nAdmin: `.nsfw enable`' };
  }

  const files = listNsfwFiles();
  if (!files.length) {
    return {
      text: `❌ No images found.
Put .jpg/.png in:
• nsfw/
• pictures/
on the *server* (Railway volume), then redeploy or upload.`
    };
  }
  const pick = files[Math.floor(Math.random() * files.length)];
  return { imagePath: pick, text: '🔥' };
}

export function formatModMenu(): string {
  // Full utility catalog (40 commands) — same as .utility
  return formatUtilityMenu();
}

export function formatToolsMenu(): string {
  return formatUtilityMenu();
}
