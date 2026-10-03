/**
 * Rotating underground offers — limited stock, unusual prices.
 * Uses existing cash via chargeMoney/grantMoney patterns.
 */
import type { Player } from './player.js';
import { chargeMoney, grantMoney } from './economy.js';
import { savePlayer } from './player.js';
import { grantSalvage } from './salvage.js';
import { addRep, getRep } from './reputation.js';
import { getDb, saveDb } from '../db/database.js';

type Offer = {
  id: string;
  name: string;
  desc: string;
  price: number;
  stock: number;
  kind: 'salvage' | 'cashback' | 'rep';
};

function offers(): Offer[] {
  const db = getDb() as any;
  const day = new Date().toISOString().slice(0, 10);
  if (!db.underground || db.underground.day !== day) {
    db.underground = {
      day,
      offers: [
        { id: 'parts-pack', name: 'Parts Crate', desc: '3 common salvage parts', price: 8000, stock: 5, kind: 'salvage' },
        { id: 'rare-part', name: 'Rare Component', desc: '1 rare salvage part', price: 25000, stock: 2, kind: 'salvage' },
        { id: 'heat-bribe', name: 'Quiet Envelope', desc: '−5 heat (street tax)', price: 15000, stock: 4, kind: 'cashback' },
        { id: 'rep-token', name: 'Marker Chip', desc: '+10 reputation', price: 20000, stock: 3, kind: 'rep' },
      ],
    };
    saveDb();
  }
  return db.underground.offers as Offer[];
}

export function formatUnderground(p: Player): string {
  const list = offers();
  const lines = [
    '🕳️ *UNDERGROUND*',
    `Rep ${getRep(p)} · daily stock resets`,
    '━━━━━━━━━━━━━━━━━━━━',
  ];
  for (const o of list) {
    lines.push(`· *${o.name}* — $${o.price.toLocaleString()} · x${o.stock}`);
    lines.push(`  _${o.desc}_`);
  }
  lines.push('', '▸ `.underground buy <name>`');
  return lines.join('\n');
}

export function buyUnderground(p: Player, query: string): string {
  const list = offers();
  const q = query.toLowerCase();
  const o = list.find((x) => x.id === q || x.name.toLowerCase().includes(q));
  if (!o) return '⚠️ Offer not found.';
  if (o.stock <= 0) return '⚠️ Sold out today.';
  try {
    chargeMoney({
      player: p,
      amount: o.price,
      source: 'UNDERGROUND',
      reason: o.name,
      metadata: { offerId: o.id },
    });
  } catch (e) {
    return `⚠️ ${e instanceof Error ? e.message : 'Cannot afford.'}`;
  }
  o.stock -= 1;
  if (o.kind === 'salvage') {
    if (o.id === 'rare-part') grantSalvage(p, 'rare', 1);
    else grantSalvage(p, 'common', 3);
  } else if (o.kind === 'cashback') {
    p.heat = Math.max(0, (p.heat || 0) - 5);
  } else if (o.kind === 'rep') {
    addRep(p, 10, 'underground');
  }
  saveDb();
  savePlayer(p);
  return `🕳️ Bought *${o.name}*. Stock left: ${o.stock}`;
}
