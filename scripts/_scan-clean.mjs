import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
// Track brace/paren/bracket/square balance, and string state
let i = 0;
let sq = 0, dq = 0, bt = 0; // single, double, backtick string depths (0 = not in string)
let brace = 0, paren = 0, brkt = 0, sqbr = 0;
let lineNo = 1;
let firstBadLine = -1;
let firstBadReason = '';
const inCode = (): boolean => sq === 0 && dq === 0 && bt === 0;

for (const ch of src) {
  if (ch === '\n') { lineNo++; i++; continue; }
  const prev = i > 0 ? src[i-1] : null;
  const next = src[i+1] != null ? src[i+1] : null;

  // String toggles
  if (prev !== '\\' && ch === '`' && bt === 0) { bt = bt === 0 ? 1 : 0; }
  else if (prev !== '\\' && ch === '"' && sq === 0 && bt === 0) { dq = dq === 0 ? 1 : 0; }
  else if (prev !== '\\' && ch === "'" && dq === 0 && bt === 0) { sq = sq === 0 ? 1 : 0; }

  if (inCode()) {
    if (ch === '{') brace++;
    else if (ch === '}') {
      brace--;
      if (brace < 0 && firstBadLine < 0) {
        firstBadLine = lineNo;
        firstBadReason = `brace=${brace} (negative after }) at line ${lineNo}`;
      }
    } else if (ch === '(') paren++;
    else if (ch === ')') {
      paren--;
      if (paren < 0 && firstBadLine < 0) { firstBadLine = lineNo; firstBadReason = `paren=${paren} (negative after ))`; }
    } else if (ch === '[') sqbr++;
    else if (ch === ']') {
      sqbr--;
      if (sqbr < 0 && firstBadLine < 0) { firstBadLine = lineNo; firstBadReason = `square=${sqbr} (negative)`; }
    }
  }
  i++;
}

console.log('Final balances: brace=%d paren=%d bracket=%d square=%d'.replace('%d','%d').split(' ').join(' '), brace, paren, brkt, sqbr);
// .replace trick won't work; just do manually
console.log('Final balances: brace=' + brace + ' paren=' + paren + ' bracket=' + brkt + ' square=' + sqbr);
console.log('firstBadLine=' + firstBadLine + ' reason=' + firstBadReason);

// Print context around first bad line
if (firstBadLine > 0) {
  const lines = src.split('\n');
  const s = Math.max(0, firstBadLine - 6);
  const e = Math.min(lines.length, firstBadLine + 4);
  console.log('\n--- context around line ' + firstBadLine + ' ---');
  for (let k = s; k < e; k++) {
    const mark = (k+1) === firstBadLine ? '>>>' : '   ';
    console.log(mark + ' ' + (k+1) + ' | ' + lines[k]);
  }
}

// Find all export lines
const exports = [];
src.split('\n').forEach((l, idx) => {
  if (/^\s*export\s/.test(l)) exports.push(idx+1);
});
console.log('\nExport line numbers: ' + exports.join(', '));
console.log('Total lines: ' + src.split('\n').length);
