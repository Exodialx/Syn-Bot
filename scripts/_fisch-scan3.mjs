import { readFileSync } from 'fs';

const L = readFileSync('src/game/fisch.ts', 'utf8').split(/\r?\n/);
let B = 0, P = 0, S = 0, D = 0, T = 0, q = '';
for (let i = 0; i < L.length; i++) {
  const line = L[i];
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (q && ch !== '\\') {
      if (q === 'sq' && ch === "'") { q = ''; }
      else if (q === 'dq' && ch === '"') { q = ''; }
      else if (q === 'bt' && ch === '`') { q = ''; }
      continue;
    }
    if (!q) {
      if (ch === "'") q = 'sq';
      else if (ch === '"') q = 'dq';
      else if (ch === '`') q = 'bt';
      else if (ch === '{') B++;
      else if (ch === '}') { B--; if (B < 0) { console.log('NEG brace line', i + 1, JSON.stringify(line)); process.exit(0); } }
      else if (ch === '(') P++;
      else if (ch === ')') P--;
      else if (ch === '[') S++;
      else if (ch === ']') S--;
    }
  }
}
console.log('END: B', B, '| P', P, '| S', S);
