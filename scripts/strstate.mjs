import { readFileSync } from 'fs';
const src = readFileSync('src/game/fisch.ts', 'utf8');
const L = src.split('\n');
let inB = false, inD = false, inS = false;
for (let k = 555; k < 630; k++) {
  const l = L[k];
  for (let c = 0; c < l.length; c++) {
    const ch = l[c];
    const p = c > 0 ? l[c-1] : null;
    if (p !== '\\' && ch === '`' && !inS && !inD) inB = !inB;
    else if (p !== '\\' && ch === '"' && !inS && !inB) inD = !inD;
    else if (p !== '\\' && ch === "'" && !inD && !inB) inS = !inS;
  }
  const preview = l.length > 80 ? l.slice(0, 80) + '...' : l;
  console.log((k+1) + ' | inB=' + inB + ' inD=' + inD + ' inS=' + inS + ' | ' + preview);
}
console.log('\nfinal inB=' + inB + ' inD=' + inD + ' inS=' + inS);
