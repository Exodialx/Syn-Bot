import { readFileSync } from 'fs';
const src = readFileSync('src/game/fisch.ts', 'utf8');

let brace = 0, paren = 0, sqbr = 0;
let inS = false, inD = false, inB = false;
let line = 1, col = 0;
const events = [];

for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  if (ch === '\n') { line++; col = 0; continue; }
  col++;
  const p = i > 0 ? src[i-1] : null;
  if (p !== '\\' && ch === '`' && !inS && !inD) { inB = !inB; }
  else if (p !== '\\' && ch === '"' && !inS && !inB) { inD = !inD; }
  else if (p !== '\\' && ch === "'" && !inD && !inB) { inS = !inS; }

  if (!inS && !inD && !inB) {
    if (ch === '{') { brace++; if (brace === 1 && col < 50) events.push({line, col, ch, dir:'open'}); }
    else if (ch === '}') { brace--; events.push({line, col, ch, dir:'close', bal:brace}); }
    else if (ch === '(') { paren++; if (paren === 1) events.push({line, col, ch, dir:'openParen'}); }
    else if (ch === ')') { paren--; events.push({line, col, ch, dir:'closeParen', bal:paren}); }
    else if (ch === '[') sqbr++;
    else if (ch === ']') sqbr--;
  }
}

console.log('Final: brace=' + brace + ' paren=' + paren + ' sqbr=' + sqbr);

// Show all events where balance goes to 0 or negative in a suspicious way
const suspicious = events.filter(e => 
  (e.ch === '}' && e.bal <= 0) || 
  (e.ch === ')' && e.bal <= 0) ||
  (e.dir === 'openParen' && e.line > 600 && e.line < 620)
);
console.log('\n--- suspicious events (lines 560-630) ---');
for (const e of events) {
  if (e.line >= 560 && e.line <= 630) {
    console.log('L' + e.line + ' col' + e.col + ' ' + e.ch + ' ' + (e.dir||'') + (e.bal!==undefined?' bal='+e.bal:''));
  }
}

// Show context around line 616-627
const L = src.split('\n');
console.log('\n--- lines 614-628 ---');
for (let k = 613; k < 628; k++) {
  console.log((k+1) + ' | ' + L[k]);
}
