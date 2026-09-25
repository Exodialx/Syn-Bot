import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
const lines = src.split('\n');

// Character-by-character state machine.
// Tracks: templateActive (backtick toggled), doubleQuoteActive, singleQuoteActive,
// skipNext (escape), and net brace/paren/bracket balance.
// Reports the FIRST line where netBalance < 0 for braces, or where a template
// string is still open at EOF.

let tb = false, dq = false, sq = false, esc = false;
let brace = 0, paren = 0, sqbr = 0;
let firstBadLine = -1;
let firstBadDetail = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const col = line.indexOf('\n');
  const content = col >= 0 ? line.slice(0, col) : line;

  for (let c = 0; c < content.length; c++) {
    const ch = content[c];
    const prev = c > 0 ? content[c - 1] : null;
    const isEsc = prev === '\\';

    if (esc) { esc = false; continue; }

    if (!dq && !sq && !tb && ch === '`') tb = true;
    else if (!dq && !sq && tb && ch === '`') tb = false;

    if (!sq && !tb && ch === '"') dq = !dq;
    else if (!dq && !tb && ch === "'") sq = !sq;

    if (isEsc) { esc = true; continue; }
    esc = false;

    if (tb || dq || sq) continue;

    if (ch === '{') brace++;
    else if (ch === '}') {
      brace--;
      if (brace < 0 && firstBadLine === -1) {
        firstBadLine = i + 1;
        firstBadDetail = `brace<0 (${brace}) at line ${i+1}`;
      }
    } else if (ch === '(') paren++;
    else if (ch === ')') {
      paren--;
      if (paren < 0 && firstBadLine === -1) {
        firstBadLine = i + 1;
        firstBadDetail = `paren<0 (${paren}) at line ${i+1}`;
      }
    } else if (ch === '[') sqbr++;
    else if (ch === ']') {
      sqbr--;
      if (sqbr < 0 && firstBadLine === -1) {
        firstBadLine = i + 1;
        firstBadDetail = `sqbr<0 (${sqbr}) at line ${i+1}`;
      }
    }
  }
}

if (firstBadLine > 0) {
  console.log('FIRST IMBALANCE:', firstBadDetail);
  // Show context: lines around the bad line
  const start = Math.max(0, firstBadLine - 6);
  const end = Math.min(lines.length, firstBadLine + 3);
  for (let k = start; k < end; k++) {
    const mark = k + 1 === firstBadLine ? ' >>>' : '    ';
    console.log(mark + (k + 1) + ' | ' + lines[k]);
  }
  process.exit(0);
}

console.log('No negative balance found. TB at EOF:', tb, 'DQ:', dq, 'SQ:', sq, 'brace:', brace, 'paren:', paren, 'sqbr:', sqbr);
if (tb) {
  // Template open at EOF — find where it opened
  let tbCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '`' && (c === 0 || line[c - 1] !== '\\')) tbCount++;
      if (tbCount === 1) {
        console.log('First open backtick at line', i + 1, ':', line.slice(0, 120));
      }
    }
  }
}
