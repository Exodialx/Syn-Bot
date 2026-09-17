/**
 * Achievement / badge system
 * Founders = first 15 players who completed .start + .set name
 */
import { Player, savePlayer, getAllPlayers } from './player.js';
import { getDb, saveDb } from '../db/database.js';

type Badge = {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  check: (p: Player) => boolean;
  secret?: boolean;
};

function classState(p: Player): any {
  const db = getDb() as any;
  return db.classState?.[p.id] || {};
}

function portfolioValue(p: Player): number {
  const db = getDb() as any;
  const port = db.portfolios?.[p.id];
  if (!port) return 0;
  const market = db.crypto?.tokens || [];
  let total = 0;
  for (const [sym, h] of Object.entries(port as Record<string, any>)) {
    const qty = typeof h === 'number' ? h : h?.qty || 0;
    if (qty <= 0) continue;
    const t = market.find((x: any) => x.symbol === sym || x.id === sym);
    if (t) total += qty * (t.price || 0);
  }
  return total;
}

function tradeCount(p: Player): number {
  const db = getDb() as any;
  return (db.tradeHistory?.[p.id] || []).length;
}

/** Register founder slot when username is first set — first 15 only */
export function tryGrantFounder(p: Player): void {
  if (!(p as any).usernameSet) return;
  const db = getDb() as any;
  if (!db.founders) db.founders = [];
  if (db.founders.includes(p.id)) return;
  if (db.founders.length >= 15) return;
  db.founders.push(p.id);
  if (!p.achievements) p.achievements = [];
  const slot = db.founders.length; // 1..15
  const id = `founder_${slot}`;
  if (!p.achievements.includes(id)) {
    p.achievements.push(id);
    p.achievements.push('founder'); // generic founder badge
    p.cash = (p.cash || 0) + 15000;
    p.xp = (p.xp || 0) + 500;
    savePlayer(p);
  }
  saveDb();
}

function founderSlot(p: Player): number {
  const db = getDb() as any;
  const list: string[] = db.founders || [];
  const i = list.indexOf(p.id);
  return i >= 0 ? i + 1 : 0;
}

