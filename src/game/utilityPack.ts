/**
 * Utility module — clean spaced terminal-style menu + misc tools
 */
import { SYN_TAGLINE, CHANNEL_URL, SYN_VERSION } from './platform.js';
import { getDb, saveDb } from '../db/database.js';

export function formatUtilityMenu(): string {
  return [
    '🛠️  *U T I L I T Y*',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '▸ *GROUP*',
    '  .kick @user',
    '  .promote @user',
    '  .demote @user',
    '  .tagall  ·  .hidetag',
    '  .listadmins',
    '  .grouplink  ·  .revoke',
    '  .gcinfo  ·  .open  ·  .close',
    '',
    '▸ *FILTER*',
    '  .antiword on|add|del|list',
    '  .nsfw enable|disable',
    '',
    '▸ *MEDIA*',
    '  .sticker (.s)  — reply to photo',
    '  .toimg         — reply to sticker',
    '  .steal         — reply to sticker',
    '',
    '▸ *FUN*',
    '  .pick a|b     ·  .flip',
    '  .ship @ @     ·  .compat @',
    '  .truth  ·  .dare  ·  .wyr',
    '  .joke   ·  .fact  ·  .rate <thing>',
    '',
    '▸ *TOOLS*',
    '  .calc <expr>',
    '  .password  ·  .uuid',
    '  .base64 en/de <text>',
    '  .reverse  ·  .ascii  ·  .morse',
    '  .device   ·  .speed  ·  .alive  ·  .ping',
    '',
    '▸ *MOD*',
    '  .del (reply)',
    '  .warn @user',
    '  .warnings @user',
    '',
    '▸ *INFO*',
    '  .version  ·  .botowner',
    '  .channel  ·  .support',
    '  .runtime  ·  .botstatus',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    'Type a command to use it.',
  ].join('\n');
}

function warningsDb(): Record<string, Record<string, number>> {
  const db = getDb() as any;
  if (!db.warnings) db.warnings = {};
  return db.warnings;
}

