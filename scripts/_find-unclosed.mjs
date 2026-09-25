import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
const lines = src.split('\n');

// Track: are we inside a template literal? Walk char-by-char.
let inTemplate = false;
let inSingle = false;
let inDouble = false;
let firstAnomalyLine = -1;
let firstAnomalyDetail = '';

function lineColFromOffset(offset) {
  const before = src.slice(0, offset);
  const line = before.split('\n').length - 1;
  const col = before.length - before.lastIndexOf('\n');
  return { line, col };
}

for (let i = 0; i < src.length; i++) {
  const ch = src.charCodeAt(i);
  const prev = i > 0 ? src.charCodeAt(i - 1) : -1;

  // Handle \r\n and \r line endings
  if (ch === 13) { // \r
    // skip; next char might be \n
    continue;
  }
  if (ch === 10) { // \n
    if (inTemplate && firstAnomalyLine < 0) {
      const lc = lineColFromOffset(i);
      firstAnomalyLine = lc.line;
      firstAnomalyDetail = `Unclosed backtick opened somewhere before line ${lc.line + 1}`;
    }
    continue;
  }

  // Escaped char
  if (prev === 92) continue;

  if (ch === 96) { // backtick
    if (!inSingle && !inDouble) {
      inTemplate = !inTemplate;
      if (inTemplate && firstAnomalyLine < 0) {
        const lc = lineColFromOffset(i);
        firstAnomalyLine = -2; // marker: we just opened, no anomaly yet
        // don't record yet — might close on same line
      }
    }
  } else if (ch === 39) { // '
    if (!inTemplate && !inDouble) inSingle = !inSingle;
  } else if (ch === 34) { // "
    if (!inTemplate && !inSingle) inDouble = !inDouble;
  }
}

if (inTemplate) {
  const lc = lineColFromOffset(src.length - 1);
  console.log(`STILL IN TEMPLATE at EOF. Last opening was before line ${firstAnomalyLine + 1}`);
  console.log(`File has ${lines.length} lines total.`);
}

// Now: count backticks per line and report odd counts
console.log('\n=== Lines with ODD backtick counts (potential imbalance) ===');
for (let k = 0; k < lines.length; k++) {
  let count = 0;
  let inS = false, inD = false;
  for (let c = 0; c < lines[k].length; c++) {
    const ch = lines[k].charCodeAt(c);
    const prev = c > 0 ? lines[k].charCodeAt(c - 1) : -1;
    if (prev === 92) continue;
    if (ch === 39) { if (!inD) inS = !inS; }
    else if (ch === 34) { if (!inS) inD = !inD; }
    else if (ch === 96 && !inS && !inD) count++;
  }
  if (count % 2 !== 0) {
    console.log(`Line ${k+1}: ${count} BACKTICK(S) [ODD] ${JSON.stringify(lines[k].slice(0, 120))}`);
  }
}

// Also: show line 403 and line 626 exact content
console.log('\n=== Line 403 full ===');
console.log(JSON.stringify(lines[402]));
console.log('\n=== Line 626 full ===');
console.log(JSON.stringify(lines[625]));

// Show the last 15 lines of the file
console.log('\n=== Last 15 lines ===');
for (let k = Math.max(0, lines.length - 15); k < lines.length; k++) {
  console.log(`[${k+1}] ${JSON.stringify(lines[k])}`);
}