const BADGES: Badge[] = [
  // ── FOUNDERS (first 15) ──
  { id: 'founder', name: 'Founder', emoji: '🏛️', desc: 'One of the first 15 players', check: p => founderSlot(p) > 0 },
  { id: 'founder_1', name: 'Founder #1', emoji: '👑', desc: 'The very first name set', check: p => founderSlot(p) === 1 },
  { id: 'founder_2', name: 'Founder #2', emoji: '🥈', desc: 'Second founder', check: p => founderSlot(p) === 2 },
  { id: 'founder_3', name: 'Founder #3', emoji: '🥉', desc: 'Third founder', check: p => founderSlot(p) === 3 },
  { id: 'founder_5', name: 'Founder #5', emoji: '5️⃣', desc: 'Fifth founder', check: p => founderSlot(p) === 5 },
  { id: 'founder_10', name: 'Founder #10', emoji: '🔟', desc: 'Tenth founder', check: p => founderSlot(p) === 10 },
  { id: 'founder_15', name: 'Founder #15', emoji: '✨', desc: 'Last of the founding fifteen', check: p => founderSlot(p) === 15 },

  // ── ADMIN ──
  { id: 'admin_badge', name: 'Syndicate Admin', emoji: '🔐', desc: 'Server administrator', check: p => !!p.isAdmin },

  // ── Progression ──
  { id: 'first_blood', name: 'First Blood', emoji: '🩸', desc: 'Reach Level 2', check: p => p.level >= 2 },
  { id: 'level_5', name: 'Getting Started', emoji: '🌱', desc: 'Reach Level 5', check: p => p.level >= 5 },
  { id: 'level_10', name: 'Established', emoji: '🔟', desc: 'Reach Level 10', check: p => p.level >= 10 },
  { id: 'level_25', name: 'Veteran', emoji: '🎖️', desc: 'Reach Level 25', check: p => p.level >= 25 },
  { id: 'level_50', name: 'Legend', emoji: '🏅', desc: 'Reach Level 50', check: p => p.level >= 50 },
  { id: 'level_75', name: 'Mythic', emoji: '🌟', desc: 'Reach Level 75', check: p => p.level >= 75 },
  { id: 'level_100', name: 'Immortal', emoji: '♾️', desc: 'Reach Level 100', check: p => p.level >= 100 },
  { id: 'class_3', name: 'Rising', emoji: '⭐', desc: 'Class Level 3', check: p => p.classLevel >= 3 },
  { id: 'class_5', name: 'Made', emoji: '👑', desc: 'Class Level 5', check: p => p.classLevel >= 5 },
  { id: 'class_8', name: 'Underboss', emoji: '🔱', desc: 'Class Level 8', check: p => p.classLevel >= 8 },
  { id: 'class_10', name: 'Capo di tutti', emoji: '⚜️', desc: 'Class Level 10', check: p => p.classLevel >= 10 },

  // ── Wealth ──
  { id: 'cash_10k', name: 'Pocket Change', emoji: '💵', desc: 'Hold $10,000 cash', check: p => p.cash >= 10000 },
  { id: 'cash_50k', name: 'Solid', emoji: '💰', desc: 'Hold $50,000 cash', check: p => p.cash >= 50000 },
  { id: 'cash_100k', name: 'Six Figures', emoji: '🤑', desc: 'Hold $100,000 cash', check: p => p.cash >= 100000 },
  { id: 'cash_500k', name: 'Half Milli', emoji: '💸', desc: 'Hold $500,000 cash', check: p => p.cash >= 500000 },
  { id: 'cash_1m', name: 'Millionaire', emoji: '💎', desc: 'Hold $1,000,000 cash', check: p => p.cash >= 1_000_000 },
  { id: 'cash_5m', name: 'High Roller', emoji: '🥂', desc: 'Hold $5,000,000 cash', check: p => p.cash >= 5_000_000 },
  { id: 'rich_boy', name: 'Rich Boy', emoji: '🏦', desc: 'Net worth $250k+', check: p => p.cash + p.bank >= 250000 },
  { id: 'tycoon', name: 'Tycoon', emoji: '🏛️', desc: 'Net worth $2M+', check: p => p.cash + p.bank >= 2_000_000 },
  { id: 'oligarch', name: 'Oligarch', emoji: '🌍', desc: 'Net worth $10M+', check: p => p.cash + p.bank >= 10_000_000 },
  { id: 'bank_100k', name: 'Rainy Day', emoji: '🏧', desc: 'Bank $100,000+', check: p => p.bank >= 100000 },
  { id: 'bank_1m', name: 'Vault Keeper', emoji: '🔐', desc: 'Bank $1,000,000+', check: p => p.bank >= 1_000_000 },

  // ── Heat / Wanted ──
  { id: 'heat_50', name: 'On Radar', emoji: '📡', desc: 'Reach 50 Heat', check: p => p.heat >= 50 },
  { id: 'heat_100', name: 'City Problem', emoji: '🔥', desc: 'Max heat (100)', check: p => p.heat >= 100 },
  { id: 'wanted_30', name: 'Marked', emoji: '🎯', desc: 'Reach 30 Wanted', check: p => p.wanted >= 30 },
  { id: 'wanted_80', name: 'Most Wanted', emoji: '🚨', desc: 'Reach 80 Wanted', check: p => p.wanted >= 80 },

  // ── Roles ──
  { id: 'role_biz', name: 'The Suit', emoji: '💼', desc: 'Choose Businessman', check: p => p.role === 'Businessman' },
  { id: 'role_mafia', name: 'Made Man', emoji: '🕴️', desc: 'Choose Mafia', check: p => p.role === 'Mafia' },
  { id: 'role_hitman', name: 'The Ghost', emoji: '👻', desc: 'Choose Hitman', check: p => p.role === 'Hitman' },

  // ── Business ──
  { id: 'biz_1', name: 'Shopkeeper', emoji: '🏪', desc: 'Own 1 business', check: p => (p.businesses?.length || 0) >= 1 },
  { id: 'biz_3', name: 'Chain Owner', emoji: '🏬', desc: 'Own 3 businesses', check: p => (p.businesses?.length || 0) >= 3 },
  { id: 'biz_6', name: 'Empire', emoji: '🏙️', desc: 'Own 6 businesses', check: p => (p.businesses?.length || 0) >= 6 },
  { id: 'biz_10', name: 'Monopoly', emoji: '🗺️', desc: 'Own 10 businesses', check: p => (p.businesses?.length || 0) >= 10 },
  { id: 'biz_hq', name: 'Syndicate HQ Owner', emoji: '⚜️', desc: 'Own The Syndicate HQ', check: p => (p.businesses || []).includes('syndicate-hq') },

  // ── Crypto ──
  { id: 'crypto_first', name: 'Bag Holder', emoji: '🪙', desc: 'Any crypto holding', check: p => portfolioValue(p) > 0 },
  { id: 'crypto_10k', name: 'Trader', emoji: '📈', desc: 'Portfolio $10k+', check: p => portfolioValue(p) >= 10000 },
  { id: 'crypto_100k', name: 'Whale', emoji: '🐋', desc: 'Portfolio $100k+', check: p => portfolioValue(p) >= 100000 },
  { id: 'crypto_1m', name: 'Crypto Baron', emoji: '🚀', desc: 'Portfolio $1M+', check: p => portfolioValue(p) >= 1_000_000 },
  { id: 'crypto_trades_10', name: 'Active Trader', emoji: '🔄', desc: '10+ crypto trades', check: p => tradeCount(p) >= 10 },
  { id: 'crypto_trades_50', name: 'Market Maker', emoji: '📊', desc: '50+ crypto trades', check: p => tradeCount(p) >= 50 },

  // ── Class systems ──
  { id: 'crew_3', name: 'Crew Boss', emoji: '👥', desc: 'Mafia crew of 3+', check: p => (classState(p).crew?.length || 0) >= 3 },
  { id: 'crew_6', name: 'Full Family', emoji: '🕶️', desc: 'Max crew (6)', check: p => (classState(p).crew?.length || 0) >= 6 },
  { id: 'territory_1', name: 'Turf', emoji: '📍', desc: 'Claim a territory', check: p => (classState(p).territories?.length || 0) >= 1 },
  { id: 'territory_3', name: 'Kingpin', emoji: '🗺️', desc: 'Own 3 territories', check: p => (classState(p).territories?.length || 0) >= 3 },
  { id: 'sig_5', name: 'Assassin', emoji: '🗡️', desc: '5 signature kills', check: p => (classState(p).signatureKills || 0) >= 5 },
  { id: 'sig_20', name: 'Apex Predator', emoji: '💀', desc: '20 signature kills', check: p => (classState(p).signatureKills || 0) >= 20 },
  { id: 'sig_50', name: 'Reaper', emoji: '☠️', desc: '50 signature kills', check: p => (classState(p).signatureKills || 0) >= 50 },
  { id: 'shell_on', name: 'Shell Game', emoji: '🏢', desc: 'Activate shell companies', check: p => !!classState(p).shellActive },
  { id: 'loan_shark', name: 'Shark', emoji: '🦈', desc: 'Issue a loan', check: p => (classState(p).loansGiven?.length || 0) >= 1 },
  { id: 'racket_3', name: 'Protector', emoji: '🤝', desc: '3 protection rackets', check: p => (classState(p).protectionTargets?.length || 0) >= 3 },
  { id: 'ghost_used', name: 'Vanished', emoji: '🌫️', desc: 'Used Ghost Protocol', check: p => (classState(p).lastGhost || 0) > 0 },
  { id: 'hitlist_full', name: 'The List', emoji: '📋', desc: 'Full hit list (3)', check: p => (classState(p).hitList?.length || 0) >= 3 },

  // ── Social / misc ──
  { id: 'named', name: 'Identity', emoji: '🪪', desc: 'Set a username', check: p => !!(p as any).usernameSet },
  { id: 'daily_streak_3', name: 'Regular', emoji: '📅', desc: '3-day daily streak', check: p => (p.dailyStreak || 0) >= 3 },
  { id: 'daily_streak_7', name: 'Addict', emoji: '🔥', desc: '7-day daily streak', check: p => (p.dailyStreak || 0) >= 7 },
  { id: 'daily_streak_30', name: 'Loyal Soldier', emoji: '📆', desc: '30-day daily streak', check: p => (p.dailyStreak || 0) >= 30 },
  { id: 'prison_break', name: 'Escape Artist', emoji: '🔓', desc: 'Heat 80+ or Wanted 50+', check: p => p.heat >= 80 || (p.wanted || 0) >= 50 },
  { id: 'armed', name: 'Locked & Loaded', emoji: '🔫', desc: 'Own a weapon', check: p => {
    const inv = (p as any).inventory || [];
    return inv.some((id: string) => ['knife','pistol','smg','rifle','sniper','bat','taser','shotgun'].includes(id));
  }},
  { id: 'full_tank', name: 'Walking Fortress', emoji: '🛡️', desc: 'Own armor', check: p => {
    const inv = (p as any).inventory || [];
    return inv.some((id: string) => ['vest','helmet','plate','suit','cloak'].includes(id));
  }},
];

