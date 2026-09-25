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
      if (ch === "'") { q = 'sq'; }
      else if (ch === '"') { q = 'dq'; }
      else if (ch === '`') { q = 'bt'; }
      else if (ch === '{') {
        B++;
        if (i >= 596 && i <= 620) console.log('OPEN line', i + 1, '|', line.slice(0, 70));
      }
      else if (ch === '}') {
        B--;
        if (i >= 596 && i <= 620) console.log('CLOSE line', i + 1, '| B now', B, '|', line.slice(0, 70));
        if (B < 0) { console.log('*** NEG at line', i + 1, JSON.stringify(line)); process.exit(1); }
      }
      else if (ch === '(') P++;
      else if (ch === ')') P--;
      else if (ch === '[') S++;
      else if (ch === ']') S--;
    }
  }
}
console.log('END: B', B, '| P', P, '| S', S);
