const fs = require('fs');
const p = 'src/game/fisch.ts';
const buf = fs.readFileSync(p);
const cur = buf.toString('utf8'); // mojibake string as stored

// CP1252 reverse table: char -> byte (0x80-0x9F block)
const CP1252_REV = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
  '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
  '\u017E': 0x9E, '\u0178': 0x9F,
};

const out = [];
let unmappable = 0;
const unmappedSamples = new Set();
for (const ch of cur) {
  const cp = ch.codePointAt(0);
  if (cp < 0x100) { out.push(cp); continue; }
  if (CP1252_REV[ch] !== undefined) { out.push(CP1252_REV[ch]); continue; }
  unmappable += 1;
  unmappedSamples.add(ch);
  // keep it as its own utf8 bytes
  for (const b of Buffer.from(ch, 'utf8')) out.push(b);
}
console.log('unmappable chars:', unmappable, [...unmappedSamples].slice(0, 20).join(' '));

const fixed = Buffer.from(out).toString('utf8');
const bad = (fixed.match(/\uFFFD/g) || []).length;
console.log('replacement chars after repair:', bad);
console.log('has 🎣 :', fixed.includes('\u{1F3A3}'));
console.log('has em-dash :', fixed.includes('\u2014'));

if (bad === 0 && unmappable === 0) {
  fs.writeFileSync(p, fixed);
  console.log('REPAIRED + written');
} else {
  fs.writeFileSync('_fisch_fixed_preview.ts', fixed);
  console.log('NOT written — wrote preview to _fisch_fixed_preview.ts');
}
