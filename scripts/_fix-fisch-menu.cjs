const fs = require('fs');
const p = 'src/game/fisch.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
// find the formatFischMenu function bounds
const start = lines.findIndex(l => l.includes('export function formatFischMenu'));
if (start < 0) throw new Error('formatFischMenu not found');
let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i] === '}') { end = i; break; }
}
const body = [
  'export function formatFischMenu(p: FischPlayer): string {',
  '  const boat = boatById(p.boatId)!;',
  '  const rod = rodById(p.rodId) ?? FISCH_RODS[0];',
  '  const zone = zoneById(p.currentZone)!;',
  '  const nextSpell = FISCH_SPELLS.find(s => !p.spellsUnlocked.includes(s.id));',
  "  const line = '\u2501'.repeat(20);",
  '  return [',
  "    '\ud83c\udfa3 *FISCH*',",
  '    line,',
  '    `Lv ${p.level}  \u00b7  Fish ${p.fishingLevel}  \u00b7  Sail ${p.sailingLevel}  \u00b7  Combat ${p.combatLevel}  \u00b7  Magic ${p.magicLevel}`,',
  '    `${p.gold.toLocaleString()} gold  \u00b7  HP ${p.hp}/${p.maxHp}  \u00b7  Mana ${p.mana}/${p.maxMana}`,',
  '    `${zone.name}  \u00b7  ${boat.name}  \u00b7  ${rod.name}`,',
  '    p.streak >= 2 ? `Streak x${p.streak} \u2014 keep it alive` : \'\',',
  '    nextSpell ? `Next spell: ${nextSpell.name} at Magic Lv ${nextSpell.tier * 10} (you are ${p.magicLevel})` : \'\',',
  "    reelSessions.has(p.id) ? '\u26a1 Something is on your line \u2014 use .pull' : '',",
  '    line,',
  "    '*FISH*',",
  "    '.fish cast \u2014 drop a line',",
  "    '.pull \u2014 fight the catch (2 pulls: land it or lose it)',",
  "    '.sea map  \u00b7  .sail <zone>',",
  "    '*GEAR*',",
  "    '.boat list  \u00b7  .boat info',",
  "    '.rod list  \u00b7  .rod info',",
  "    '*OCEAN*',",
  "    '.sea treasure  \u00b7  .sea battle <id>',",
  "    '.sea rob <id>  \u00b7  .sea territory [claim|attack|map]',",
  "    '*CHARACTER*',",
  "    '.fisch spell  \u00b7  .fisch inventory',",
  "    '.fisch stats  \u00b7  .fisch leaderboard',",
  '    line,',
  "    'Catch. Sail. Fight. Conquer.',",
  "  ].filter(Boolean).join('\\n');",
  '}',
];
lines.splice(start, end - start + 1, ...body);
fs.writeFileSync(p, lines.join('\n'));
console.log('replaced lines ' + (start + 1) + '-' + (end + 1));
