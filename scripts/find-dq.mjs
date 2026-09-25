import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
const lines = src.split('\n');

// Find the LAST line where a double-quote toggles.
// Since EOF shows dq=true, the last toggle was an OPEN (dq becoming true).
// But to be safe, find the exact line and column.

let dq = false;
let lastOpenLine = -1, lastOpenCol = -1, lastOpenContent = '';
let lastCloseLine = -1, lastCloseCol = -1;

for (let i = 0; i < lines.length; i++) {
  const content = lines[i].split('\n')[0];
  for (let c = 0; c < content.length; c++) {
    const ch = content[c];
    const prev = c > 0 ? content[c - 1] : null;
    if (prev === '\\') continue; // skip escaped quotes
    if (ch === '"') {
      if (!dq) {
        // opening
        dq = true;
        lastOpenLine = i + 1;
        lastOpenCol = c + 1;
        lastOpenContent = content.slice(0, Math.min(140, content.length));
      } else {
        // closing
        dq = false;
        lastCloseLine = i + 1;
        lastCloseCol = c + 1;
      }
    }
  }
}

if (dq) {
  console.log('DQ still open at EOF. Last open was:');
  console.log('  Line ' + lastOpenLine + ', col ' + lastOpenCol + ':');
  console.log('  >>> ' + lastOpenContent);
  console.log('  Last close was: line ' + lastCloseLine + ', col ' + lastCloseCol);
  // Show the line that opens it, plus 5 lines after
  const start = Math.max(0, lastOpenLine - 2);
  const end = Math.min(lines.length, lastOpenLine + 6);
  console.log('CONTEXT (lines ' + start + '–' + end + '):');
  for (let k = start; k < end; k++) {
    const mark = k + 1 === lastOpenLine ? ' >>>' : '    ';
    console.log(mark + (k+1).toString().padStart(4) + ' | ' + lines[k]);
  }
  process.exit(0);
}

console.log('All quotes balanced. dq=false at EOF.');
