/**
 * Utility module — 40+ misc commands, clean UI
 */
import { SYN_TAGLINE, CHANNEL_URL, SYN_VERSION } from './platform.js';

export function formatUtilityMenu(): string {
  return `🛠️ *UTILITY*
━━━━━━━━━━━━━━━━━━━━
*Group*
.kick @ · .promote @ · .demote @
.tagall · .hidetag · .listadmins
.grouplink · .revoke · .gcinfo
.open · .close

*Filter*
.antiword on|add|del|list
.nsfw enable|disable · .nsfw

*Media*
.sticker · .s  (reply image)
.toimg · .steal (reply sticker)

*Fun*
.pick a|b · .flip · .ship @ @
.truth · .dare · .wyr · .joke
.fact · .compat @ · .rate <thing>

*Tools*
.calc <expr> · .password · .uuid
.base64 en/de <text>
.reverse · .ascii · .morse
.device · .speed · .alive · .ping

*Info*
.version · .botowner · .channel
.runtime · .botstatus · .support

*Mod*
.del (reply) · .warn @ · .warnings
━━━━━━━━━━━━━━━━━━━━
${SYN_TAGLINE}`;
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
      return `✅ Alive · ${SYN_VERSION}\n⏱️ ${Math.floor(process.uptime())}s uptime`;
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
        return '❌ Bad expression';
      }
    }
    case 'pick': {
      const opts = args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return 'Usage: .pick red|blue|green';
      return `🎯 ${opts[Math.floor(Math.random() * opts.length)]}`;
    }
    case 'flip':
      return Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
    case 'password': {
      const n = Math.min(32, Math.max(8, parseInt(args[0] || '12', 10) || 12));
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
      let s = '';
      for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return `🔐 \`${s}\``;
    }
    case 'uuid':
      return `🆔 \`${cryptoRandom()}\``;
    case 'reverse':
      return args.join(' ').split('').reverse().join('') || 'Usage: .reverse text';
    case 'base64': {
      const mode = (args[0] || '').toLowerCase();
      const rest = args.slice(1).join(' ');
      if (mode === 'en' || mode === 'encode') return Buffer.from(rest).toString('base64');
      if (mode === 'de' || mode === 'decode') {
        try {
          return Buffer.from(rest, 'base64').toString('utf8');
        } catch {
          return '❌ Bad base64';
        }
      }
      return 'Usage: .base64 en hello · .base64 de aGVsbG8=';
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
