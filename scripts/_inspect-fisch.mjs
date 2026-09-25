import { readFileSync, writeFileSync } from 'fs';

const path = 'src/game/fisch.ts';
const src = readFileSync(path, 'utf8');
const lines = src.split('\n');

// Find the line number of the FIRST unclosed backtick by walking char-by-char
let inTemplate = false;
let lineOfOpenBacktick = -1;
let openBacktickCol = -1;
let inSingleQuote = false;
let inDoubleQuote = false;

for (let idx = 0; idx < src.length; idx++) {
  const ch = src.charCodeAt(idx);
  const prevCh = idx > 0 ? src.charCodeAt(idx - 1) : -1;

  // Line/column tracking
  if (ch === 10) { // newline
    if (inTemplate) {
      console.log(`UNCLOSED BACKTICK at line ${lineOfOpenBacktick + 1}, col ${openBacktickCol + 1}`);
      console.log(`Arrow: line ${lineOfOpenBacktick + 1} = ${JSON.stringify(lines[lineOfOpenBacktick])}`);
      break;
    }
    continue;
  }

  if (prevCh === 92) continue; // escaped

  if (ch === 96) { // backtick
    if (!inSingleQuote && !inDoubleQuote) {
      inTemplate = !inTemplate;
      if (inTemplate) {
        // compute line/col
        const before = src.slice(0, idx);
        lineOfOpenBacktick = before.split('\n').length - 1;
        openBacktickCol = before.length - before.lastIndexOf('\n');
      }
    }
  } else if (ch === 39) { // single quote
    if (!inTemplate && !inDoubleQuote) inSingleQuote = !inSingleQuote;
  } else if (ch === 34) { // double quote
    if (!inTemplate && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
  }
}

if (inTemplate) {
  console.log(`BUG: backtick still open at EOF. Opened at line ${lineOfOpenBacktick + 1}`);
}

// Also: show a few lines around line 626 (index 625)
console.log('\n--- Lines 624-629 (indices 623-628) ---');
for (let k = 623; k < Math.min(629, lines.length); k++) {
  console.log(`[${k+1}] len=${lines[k].length} ${JSON.stringify(lines[k])}`);
}

// Show byte breakdown of line 626 (index 625)
console.log('\n--- Byte breakdown of line 626 ---');
const l626 = lines[625];
for (let i = 0; i < l626.length; i++) {
  const b = l626.charCodeAt(i);
  if (b === 96 || b === 39 || b === 34 || b === 92 || b === 10 || b === 0xFEFF) {
    let desc = '';
    if (b === 96) desc = 'BACKTICK';
    else if (b === 39) desc = 'SINGLEQUOTE';
    else if (b === 34) desc = 'DQUOTE';
    else if (b === 92) desc = 'BACKSLASH';
    else if (b === 10) desc = 'NEWLINE';
    else if (b === 0xFEFF) desc = 'BOM';
    console.log(`  col ${i+1}: ${b.toString(16).padStart(4,'0')}h = ${desc}  ctx: ...${l626.slice(Math.max(0,i-8), i+9).replace(/\n/g,'\\n')}...`);
  }
}
