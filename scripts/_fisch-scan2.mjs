import { readFileSync } from 'fs';

const raw = readFileSync('src/game/fisch.ts', 'utf8');
const lines = raw.split(/\r?\n/);

let brace = 0, paren = 0, sq = 0, dq = 0, bt = 0;
let backslash = false;

for (let i = 0; i < lines.length; i++) {
  for (let ci = 0; ci < lines[i].length; ci++) {
    const ch = lines[i][ci];
    const isEsc = backslash;
    backslash = false;

    if (ch === '\\') { backslash = true; continue; }

    if (!isEsc) {
      if (dq === 0 && bt === 0 && sq === 0) {
        if (ch === "'") sq = 1;
        else if (ch === '"') dq = 1;
        else if (ch === '`') bt = 1;
        else if (ch === '{') brace++;
        else if (ch === '}') {
          brace--;
          if (brace < 0) {
            console.log('FIRST NEGATIVE BRACE at line', i + 1, 'col', ci + 1, '| brace', brace, '| paren', paren, '| sq', sq, '| dq', dq, '| bt', bt);
            console.log('  line:', JSON.stringify(lines[i]));
            process.exit(0);
          }
        }
        else if (ch === '(') paren++;
        else if (ch === ')') paren--;
      } else if (sq === 1) {
        if (ch === "'") sq = 0;
      } else if (dq === 1) {
        if (ch === '"') dq = 0;
      } else if (bt === 1) {
        if (ch === '`') bt = 0;
      }
    }
  }
  if (i >= 605 && i <= 630) {
    console.log(i + 1, '| b', brace, '| p', paren, '| s', sq, '| d', dq, '| t', bt, '|', lines[i].slice(0, 70));
  }
}
console.log('END: b', brace, 'p', paren, 's', sq, 'd', dq, 't', bt);
