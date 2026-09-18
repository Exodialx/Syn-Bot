/**
 * Street drops — every 10 minutes the bot drops a random item to every
 * syndicates-enabled group. First player to .claim it keeps it.
 *
 * Drops only land in groups with the syndicates module, and only registered
 * (syndicate) players can claim. Effects are REAL: cash, stats, heat, hearts,
 * prison, wanted — all mutate the same player records the rest of the game uses.
 */
import { getDb, saveDb } from '../db/database.js';
import { getOrCreatePlayer, savePlayer, addXp, isRegistered, type Player } from './player.js';
import { healHearts } from './health.js';
import { addCityHeat } from './city.js';

export const DROP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const DROP_EXPIRY_MS = 10 * 60 * 1000; // unclaimed drops vanish with the next cycle

export type DropItem = {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  weight: number;
  apply: (p: Player) => string;
};

function cloverActive(p: Player): boolean {
  return ((p as any).cloverUntil || 0) > Date.now();
}

function dropCash(p: Player, amount: number): number {
  return cloverActive(p) ? amount * 2 : amount; // six-leaf clover doubles drop rewards
}

export const DROP_ITEMS: DropItem[] = [
  {
    id: 'clover', name: 'SIX-LEAF CLOVER', emoji: '🍀', weight: 6,
    desc: 'Boosts your luck for 20 minutes — all drop rewards pay DOUBLE while it lasts (+1 permanent luck).',
    apply: (p) => {
      (p as any).cloverUntil = Date.now() + 20 * 60 * 1000;
      p.luck = (p.luck || 5) + 1;
      return '🍀 Luck running hot for 20 min — drop rewards ×2.';
    },
  },
  {
    id: 'cache', name: 'STREET CACHE', emoji: '💵', weight: 14,
    desc: 'A bag of cash someone "lost" running from the cops. Worth $8,000–$30,000.',
    apply: (p) => {
      const amt = dropCash(p, 8000 + Math.floor(Math.random() * 22000));
      p.cash += amt;
      return `💵 +$${amt.toLocaleString()} cash${cloverActive(p) ? ' (clover ×2)' : ''}.`;
    },
  },
  {
    id: 'laundry', name: 'LAUNDRY TOKEN', emoji: '🧼', weight: 8,
    desc: 'One wash, any color. Instantly scrubs ALL your heat back to zero.',
    apply: (p) => {
      const before = p.heat;
      p.heat = 0;
      return `🧼 Heat ${before} → 0. Squeaky clean.`;
    },
  },
  {
    id: 'trauma', name: 'TRAUMA KIT', emoji: '🩹', weight: 8,
    desc: 'Field surgery, no questions asked. Fully restores all hearts and ends hospital time.',
    apply: (p) => healHearts(p),
  },
  {
    id: 'skeleton', name: 'SKELETON KEY', emoji: '🔑', weight: 6,
    desc: 'Opens every lock in the precinct. Walks you straight out of prison, free.',
    apply: (p) => {
      const was = p.inPrison;
      p.inPrison = false;
      p.prisonUntil = 0;
      return was ? '🔑 Cell door swings open. You are FREE.' : '🔑 No cell holding you — kept for a rainy day.';
    },
  },
  {
    id: 'wisdom', name: 'WISDOM FRAGMENT', emoji: '🧠', weight: 10,
    desc: "A street professor's notes. Grants a chunk of XP scaled to your level.",
    apply: (p) => {
      const amt = 150 + (p.level || 1) * 25;
      const notes = addXp(p, amt);
      return `🧠 +${amt} XP${notes.length ? '\n' + notes.join('\n') : ''}`;
    },
  },
  {
    id: 'kevlar', name: 'KEVLAR PLATE', emoji: '🛡️', weight: 7,
    desc: 'Stops knives, fists and bad decisions. Permanently +3 defense.',
    apply: (p) => {
      p.defense = (p.defense || 5) + 3;
      return '🛡️ Defense +3 — permanent.';
    },
  },
  {
    id: 'knuckles', name: 'BRASS KNUCKLES', emoji: '🥊', weight: 7,
    desc: 'Cold, heavy, honest. Permanently +3 strength.',
    apply: (p) => {
      p.strength = (p.strength || 5) + 3;
      return '🥊 Strength +3 — permanent.';
    },
  },
  {
    id: 'fixed-fight', name: 'FIXED FIGHT', emoji: '🎯', weight: 3,
    desc: 'Your opponent took a dive. Extra training on both fronts: permanently +2 strength AND +2 defense.',
    apply: (p) => {
      p.strength = (p.strength || 5) + 2;
      p.defense = (p.defense || 5) + 2;
      return '🎯 Strength +2, Defense +2 — permanent.';
    },
  },
  {
    id: 'shades', name: 'GHOST SHADES', emoji: '🕶️', weight: 7,
    desc: 'Cameras glitch when you walk past. Permanently +3 stealth.',
    apply: (p) => {
      p.stealth = (p.stealth || 5) + 3;
      return '🕶️ Stealth +3 — permanent.';
    },
  },
  {
    id: 'ticket', name: 'GOLDEN TICKET', emoji: '🎟️', weight: 4,
    desc: 'A wire from an account that does not exist. $50,000 straight to your BANK.',
    apply: (p) => {
      p.bank += 50000;
      return '🎟️ +$50,000 wired to your bank.';
    },
  },
  {
    id: 'blackout', name: 'BLACKOUT CANDLE', emoji: '🕯️', weight: 5,
    desc: 'Burn one and the whole block goes dark. City heat drops by 10.',
    apply: (p) => {
      addCityHeat(-10, 'Blackout candle burned');
      return '🕯️ City heat −10. The block rests tonight.';
    },
  },
  {
    id: 'espresso', name: 'CORTADO RUSH', emoji: '☕', weight: 7,
    desc: 'The barista who talks to everyone taught YOU to talk. Permanently +3 charisma.',
    apply: (p) => {
      p.charisma = (p.charisma || 5) + 3;
      return '☕ Charisma +3 — permanent.';
    },
  },
  {
    id: 'ghostcard', name: 'GHOST CARD', emoji: '💳', weight: 6,
    desc: "Cloned, fresh, still warm. Pulls $1,000–$60,000 of someone else's money.",
    apply: (p) => {
      const amt = dropCash(p, 1000 + Math.floor(Math.random() * 59000));
      p.cash += amt;
      return `💳 +$${amt.toLocaleString()} cash${cloverActive(p) ? ' (clover ×2)' : ''}.`;
    },
  },
  {
    id: 'cooldown', name: 'COOL-DOWN SPRAY', emoji: '🧊', weight: 9,
    desc: 'One spray and the sirens lose your scent. Cuts your wanted level by 25.',
    apply: (p) => {
      const before = p.wanted;
      p.wanted = Math.max(0, (p.wanted || 0) - 25);
      return `🧊 Wanted ${before} → ${p.wanted}.`;
    },
  },
  {
    id: 'crown', name: "KING'S FAVOR", emoji: '👑', weight: 2,
    desc: 'The rarest drop on the streets. $25,000–$100,000 and the city knows your name.',
    apply: (p) => {
      const amt = dropCash(p, 25000 + Math.floor(Math.random() * 75000));
      p.cash += amt;
      return `👑 +$${amt.toLocaleString()} cash${cloverActive(p) ? ' (clover ×2)' : ''}. Royalty treatment.`;
    },
  },
];