export function runUtility(
  cmd: string,
  args: string[],
  ctx: { text: string; mentioned: string[] }
): string | null {
  switch (cmd) {
    case 'utility':
    case 'util':
    case 'tools':
    case 'tool':
      return formatUtilityMenu();

    case 'version':
      return `📦 SYN ${SYN_VERSION}\n${SYN_TAGLINE}\n${CHANNEL_URL}`;

    case 'botowner':
    case 'creator':
    case 'owner':
      return `👑 Owner: *Exodial*\n${SYN_TAGLINE}\n${CHANNEL_URL}`;

    case 'channel':
    case 'support':
      return `📢 *SYN Channel*\n${CHANNEL_URL}\n\n${SYN_TAGLINE}`;

    case 'alive':
    case 'speed':
    case 'ping':
      return `✅ Alive · ${SYN_VERSION}\n⏱️ ${Math.floor(process.uptime())}s uptime`;

    case 'runtime':
    case 'botstatus':
      return `🖥️ Uptime *${Math.floor(process.uptime())}s*\nNode ${process.version}\n${SYN_TAGLINE}`;

    case 'device':
      return `🖥️ Node ${process.version}\nPlatform ${process.platform}\n${SYN_TAGLINE}`;

    case 'calc': {
      const expr = args.join('').replace(/[^0-9+\-*/().%\s]/g, '');
      if (!expr) return 'Usage: .calc 2+2*3';
      try {
        // eslint-disable-next-line no-new-func
        const v = Function(`"use strict"; return (${expr})`)();
        if (typeof v !== 'number' || !Number.isFinite(v)) return '❌ Invalid';
        return `🧮 ${expr} = *${v}*`;
      } catch {
        return '❌ Invalid expression';
      }
    }

    case 'password': {
      const len = Math.min(32, Math.max(8, parseInt(args[0] || '12', 10) || 12));
      const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
      let out = '';
      for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return `🔑 \`${out}\``;
    }

    case 'uuid':
      return `🆔 \`${cryptoRandom()}\``;

    case 'base64': {
      const mode = (args[0] || '').toLowerCase();
      const text = args.slice(1).join(' ');
      if (!text) return 'Usage: .base64 en <text>  or  .base64 de <text>';
      try {
        if (mode === 'en' || mode === 'encode') {
          return `📦 ${Buffer.from(text).toString('base64')}`;
        }
        if (mode === 'de' || mode === 'decode') {
          return `📦 ${Buffer.from(text, 'base64').toString('utf8')}`;
        }
        return 'Usage: .base64 en <text>  or  .base64 de <text>';
      } catch {
        return '❌ Base64 failed';
      }
    }

    case 'reverse': {
      const t = args.join(' ');
      return t ? t.split('').reverse().join('') : 'Usage: .reverse hello';
    }

    case 'morse': {
      const map: Record<string, string> = {
        a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....',
        i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.',
        q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
        y: '-.--', z: '--..', ' ': '/',
      };
      const t = args.join(' ').toLowerCase();
      return t.split('').map((c) => map[c] || c).join(' ') || 'Usage: .morse hello';
    }

    case 'rate': {
      const thing = args.join(' ') || 'that';
      return `📊 *${thing}* is ${Math.floor(Math.random() * 101)}/100`;
    }

    case 'ship':
    case 'compat': {
      const a = args[0] || 'A';
      const b = args[1] || 'B';
      return `💘 ${a} × ${b} = *${Math.floor(Math.random() * 101)}%*`;
    }

    case 'pick': {
      if (args.length < 2) return 'Usage: .pick optionA optionB';
      const choice = args[Math.floor(Math.random() * args.length)];
      return `🎯 I pick: *${choice}*`;
    }

    case 'flip': {
      return Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
    }

    case 'truth': {
      const q = [
        'Biggest lie you told this week?',
        'Most embarrassing save on this bot?',
        'Who in this chat would you rob first?',
        'Worst financial decision?',
      ];
      return `🗣️ Truth: ${q[Math.floor(Math.random() * q.length)]}`;
    }

    case 'dare': {
      const d = [
        'Send a voice note saying “I love taxes”.',
        'Change your name to BrokeBoss for 10 minutes.',
        'Donate 1k to the poorest player you know.',
        'Type .rob on someone richer than you.',
      ];
      return `🔥 Dare: ${d[Math.floor(Math.random() * d.length)]}`;
    }

    case 'wyr': {
      const w = [
        'Infinite cash but permanent 50 heat — or broke with 0 heat?',
        'Win every battle but lose all biz — or opposite?',
        'Only minigames — or only PvP?',
      ];
      return `🤷 WYR: ${w[Math.floor(Math.random() * w.length)]}`;
    }

    case 'joke': {
      const j = [
        'I tried to catch some fog. I mist.',
        'Parallel lines have so much in common. It’s a shame they’ll never meet.',
        'The bot asked for a raise. Got heat instead.',
      ];
      return `😂 ${j[Math.floor(Math.random() * j.length)]}`;
    }

    case 'fact': {
      const f = [
        'Octopuses have three hearts.',
        'Honey never spoils.',
        'A day on Venus is longer than its year.',
      ];
      return `📌 ${f[Math.floor(Math.random() * f.length)]}`;
    }

    case 'ascii':
      return '```\n  ____ _  _ _  _\n / ___| || | \\| |\n \\___ \\ __ | .` |\n |___/_||_|_|\\_|\n```';

    case 'script':
      return `📜 SYN ${SYN_VERSION}\nText-based games platform for WhatsApp.`;

    // ── Moderation: warn system ──
    case 'warn': {
      const target = ctx.mentioned[0];
      if (!target) return 'Usage: .warn @user';
      const wdb = warningsDb();
      if (!wdb[target]) wdb[target] = {};
      // simple global count per target phone
      const key = '_global';
      wdb[target][key] = (wdb[target][key] || 0) + 1;
      saveDb();
      const count = wdb[target][key];
      return `⚠️ Warned @${target}\nWarnings: *${count}*`;
    }

    case 'warnings': {
      const target = ctx.mentioned[0] || args[0];
      if (!target) return 'Usage: .warnings @user';
      const clean = String(target).replace(/[^0-9]/g, '');
      const wdb = warningsDb();
      const count = wdb[clean]?._global || wdb[target]?._global || 0;
      return `⚠️ Warnings for *${clean || target}*: *${count}*`;
    }

    // steal is media-based (reply to sticker) — handled in bot.ts
    case 'steal':
      return '📎 Reply to a sticker with `.steal` to take it.';

    default:
      return null;
  }
}

function cryptoRandom(): string {
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return hex.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
