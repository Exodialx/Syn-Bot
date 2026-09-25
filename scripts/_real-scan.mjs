import { build } from 'esbuild';
import { readFileSync } from 'fs';

// Try to build just fisch.ts and capture the error
const src = readFileSync('src/game/fisch.ts', 'utf8');

async function main() {
  try {
    const result = await build({
      stdin: {
        contents: src,
        loader: 'ts',
        resolveDir: '.',
      },
      write: false,
      bundle: false,
      sourcemap: false,
      format: 'esm',
    });
    console.log('esbuild: NO ERROR — file parses cleanly');
  } catch (err) {
    console.log('esbuild ERROR:');
    if (err.errors) {
      for (const e of err.errors) {
        console.log(`  ${e.text}`);
        if (e.location) {
          console.log(`  at line ${e.location.line}, col ${e.location.column}`);
        }
      }
    } else {
      console.log('  ', err.message);
    }
  }

  // Also: walk char-by-char, track backtick state with PROPER template semantics
  // (backtick toggles template; apostrophe inside template doesn't matter)
  let inTemplate = false;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let lineNum = 1;
  let firstBraceAnomaly = -1;
  let firstAnomalyLine = -1;

  for (let i = 0; i < src.length; i++) {
    const ch = src.charCodeAt(i);
    const prev = i > 0 ? src.charCodeAt(i - 1) : -1;

    // Line tracking
    if (ch === 13) continue; // \r
    if (ch === 10) { lineNum++; continue; }

    // Escaped
    if (prev === 92) continue;

    // String states (only matter outside templates)
    if (!inTemplate) {
      if (ch === 39) continue; // ' — skip, we don't track single-quote depth
      if (ch === 34) continue; // " — skip
    }

    if (ch === 96) { // backtick
      inTemplate = !inTemplate;
      if (inTemplate && firstAnomalyLine < 0) {
        firstAnomalyLine = lineNum;
      }
    } else if (ch === 123) { // {
      if (!inTemplate) braceDepth++;
    } else if (ch === 125) { // }
      if (!inTemplate) {
        braceDepth--;
        if (braceDepth < 0 && firstBraceAnomaly < 0) {
          firstBraceAnomaly = lineNum;
          console.log(`FIRST NEGATIVE BRACE at line ${lineNum}, col ${i - src.lastIndexOf('\n', i)}`);
        }
      }
    } else if (ch === 40) { // (
      if (!inTemplate) parenDepth++;
    } else if (ch === 41) { // )
      if (!inTemplate) parenDepth--;
    } else if (ch === 91) { // [
      if (!inTemplate) bracketDepth++;
    } else if (ch === 93) { // ]
      if (!inTemplate) bracketDepth--;
    }
  }

  console.log(`\nFinal depths: brace=${braceDepth} paren=${parenDepth} bracket=${bracketDepth} template=${inTemplate ? 'OPEN' : 'closed'}`);
  if (inTemplate) {
    console.log(`Template opened at line ${firstAnomalyLine}`);
  }
  if (braceDepth !== 0 || parenDepth !== 0 || bracketDepth !== 0 || inTemplate) {
    console.log('IMBALANCE DETECTED');
  } else {
    console.log('ALL BALANCED — no delimiter issue');
  }

  // If everything is balanced but esbuild still errors, print the context around 1822
  if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && !inTemplate) {
    const lines = src.split('\n');
    console.log('\n=== Context around line 1815-1825 ===');
    for (let k = 1814; k < Math.min(1825, lines.length); k++) {
      console.log(`[${k+1}] ${lines[k].slice(0, 150)}`);
    }
  }
}

main().catch(e => console.error(e));