function pickItem(): DropItem {
  const total = DROP_ITEMS.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of DROP_ITEMS) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return DROP_ITEMS[0];
}

export function formatDrop(item: DropItem): string {
  return `✦ ────────── ✦
${item.emoji} *${item.name}* just dropped
Use .claim to claim it


${item.desc}
✦ ────────── ✦`;
}

type ActiveDrop = { itemId: string; at: number; claimedBy?: string; claimedAt?: number };

function dropStore(): Record<string, ActiveDrop> {
  const db = getDb() as any;
  if (!db.activeDrops) db.activeDrops = {};
  return db.activeDrops;
}

/** Groups with the syndicates module live (explicit or unlocked-all). */
function syndicateGroups(): string[] {
  const db = getDb() as any;
  const groups = db.platformGroups || {};
  return Object.keys(groups).filter((gid) => {
    const mods = Array.isArray(groups[gid]?.modules) ? groups[gid].modules : [];
    return mods.length === 0 || mods.includes('syndicates');
  });
}

/** Fire one drop to every syndicates-enabled group. */
async function runDropCycle(): Promise<void> {
  // lazy import — keeps this module loadable without the WhatsApp stack (tests)
  const { getSocket } = await import('../connection/whatsapp.js');
  const sock = getSocket();
  if (!sock) return;
  const store = dropStore();
  const item = pickItem(); // same item city-wide this cycle — feels like an event
  const text = formatDrop(item);
  for (const gid of syndicateGroups()) {
    try {
      await sock.sendMessage(gid, { text });
      store[gid] = { itemId: item.id, at: Date.now() };
    } catch (e: any) {
      console.warn('[drops] failed for group', gid, e?.message || e);
    }
  }
  saveDb();
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the 10-minute drop scheduler (idempotent, unref'd). */
export function startDrops(): void {
  if (timer) return;
  timer = setInterval(() => {
    runDropCycle().catch((e: any) => console.warn('[drops] cycle failed', e?.message || e));
  }, DROP_INTERVAL_MS);
  (timer as any).unref?.();
}

/** .claim with no args — claims the active drop in this group, or null if none. */
export function claimDrop(p: Player, chatJid: string): string | null {
  if (!chatJid?.endsWith('@g.us')) return null;
  if (!isRegistered(p) || p.banned) return null; // drops are for syndicate players only
  const store = dropStore();
  const drop = store[chatJid];
  if (!drop) return null;
  if (Date.now() - drop.at > DROP_EXPIRY_MS) {
    delete store[chatJid];
    saveDb();
    return null; // stale
  }
  if (drop.claimedBy) {
    const winner = getOrCreatePlayer(drop.claimedBy);
    return `⌛ Too slow — ${itemEmoji(drop.itemId)} was already claimed by *${winner?.name || 'someone'}*.`;
  }
  const item = DROP_ITEMS.find((i) => i.id === drop.itemId);
  if (!item) return null;
  drop.claimedBy = p.id;
  drop.claimedAt = Date.now();
  saveDb();
  const result = item.apply(p);
  savePlayer(p);
  return `✦ ${p.name} claimed ${item.emoji} *${item.name}*!\n${result}`;
}

function itemEmoji(id: string): string {
  return DROP_ITEMS.find((i) => i.id === id)?.emoji || '🎁';
}

/** Admin/dev view of everything that can drop. */
export function formatDropList(): string {
  const total = DROP_ITEMS.reduce((s, i) => s + i.weight, 0);
  return `🎁 *STREET DROPS* — every 10 min
━━━━━━━━━━━━━━━━━━━━
` + DROP_ITEMS.map((i) => `${i.emoji} *${i.name}* — ${Math.round((i.weight / total) * 100)}%\n   ${i.desc}`).join('\n') + `
━━━━━━━━━━━━━━━━━━━━
When one drops: .claim — first tap wins.`;
}