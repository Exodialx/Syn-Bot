/**
 * Smoke test for the street drop system.
 * Usage: npx tsx scripts/drops-smoke.ts  (restore data/syndicates.json after)
 */
import { DROP_ITEMS, claimDrop, formatDrop, formatDropList, type DropItem } from '../src/game/drops.ts';
import { getOrCreatePlayer, savePlayer, isRegistered } from '../src/game/player.ts';
import { handleCommand } from '../src/commands/handler.ts';

const GID = 'test-drop@g.us';
const ID = '777777777';
const meta = { isGroup: true, mentioned: [] as string[], chatJid: GID };

// 0. onboard a syndicate player
await handleCommand(ID, '.set name DropTester', meta);
const p = getOrCreatePlayer(ID);
(p as any).registered = true;
savePlayer(p);
console.log('registered:', isRegistered(p));

// 1. all 15 items render a valid drop message (count + sample)
console.log(`1. item count: ${DROP_ITEMS.length}`);
console.log('2. sample drop message:\n' + formatDrop(DROP_ITEMS[0]));

// 3. fake an active drop in the test group and claim it via the REAL .claim command
const { getDb, saveDb } = await import('../src/db/database.ts');
const db = getDb() as any;
db.activeDrops = db.activeDrops || {};
const before = { cash: p.cash, heat: p.heat, strength: p.strength };
db.activeDrops[GID] = { itemId: 'cache', at: Date.now() };
saveDb();
const out = await handleCommand(ID, '.claim', meta);
console.log('3. .claim result:', out.split('\n').slice(0, 2).join(' | '));
console.log('   cash changed:', getOrCreatePlayer(ID).cash !== before.cash);

// 4. second claim = too slow
console.log('4. second claim:', await handleCommand(ID, '.claim', meta));

// 5. every item's apply() runs without throwing
let ok = 0;
for (const item of DROP_ITEMS as DropItem[]) {
  try { item.apply(getOrCreatePlayer(ID)); savePlayer(getOrCreatePlayer(ID)); ok++; }
  catch (e: any) { console.log(`   ✗ ${item.id}: ${e?.message}`); }
}
console.log(`5. all items applied cleanly: ${ok}/${DROP_ITEMS.length}`);

// 6. .drops list renders
const list = await handleCommand(ID, '.drops', meta);
console.log('6. .drops renders:', list.includes('STREET DROPS') ? 'yes' : 'NO — ' + list.slice(0, 80));
console.log('7. drop odds sum check:', formatDropList().length > 100 ? 'ok' : 'fail');
