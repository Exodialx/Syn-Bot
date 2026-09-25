import { readFileSync } from 'fs';

const lines = readFileSync('src/game/fisch.ts', 'utf8').split('\n');
let brace = 0, paren = 0, sq = 0;
let state = 'norm';

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  for (let ci = 0; ci < raw.length; ci++) {
    const ch = raw[ci];
    const prev = ci > 0 ? raw[ci - 1] : ' ';
    if (state === 'norm') {
      if (ch === "'") { state = 'sq'; continue; }
      if (ch === '"') { state = 'dq'; continue; }
      if (ch === '`') { state = 'bt'; continue; }
    } else if (state === 'sq' && ch === "'" && prev !== '\\') { state = 'norm'; continue; }
    else if (state === 'dq' && ch === '"' && prev !== '\\') { state = 'norm'; continue; }
    else if (state === 'bt' && ch === '`' && prev !== '\\') { state = 'norm'; continue; }

    if (state === 'norm') {
      if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '[') sq++;
      else if (ch === ']') sq--;
    }

    if (brace < 0 || paren < 0 || sq < 0) {
      console.log('FIRST NEGATIVE at line', i + 1, '| brace', brace, '| paren', paren, '| sq', sq);
      console.log('  line:', JSON.stringify(raw));
      process.exit(0);
    }
  }
  if (i >= 615 && i <= 630) {
    console.log(i + 1, '| b', brace, '| p', paren, '| s', sq, '|', raw.slice(0, 80));
  }
}
console.log('END: brace', brace, '| paren', paren, '| sq', sq, '| total lines', lines.length);
