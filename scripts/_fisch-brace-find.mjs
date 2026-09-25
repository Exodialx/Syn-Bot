import { readFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');
const lines = src.split('\n');
let brace = 0;
let firstImbalance = null;

for (let li = 0; li < lines.length; li++) {
  const raw = lines[li];
  let inS = false, inD = false, inT = false, te = 0;
  let i = 0, col = 0;

  // Re-scan this line char-by-char for string state, then count braces
  for (; i < raw.length; ) {
    const c = raw[i], n = raw[i + 1];

    // skip ${ in template
    if (inT && c === '$' && n === '{') { te++; i += 2; continue; }
    if (c === '\\') { i += 2; continue; } // escape in any string/template

    if (c === '`') {
      if (inT && te === 0) { inT = false; te = 0; }
      else if (!inS && !inD) { inT = true; te = 0; }
      i++; continue;
    }
    if (c === "'" && !inD && !inT) { inS = !inS; i++; continue; }
    if (c === '"' && !inS && !inT) { inD = !inD; i++; continue; }

    if (!inS && !inD && !(inT && te > 0)) {
      if (c === '{') brace++;
      else if (c === '}') { brace--; }
    }
    i++;
  }

  if (firstImbalance === null && brace !== 0) {
    firstImbalance = { line: li + 1, brace, lineContent: raw.trim() };
  }
}

if (firstImbalance) {
  const LI = firstImbalance.line - 1;
  console.log('=== FIRST BRACE IMBALANCE ===');
  console.log(`Line ${firstImbalance.line}: brace balance becomes ${firstImbalance.brace}`);
  console.log(`Content: ${firstImbalance.lineContent.slice(0, 160)}`);
  console.log('');
  console.log('Context (4 lines before, 12 after):');
  const start = Math.max(0, LI - 4);
  const end = Math.min(lines.length, LI + 12);
  for (let i = start; i < end; i++) {
    const mark = i === LI ? '>>> ' : '    ';
    console.log(`${mark}L${i + 1}: ${lines[i].trim().slice(0, 130)}`);
  }
} else {
  console.log('All lines scanned — brace balance always 0.');
}
