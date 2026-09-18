// One-shot surgical edit of src/game/fisch.ts — anchored on ASCII-only strings
// so we never have to match box-drawing characters from the editor.
import fs from 'node:fs';
const p = 'src/game/fisch.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
const done = [];

function rep(from, to, label) {
  if (!s.includes(from)) throw new Error('ANCHOR MISS: ' + label);
  if (s.split(from).length - 1 > 1) throw new Error('AMBIGUOUS ANCHOR: ' + label);
  s = s.replace(from, to);
  done.push(label);
}

// ── 1. catch: roll mutation + bait, apply mutation multiplier ──
rep(
  `  const perfectMult = perfect ? 1.2 : 1;\n  const value = Math.max(1, Math.floor(fish.baseValue * (weight / Math.max(1, fish.minWeight + fish.maxWeight) * 2) * zone.fishMultiplier * (RARITY_MULTIPLIER[fish.rarity] / 1.5) * streakMult * perfectMult));`,
  `  const perfectMult = perfect ? 1.2 : 1;\n  const mutation = rollMutation();\n  const value = Math.max(1, Math.floor(fish.baseValue * (weight / Math.max(1, fish.minWeight + fish.maxWeight) * 2) * zone.fishMultiplier * (RARITY_MULTIPLIER[fish.rarity] / 1.5) * streakMult * perfectMult * (mutation ? mutation.mult : 1)));`,
  'mutation roll + multiplier'
);

// ── 2. catch: tournament window bookkeeping ──
rep(
  `  const isRecord = weight > p.biggestCatchKg;`,
  `  const isRecord = weight > p.biggestCatchKg;\n  const tourBest = recordTournamentCatch(p, weight);`,
  'tournament record'
);

// ── 3. catch: replace the emoji-choked box report with a clean one ──
const oldReportStart = `  const bigCatch = fish.rarity === 'Epic'`;
const oldReportEnd = `].join('\\n') + flourish + perfectLine + luckyLine + recordLine + streakLine;`;
const iStart = s.indexOf(oldReportStart);
const iEnd = s.indexOf(oldReportEnd);
if (iStart < 0 || iEnd < 0) throw new Error('ANCHOR MISS: catch report block');
s = s.slice(0, iStart) + [
  `  const bigCatch = fish.rarity === 'Epic' || fish.rarity === 'Legendary' || fish.rarity === 'Mythic' || fish.rarity === 'Ancient';`,
  `  void bigCatch;`,
  `  return [`,
  `    bigCatch ? \`★ *\${fish.rarity.toUpperCase()} CATCH*\` : '🐟 *LANDED*',`,
  `    '━━━━━━━━━━━━━━━━━━━━',`,
  `    \`\${fish.emoji} \${fish.name}  ·  \${weight} kg\`,`,
  `    mutation ? \`Mutation: \${mutation.name}  (x\${mutation.mult})\` : '',`,
  `    \`+\${value.toLocaleString()} gold  ·  +\${xp} XP\`,`,
  `    perfect ? 'Perfect reel — clean land, bonus paid' : '',`,
  `    session.isLucky ? 'Lucky bite — hooked above your level' : '',`,
  `    isRecord ? 'New personal best weight' : '',`,
  `    tourBest ? 'New tournament best' : '',`,
  `    p.streak >= 3 ? \`Streak x\${p.streak}  (+\${Math.min(p.streak, 20) * 2}% value)\` : '',`,
  `  ].filter(Boolean).join('\\n');`,
  `}`
].join('\n') + s.slice(iEnd + oldReportEnd.length);
done.push('clean catch report');

// ── 4. escape: log the one that got away ──
rep(
  `  const fish = FISH.find(f => f.id === session.fishId)!;\n  p.streak = 0;\n  addXp(p, 15);`,
  `  const fish = FISH.find(f => f.id === session.fishId)!;\n  p.streak = 0;\n  p.escapes = [...(p.escapes || []), { fish: fish.name, at: Date.now() }].slice(-20);\n  addXp(p, 15);`,
  'escape log'
);

// ── 5. bait luck + weather luck feed the rarity weighting ──
rep(
  `  const weighted = pool.map(f => ({ f, w: RARITY_WEIGHT[f.rarity] * (1 + rod.luck / 100) }));`,
  `  const bonusLuck = activeBait(p).luck + currentWeather().luck;\n  const weighted = pool.map(f => ({ f, w: RARITY_WEIGHT[f.rarity] * (1 + (rod.luck + bonusLuck) / 100) }));`,
  'bait+weather luck weighting'
);

// ── 6. cast: charge equipped bait (golden bait is a per-cast cost) ──
rep(
  `  const fish = pickFish(zone, p);\n  const weight = Number((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)).toFixed(1));`,
  `  const bait = activeBait(p);\n  let baitNote = '';\n  if (bait.cost > 0) {\n    if (p.gold >= bait.cost) {\n      p.gold -= bait.cost;\n      baitNote = \`\\n🪱 \${bait.name} used  (-\${bait.cost.toLocaleString()}g)\`;\n    } else {\n      p.bait = 'basic';\n      baitNote = \`\\n🪱 Not enough gold for \${bait.name} — back to Basic Bait.\`;\n    }\n  }\n\n  const fish = pickFish(zone, p);\n  const weight = Number((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)).toFixed(1));`,
  'bait charge'
);

// ── 7. cast: surface the bait note on the bite message ──
rep(
  `  return \`⚡ *Something took the bait*\${dailyBonusLine}\\n\\n\${renderReelBar(session, fish)}\`;`,
  `  return \`⚡ *Something took the bait*\${dailyBonusLine}\${baitNote}\\n\\n\${renderReelBar(session, fish)}\`;`,
  'bait note on bite'
);

fs.writeFileSync(p, s);
console.log('applied:', done.join(' | '));
console.log('size', before.length, '->', s.length);
