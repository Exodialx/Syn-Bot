import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('src/game/fisch.ts', 'utf8');

// Strategy: binary search for the bad line
// Remove lines from the end one at a time until esbuild stops complaining
// Then the NEXT line is where the problem is.

const lines = src.split('\n');

async function testUpTo(endLineExclusive) {
  // endLineExclusive = only include lines 0..endLineExclusive-1
  const snippet = lines.slice(0, endLineExclusive).join('\n') + '\n';
  try {
    await build({
      stdin: { contents: snippet, loader: 'ts', resolveDir: '.' },
      write: false,
      bundle: false,
      format: 'esm',
    });
    return true; // no error
  } catch (e) {
    return false;
  }
}

// First, find a "good" prefix — find the earliest line N where
// lines[0..N] parses OK. That tells us the file is OK up to N.
// Then we add lines one at a time after that to find where it breaks.

// Start with first 100 lines
let goodUpTo = -1;
for (let n = 100; n <= lines.length; n += 100) {
  const ok = await testUpTo(n);
  if (ok) {
    goodUpTo = n;
  } else {
    console.log(`Lines 0..${n}: FAILS`);
    break;
  }
}

if (goodUpTo >= 0) {
  console.log(`File parses OK up to line ${goodUpTo} (exclusive)`);
  // Now add lines one at a time after goodUpTo
  for (let n = goodUpTo + 1; n <= lines.length; n++) {
    const ok = await testUpTo(n);
    if (!ok) {
      console.log(`Line ${n} (0-indexed ${n-1}) BREAKS it:`);
      console.log(`  ${JSON.stringify(lines[n-1])}`);
      // Show context: previous 3 lines and this line
      for (let k = Math.max(0, n-4); k <= n-1; k++) {
        console.log(`  [${k+1}] ${lines[k].slice(0, 120)}`);
      }
      break;
    }
  }
} else {
  // Even 100 lines fails — scan from the beginning in small chunks
  console.log('File fails even at 100 lines — scanning from start...');
  for (let n = 10; n <= 100; n++) {
    if (await testUpTo(n)) {
      console.log(`OK up to ${n}`);
    } else {
      console.log(`BREAKS at ${n}`);
      for (let k = Math.max(0, n-3); k < n; k++) {
        console.log(`  [${k+1}] ${lines[k].slice(0, 120)}`);
      }
      break;
    }
  }
}