export function checkAndGrant(p: Player): string[] {
  if (!p.achievements) p.achievements = [];
  // founders tracked separately at name-set time
  tryGrantFounder(p);

  const unlocked: string[] = [];
  for (const b of BADGES) {
    if (!p.achievements.includes(b.id) && b.check(p)) {
      p.achievements.push(b.id);
      p.xp = (p.xp || 0) + 150;
      p.cash = (p.cash || 0) + 2000;
      unlocked.push(`${b.emoji} *${b.name}* — ${b.desc}`);
    }
  }
  if (unlocked.length) savePlayer(p);
  return unlocked;
}

export function listAchievements(p: Player): string {
  if (!p.achievements) p.achievements = [];
  const justGot = checkAndGrant(p);

  const unlocked = BADGES.filter(b => p.achievements.includes(b.id));
  const locked = BADGES.filter(b => !p.achievements.includes(b.id) && !b.secret);

  let out = `🏆 *ACHIEVEMENT BADGES*
━━━━━━━━━━━━━━━━━━━━
✅ Unlocked: ${unlocked.length}/${BADGES.length}

`;
  if (unlocked.length) {
    out += `*YOUR BADGES*\n`;
    for (const b of unlocked) {
      out += `${b.emoji} *${b.name}*\n   ${b.desc}\n`;
    }
  }
  out += `\n*LOCKED*\n`;
  for (const b of locked.slice(0, 12)) {
    out += `⬛ ${b.emoji} ${b.name}\n`;
  }
  if (locked.length > 12) out += `… +${locked.length - 12} more\n`;
  out += `━━━━━━━━━━━━━━━━━━━━`;
  if (justGot.length) {
    out += `\n\n🎉 *NEW UNLOCKS*\n` + justGot.map(x => `▸ ${x}`).join('\n');
  }
  return out;
}

/** Compact badge line for profile */
export function formatBadgeLine(p: Player): string {
  if (!p.achievements?.length) return '🏆 No badges yet — .achievements';
  const map = new Map(BADGES.map(b => [b.id, b]));
  const emojis: string[] = [];
  for (const id of p.achievements) {
    const b = map.get(id);
    if (b) emojis.push(b.emoji);
  }
  // unique preserve order
  const seen = new Set<string>();
  const unique = emojis.filter(e => (seen.has(e) ? false : (seen.add(e), true)));
  const show = unique.slice(0, 24).join(' ');
  return `🏆 Badges (${p.achievements.length})\n${show || '—'}`;
}

export function formatNewBadges(unlocked: string[]): string {
  if (!unlocked.length) return '';
  return `\n🎉 ` + unlocked.join('\n🎉 ');
}

export function getBadgeDefs(): Badge[] {
  return BADGES;
}
