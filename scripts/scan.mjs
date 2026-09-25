import { readFileSync } from 'fs';
const src = readFileSync('src/game/fisch.ts', 'utf8');
let brace = 0, paren = 0, sqbr = 0;
let inS = false, inD = false, inB = false;
let line = 1;
let firstBad = -1, reason = '';
const prev = (i) => i > 0 ? src[i-1] : null;
for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  if (ch === '\n') { line++; continue; }
  const p = prev(i);
  if (p !== '\\' && ch === '`' && !inS && !inD) { inB = !inB; }
  else if (p !== '\\' && ch === '"' && !inS && !inB) { inD = !inD; }
  else if (p !== '\\' && ch === "'" && !inD && !inB) { inS = !inS; }
  if (!inS && !inD && !inB) {
    if (ch === '{') brace++;
    else if (ch === '}') {
      brace--;
      if (brace < 0 && firstBad < 0) { firstBad = line; reason = 'brace=' + brace; }
    } else if (ch === '(') paren++;
    else if (ch === ')') {
      paren--;
      if (paren < 0 && firstBad < 0) { firstBad = line; reason = 'paren=' + paren; }
    } else if (ch === '[') sqbr++;
    else if (ch === ']') {
      sqbr--;
      if (sqbr < 0 && firstBad < 0) { firstBad = line; reason = 'sqbr=' + sqbr; }
    }
  }
}
console.log('brace=' + brace + ' paren=' + paren + ' sqbr=' + sqbr);
console.log('firstBad=' + firstBad + ' reason=' + reason);
if (firstBad > 0) {
  const L = src.split('\n');
  const s = Math.max(0, firstBad - 5);
  const e = Math.min(L.length, firstBad + 4);
  console.log('\n--- context ---');
  for (let k = s; k < e; k++) {
    const m = (k+1) === firstBad ? '>>>' : '   ';
    console.log(m + ' ' + (k+1) + ' | ' + L[k]);
  }
}
const exps = [];
src.split('\n').forEach((l,i) => { if (/^\s*export\s/.test(l)) exps.push(i+1); });
console.log('\nExports: ' + exps.join(','));
console.log('Total lines: ' + src.split('\n').length);
