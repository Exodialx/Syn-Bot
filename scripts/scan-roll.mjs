import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
const lines = src.split('\n');

let tb = false, dq = false, sq = false, esc = false;
let brace = 0, paren = 0, sqbr = 0;

for (let i = 0; i < lines.length; i++) {
  const content = lines[i].split('\n')[0];
  for (let c = 0; c < content.length; c++) {
    const ch = content[c];
    const prev = c > 0 ? content[c - 1] : null;
    if (esc) { esc = false; continue; }

    if (!dq && !sq && ch === '`') tb = !tb;
    else if (!sq && !tb && ch === '"') dq = !dq;
    else if (!dq && !tb && ch === "'") sq = !sq;
    else {
      if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '[') sqbr++;
      else if (ch === ']') sqbr--;
    }

    if (ch === '\\' && !(tb || dq || sq)) esc = true;
  }

  if (brace < 0 || paren < 0 || sqbr < 0) {
    console.log(`>>> FIRST NEGATIVE at line ${i+1}: brace=${brace} paren=${paren} sqbr=${sqbr}`);
    console.log('CONTEXT (lines ' + Math.max(1, i-4) + '–' + Math.min(lines.length, i+3) + '):');
    for (let k = Math.max(0, i-4); k <= Math.min(lines.length-1, i+2); k++) {
      const mark = k === i ? ' >>>' : '    ';
      console.log(mark + (k+1).toString().padStart(4) + ' | ' + lines[k]);
    }
    process.exit(0);
  }
}

console.log('EOF OK. tb=' + tb + ' dq=' + dq + ' sq=' + sq + ' brace=' + brace + ' paren=' + paren + ' sqbr=' + sqbr);
