/**
 * Spell race — anti-AI friendly:
 * scrambled letters shown with position codes; answer is the word.
 * Short deadline. Wrong answers consume bet (no retries).
 */
import { Player, savePlayer, addXp } from './player.js';

const WORDS = [
  'syndicate', 'heist', 'cartel', 'vault', 'smuggle', 'launder', 'bounty',
  'territory', 'kingpin', 'contraband', 'blackmail', 'racket', 'underboss',
  'payroll', 'shipment', 'safehouse', 'wiretap', 'getaway', 'lockpick',
  'counterfeit', 'extortion', 'informant', 'bribery', 'warehouse',
  'briefcase', 'underworld', 'nightclub', 'fingerprint', 'escape',
  'hospital', 'revenge', 'racketeer', 'hitman', 'business', 'diamond',
  'armory', 'whisper', 'shadow', 'courier', 'blacklist', 'deadlock',
  'payback', 'gunfire', 'ambush', 'safecrack', 'forensic', 'intercept',
  'outlaw', 'premium', 'battle', 'hospital', 'sniper', 'shotgun'
];

const MAX_BET = 5_000;
const rounds = new Map<string, { word: string; bet: number; expires: number; token: string }>();

function scramble(w: string): string {
  const a = w.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const s = a.join('');
  return s === w ? scramble(w) : s;
}

/** Show letters with random noise digits so pure OCR/AI copy is harder */
function displayScramble(scrambled: string): string {
  return scrambled
    .split('')
    .map((ch, i) => `${ch.toUpperCase()}${((i * 7 + scrambled.length) % 9) + 1}`)
    .join(' · ');
}

export function spellStart(p: Player, bet: number): string {
  if (!bet || bet < 50) return '❌ Min $50 · .spell <bet>';
  if (bet > MAX_BET) return `❌ Max bet $${MAX_BET.toLocaleString()}`;
  if (p.cash < bet) return '❌ Broke';

  p.cash -= bet;
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const scrambled = scramble(word);
  const now = Date.now();
  const token = Math.random().toString(36).slice(2, 6);
  rounds.set(p.id, { word, bet, expires: now + 40_000, token });
  savePlayer(p);

  return `🔤 *SPELL RACE*
━━━━━━━━━━━━━━━━━━━━
Letters (ignore the numbers):
${displayScramble(scrambled)}
Bet $${bet.toLocaleString()} · *40 seconds*
Code: ${token}
━━━━━━━━━━━━━━━━━━━━
.spell answer <word>
One try. Numbers are noise.`;
}

export function spellAnswer(p: Player, guess: string): string {
  const r = rounds.get(p.id);
  if (!r) return '❌ No active puzzle. .spell <bet>';
  rounds.delete(p.id);

  if (Date.now() > r.expires) {
    return `⏰ Too slow. Word was **${r.word}**. Bet lost.`;
  }

  const g = guess.toLowerCase().replace(/[^a-z]/g, '');
  if (g !== r.word) {
    return `❌ Not it. Word was **${r.word}**. Lost $${r.bet.toLocaleString()}`;
  }

  const win = Math.floor(r.bet * 2.0);
  p.cash += win;
  addXp(p, 18);
  savePlayer(p);
  return `✅ **${r.word}**
💰 +$${win.toLocaleString()}
💵 $${p.cash.toLocaleString()}`;
}
