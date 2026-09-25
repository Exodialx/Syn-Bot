import { writeFileSync, readFileSync } from 'fs';

// ── platform.ts ────────────────────────────────────────────────────────────
// Broken: formatUncTeaser() opens a backtick at line 230 but never closes.
// formatVersion() got swallowed inside it. Orphan suffix at 253-255.
// Fix: replace lines 229..255 (0-indexed 228..254) with two clean functions.

const platPath = 'src/game/platform.ts';
const platLines = readFileSync(platPath, 'utf8').split('\n');

// Find start: line containing 'export function formatUncTeaser'
let si = platLines.findIndex(l => l.includes('export function formatUncTeaser'));
// Find end: the next 'function footer' after si
let ei = platLines.slice(si).findIndex(l => l.includes('function footer')) + si;

const platBefore = platLines.slice(0, si);
const platAfter  = platLines.slice(ei);

const platBlock = [
  'export function formatUncTeaser(): string {',
  '  return `🍥 *UNC (KONOHA)*',
  '━━━━━━━━━━━ IN DEV ━━━━━━━━━━━━',
  'A brand-new ninja village community now inside SYN.',
  'Clans · mission runs · jutsu · village politics.',
  '',
  'Configure:',
  '.configure unc',
  '',
  'Meanwhile play *Syndicates* or enable *Utility*.',
  '━━━',
  '${SYN_TAGLINE}`;',
  '}',
  '',
  'export function formatVersion(): string {',
  '  return `📦 *SYN ${SYN_VERSION}*',
  '',
  '${SYN_TAGLINE}',
  '',
  'Modules',
  '🏙️ Syndicates — live',
  '🎣 FISCH — live',
  '🍥 UNC (Konoha) — In dev · ninja village, clans, mission runs, jutsu',
  '🛠️ Utility — live',
  '',
  'Owner: *${BOT_OWNER_NAME}*`;',
  '}'
];

writeFileSync(platPath, [...platBefore, ...platBlock, ...platAfter].join('\n'), 'utf8');
console.log('platform.ts: wrote', platBefore.length + platBlock.length + platAfter.length, 'lines');

// ── player.ts ──────────────────────────────────────────────────────────────
// Broken: formatProfile() template closes correctly at line 577 (the `;`),
// then 578-580 are duplicate orphan lines after the function body.
// Fix: find the line starting with '  return `👤 *PROFILE*' and delete
// everything from the second occurrence of '❤️ ${hearts}${hosp}' to end.

const pPath = 'src/game/player.ts';
const pLines = readFileSync(pPath, 'utf8').split('\n');

const profileStart = pLines.findIndex(l => l.includes('return `👤 *PROFILE*'));
// The template ends at the line that is exactly '❤️ ${hearts}${hosp}' followed
// by a line that is exactly '${badgeLine}`;' — that's the real close.
let closeIdx = -1;
for (let i = profileStart; i < pLines.length; i++) {
  if (pLines[i].trim() === '\`${badgeLine}\`;' || pLines[i].trim() === '${badgeLine}`;') {
    closeIdx = i;
    break;
  }
}
// Fallback: the line containing '${badgeLine}`;' (with possible leading spaces)
if (closeIdx === -1) {
  closeIdx = pLines.findIndex(l => l.includes('${badgeLine}`;'));
}

// Everything after closeIdx (the ';' line content itself stays, but the
// duplicate lines below it get removed)
const pBefore = pLines.slice(0, closeIdx + 1);
const pAfter  = pLines.slice(closeIdx + 1).filter(l => {
  const t = l.trim();
  return !(t === '❤️ ${hearts}${hosp}' || t === '🔥 [${heatBar}] ${p.heat}  🚨 ${p.wanted}${revenge}' || t === '${badgeLine}`;');
});

writeFileSync(pPath, [...pBefore, ...pAfter].join('\n'), 'utf8');
console.log('player.ts: wrote', pBefore.length + pAfter.length, 'lines');
