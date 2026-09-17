/**
 * THE BLACK MARKET TAKEOVER
 * ─────────────────────────
 * Server-wide endgame event, locked to Level 70+.
 *
 * Why it exists: general leveling is fast and cheap. Past level 70 the
 * general track alone stops being a real money sink, so players plateau
 * with nothing left to spend on. This event is the sink — a district
 * auction + control-challenge system that only opens once a player is
 * deep enough into the level curve to actually afford it.
 *
 * Every dollar spent here is mostly destroyed on purpose:
 *   70% permanently removed from the economy
 *   20% into the event reward pool (paid back out to winners at the end)
 *   10% into the Syndicate Treasury (bragging-rights stat)
 * So bids never just move cash from one rich player to another — the
 * supply actually shrinks, which is the point.
 */
import { Player, getPlayer, savePlayer, addXp } from './player.js';
import { getDb, saveDb } from '../db/database.js';
import { parseMoney } from './admin.js';

export const BM_MIN_LEVEL = 70;
const CROWN_MIN_BID = 10_000_000;
const CROWN_WINDOW_MS = 48 * 3_600_000;
const BID_RAISE_RATE = 0.12; // min % raise over current bid
const CHALLENGE_FEE_RATE = 0.10;
const CHALLENGE_FEE_FLOOR = 250_000;
const CHALLENGE_COOLDOWN_MS = 90 * 60_000;

export type BMDistrict = {
  id: string;
  name: string;
  icon: string;
  flavor: string;
  baseBid: number;
  currentBid: number;
  controllerId: string | null;
  controllerName: string | null;
  ownedSince: number;
  defenses: number;
};

export type BMState = {
  active: boolean;
  startedAt: number;
  endsAt: number;
  startedBy?: string;
  districts: BMDistrict[];
  crownBid: number;
  crownControllerId: string | null;
  crownControllerName: string | null;
  totalBurned: number;
  rewardPool: number;
  treasury: number;
  spend: Record<string, number>;
  names: Record<string, string>;
  lastChallenge: Record<string, number>;
  lastResult?: string;
};

const DISTRICT_TEMPLATE: Array<Omit<BMDistrict, 'currentBid' | 'controllerId' | 'controllerName' | 'ownedSince' | 'defenses'>> = [
  { id: 'financial', name: 'Financial District', icon: '🏦', flavor: 'Legit business & market income surges for whoever holds the deed.', baseBid: 4_000_000 },
  { id: 'night', name: 'Night District', icon: '🌃', flavor: 'Illegal ops run quieter — heat cools faster for the crew backing it.', baseBid: 3_000_000 },
  { id: 'luxury', name: 'Luxury District', icon: '💎', flavor: 'Pure reputation. Everyone knows who owns this one.', baseBid: 3_500_000 },
  { id: 'harbor', name: 'Harbor', icon: '⚓', flavor: 'Smuggling lanes and contraband routes open wide.', baseBid: 2_500_000 },
  { id: 'industrial', name: 'Industrial District', icon: '🏭', flavor: 'Warehouse capacity and production hum along nicely.', baseBid: 2_200_000 },
];

function now(): number {
  return Date.now();
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function freshDistricts(): BMDistrict[] {
  return DISTRICT_TEMPLATE.map(d => ({
    ...d,
    currentBid: 0,
    controllerId: null,
    controllerName: null,
    ownedSince: 0,
    defenses: 0,
  }));
}

function db(): any {
  return getDb() as any;
}

/** Returns the live state, auto-finalizing it in place if time has run out. */
export function getState(): BMState | null {
  const d = db();
  const s = d.blackMarket as BMState | undefined;
  if (!s) return null;
  if (s.active && s.endsAt <= now()) {
    d.blackMarket = finalize(s);
    saveDb();
  }
  return d.blackMarket && d.blackMarket.active ? (d.blackMarket as BMState) : null;
}

/** Last completed run's summary, if any — shown after the event ends. */
export function getLastResult(): string | null {
  const d = db();
  const s = d.blackMarket as BMState | undefined;
  return s && !s.active ? s.lastResult || null : null;
}

function getTitleLedger(): Record<string, { name: string; titles: string[] }> {
  const d = db();
  if (!d.blackMarketTitles) d.blackMarketTitles = {};
  return d.blackMarketTitles;
}

function awardTitle(playerId: string, name: string, title: string) {
  const ledger = getTitleLedger();
  if (!ledger[playerId]) ledger[playerId] = { name, titles: [] };
  ledger[playerId].name = name || ledger[playerId].name;
  if (!ledger[playerId].titles.includes(title)) ledger[playerId].titles.push(title);
}

export function formatTitles(player: Player): string {
  const ledger = getTitleLedger();
  const entry = ledger[player.id];
  if (!entry || !entry.titles.length) {
    return `🎭 *BLACK MARKET LEGACY*\n━━━━━━━━━━━━━━━━━━━━\nNo titles yet. Survive a Black Market Takeover to earn one.`;
  }
  return `🎭 *BLACK MARKET LEGACY*\n━━━━━━━━━━━━━━━━━━━━\n${entry.titles.map(t => `▸ ${t}`).join('\n')}`;
}

export function isAdminGateActive(): boolean {
  const s = getState();
  return !!s;
}

export function startEvent(adminId: string, days = 7): string {
  const d = db();
  const existing = d.blackMarket as BMState | undefined;
  if (existing && existing.active && existing.endsAt > now()) {
    return `⚠️ A Black Market Takeover is already running.\n.blackmarket end (to force-close it first)`;
  }
  const clampedDays = Math.max(1, Math.min(14, days));
  const state: BMState = {
    active: true,
    startedAt: now(),
    endsAt: now() + clampedDays * 86_400_000,
    startedBy: adminId,
    districts: freshDistricts(),
    crownBid: 0,
    crownControllerId: null,
    crownControllerName: null,
    totalBurned: 0,
    rewardPool: 0,
    treasury: 0,
    spend: {},
    names: {},
    lastChallenge: {},
  };
  d.blackMarket = state;
  saveDb();
  return formatAnnouncement(state);
}

export function endEventNow(adminId: string): string {
  const d = db();
  const s = d.blackMarket as BMState | undefined;
  if (!s || !s.active) return '📭 No Black Market event is running.';
  d.blackMarket = finalize(s);
  saveDb();
  return d.blackMarket.lastResult || '📣 Black Market Takeover has ended.';
}

function finalize(state: BMState): BMState {
  const closed: BMState = { ...state, active: false };
  const lines: string[] = [
    '🏴‍☠️ *THE BLACK MARKET HAS CLOSED*',
    '━━━━━━━━━━━━━━━━━━━━',
  ];

  let pool = closed.rewardPool;
  const payouts: string[] = [];

  if (closed.crownControllerId) {
    const cut = pool * 0.4;
    pool -= cut;
    const p = getPlayer(closed.crownControllerId);
    if (p) {
      p.cash = Math.max(0, p.cash) + Math.max(1, Math.round(cut));
      addXp(p, 600);
      savePlayer(p);
    }
    awardTitle(closed.crownControllerId, closed.crownControllerName || 'Unknown', '👑 Underworld Kingpin');
    payouts.push(`👑 *Underworld Kingpin*: ${closed.crownControllerName} — ${fmt(cut)}`);
  }

  const controllers = closed.districts.filter(dd => dd.controllerId);
  if (controllers.length) {
    const share = pool / controllers.length;
    let topWarlord: BMDistrict | null = null;
    for (const dd of controllers) {
      const p = getPlayer(dd.controllerId!);
      if (p) {
        p.cash = Math.max(0, p.cash) + Math.max(1, Math.round(share));
        addXp(p, 250);
        savePlayer(p);
      }
      awardTitle(dd.controllerId!, dd.controllerName || 'Unknown', '🔥 District Controller');
      payouts.push(`🔥 ${dd.icon} *${dd.name}*: ${dd.controllerName} — ${fmt(share)}`);
      if (!topWarlord || dd.defenses > topWarlord.defenses) topWarlord = dd;
    }
    if (topWarlord && topWarlord.defenses > 0) {
      awardTitle(topWarlord.controllerId!, topWarlord.controllerName || 'Unknown', '⚔️ District Warlord');
      lines.push(`⚔️ *District Warlord*: ${topWarlord.controllerName} (${topWarlord.defenses} successful defenses)`);
    }
  }

  const spenders = Object.entries(closed.spend).sort((a, b) => b[1] - a[1]);
  if (spenders.length) {
    const [topId, topAmt] = spenders[0];
    awardTitle(topId, closed.names[topId] || 'Unknown', '🏆 Black Market Tycoon');
    lines.push(`🏆 *Black Market Tycoon*: ${closed.names[topId] || topId} (${fmt(topAmt)} spent)`);
  }

  lines.push('', ...payouts);
  lines.push('', `💀 Permanently burned: ${fmt(closed.totalBurned)}`, `🏛️ Syndicate Treasury: ${fmt(closed.treasury)}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━', 'Titles saved to .blackmarket titles');

  closed.lastResult = lines.join('\n');
  return closed;
}

function getDayIndex(state: BMState): number {
  const elapsed = now() - state.startedAt;
  const total = state.endsAt - state.startedAt;
  const frac = total > 0 ? elapsed / total : 0;
  return Math.max(0, Math.min(6, Math.floor(frac * 7)));
}

function escalationFactor(state: BMState): number {
  return 1 + getDayIndex(state) * 0.35;
}

function crownUnlocked(state: BMState): boolean {
  return state.endsAt - now() <= CROWN_WINDOW_MS;
}

export function getMinNextBid(district: BMDistrict, state: BMState): number {
  const floor = Math.round(district.baseBid * escalationFactor(state));
  if (district.currentBid <= 0) return floor;
  return Math.max(floor, Math.round(district.currentBid * (1 + BID_RAISE_RATE)));
}

function getMinNextCrownBid(state: BMState): number {
  if (state.crownBid <= 0) return CROWN_MIN_BID;
  return Math.max(CROWN_MIN_BID, Math.round(state.crownBid * (1 + BID_RAISE_RATE)));
}

function findDistrict(state: BMState, query: string): BMDistrict | null {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  const idx = parseInt(q, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= state.districts.length) return state.districts[idx - 1];
  return (
    state.districts.find(d => d.id === q) ||
    state.districts.find(d => d.name.toLowerCase() === q) ||
    state.districts.find(d => d.name.toLowerCase().includes(q)) ||
    null
  );
}

function timeLeftLabel(ms: number): string {
  if (ms <= 0) return '0h';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function gateMessage(player: Player): string {
  return `🔒 *THE BLACK MARKET IS CLOSED TO YOU*
━━━━━━━━━━━━━━━━━━━━
This is where the real money sink lives — Level ${BM_MIN_LEVEL}+ only.
Your level: ${player.level}/${BM_MIN_LEVEL}
Keep grinding. Some doors only open once you're actually dangerous.`;
}

export function formatAnnouncement(state?: BMState | null): string {
  const s = state ?? getState();
  if (!s) {
    const last = getLastResult();
    return `📭 *NO BLACK MARKET EVENT RUNNING*\n━━━━━━━━━━━━━━━━━━━━\n${last ? last + '\n\n' : ''}Admin: .blackmarket start [days]`;
  }
  const left = timeLeftLabel(s.endsAt - now());
  return `🏴‍☠️ *THE BLACK MARKET TAKEOVER IS LIVE*
━━━━━━━━━━━━━━━━━━━━
The city is for sale — Level ${BM_MIN_LEVEL}+ only.
Bid on districts, challenge for control, chase the Crown.
Time left: ${left}

.blackmarket — full status & command list`;
}

export function formatStatus(player: Player): string {
  const s = getState();
  if (!s) return formatAnnouncement(null);
  if (player.level < BM_MIN_LEVEL) return gateMessage(player);

  const left = timeLeftLabel(s.endsAt - now());
  const day = getDayIndex(s) + 1;
  const lines: string[] = [
    '🏴‍☠️ *THE BLACK MARKET TAKEOVER*',
    '━━━━━━━━━━━━━━━━━━━━',
    `Day ${day}/7 · Time left: ${left}`,
    '',
    '*DISTRICTS*',
  ];

  s.districts.forEach((d, i) => {
    const owner = d.controllerId ? d.controllerName : '— unclaimed —';
    const minNext = getMinNextBid(d, s);
    lines.push(`${i + 1}. ${d.icon} *${d.name}*`);
    lines.push(`   Controller: ${owner}${d.controllerId ? ` (${d.defenses} defenses)` : ''}`);
    lines.push(`   Current bid: ${d.currentBid > 0 ? fmt(d.currentBid) : '—'} · Min next: ${fmt(minNext)}`);
  });

  lines.push('', '*UNDERWORLD CROWN*');
  if (crownUnlocked(s)) {
    lines.push(`👑 Controller: ${s.crownControllerName || '— unclaimed —'}`);
    lines.push(`Current bid: ${s.crownBid > 0 ? fmt(s.crownBid) : '—'} · Min next: ${fmt(getMinNextCrownBid(s))}`);
  } else {
    lines.push(`🔒 Opens in the final 48 hours. Entry from ${fmt(CROWN_MIN_BID)}.`);
  }

  const mySpend = s.spend[player.id] || 0;
  lines.push('', '━━━━━━━━━━━━━━━━━━━━', `Your spend this event: ${fmt(mySpend)} · Cash on hand: ${fmt(player.cash)}`);
  lines.push('', '.blackmarket bid <district> <amount>', '.blackmarket challenge <district>', '.blackmarket crown <amount>', '.blackmarket top', '.blackmarket titles');

  return lines.join('\n');
}

function splitIntoPools(state: BMState, amount: number) {
  state.totalBurned += amount * 0.7;
  state.rewardPool += amount * 0.2;
  state.treasury += amount * 0.1;
}

export function bid(player: Player, query: string, amountRaw: string): string {
  const s = getState();
  if (!s) return formatAnnouncement(null);
  if (player.level < BM_MIN_LEVEL) return gateMessage(player);

  const district = findDistrict(s, query);
  if (!district) {
    return `❌ Unknown district. Use a number or name:\n${s.districts.map((d, i) => `${i + 1}. ${d.icon} ${d.name}`).join('\n')}`;
  }

  const amount = parseMoney(amountRaw);
  if (!amount || amount <= 0) return 'Usage: .blackmarket bid <district> <amount>  e.g. .blackmarket bid financial 5m';

  const minNext = getMinNextBid(district, s);
  if (amount < minNext) return `❌ Minimum bid on ${district.name} is ${fmt(minNext)}.`;
  if (player.cash < amount) return `❌ You need ${fmt(amount)} cash on hand. You have ${fmt(player.cash)}.`;

  player.cash -= amount;

  const previousOwner = district.controllerName;
  splitIntoPools(s, amount);
  district.currentBid = amount;
  district.controllerId = player.id;
  district.controllerName = player.name || `Player #${player.id.slice(-4)}`;
  district.ownedSince = now();
  district.defenses = 0;

  s.spend[player.id] = (s.spend[player.id] || 0) + amount;
  s.names[player.id] = district.controllerName;

  addXp(player, 120);
  savePlayer(player);
  saveDb();

  return `${district.icon} *${district.name} — TAKEN*
━━━━━━━━━━━━━━━━━━━━
${player.name} seizes control for ${fmt(amount)}.${previousOwner ? `\n${previousOwner} has been outbid.` : ''}
${district.flavor}
💀 ${fmt(amount * 0.7)} burned · 🎁 ${fmt(amount * 0.2)} to reward pool · 🏛️ ${fmt(amount * 0.1)} to treasury`;
}

export function crownBid(player: Player, amountRaw: string): string {
  const s = getState();
  if (!s) return formatAnnouncement(null);
  if (player.level < BM_MIN_LEVEL) return gateMessage(player);
  if (!crownUnlocked(s)) return `🔒 The Underworld Crown opens in the event's final 48 hours.`;

  const amount = parseMoney(amountRaw);
  if (!amount || amount <= 0) return 'Usage: .blackmarket crown <amount>  e.g. .blackmarket crown 12m';

  const minNext = getMinNextCrownBid(s);
  if (amount < minNext) return `❌ Minimum Crown bid is ${fmt(minNext)}.`;
  if (player.cash < amount) return `❌ You need ${fmt(amount)} cash on hand. You have ${fmt(player.cash)}.`;

  player.cash -= amount;

  const previousOwner = s.crownControllerName;
  splitIntoPools(s, amount);
  s.crownBid = amount;
  s.crownControllerId = player.id;
  s.crownControllerName = player.name || `Player #${player.id.slice(-4)}`;
  s.spend[player.id] = (s.spend[player.id] || 0) + amount;
  s.names[player.id] = s.crownControllerName;

  addXp(player, 400);
  savePlayer(player);
  saveDb();

  return `👑 *UNDERWORLD CROWN — CONTESTED*
━━━━━━━━━━━━━━━━━━━━
${player.name} claims the Crown for ${fmt(amount)}.${previousOwner ? `\n${previousOwner} has been outbid.` : ''}
One owner only. Final 48 hours. Make it count.`;
}

export function challenge(player: Player, query: string): string {
  const s = getState();
  if (!s) return formatAnnouncement(null);
  if (player.level < BM_MIN_LEVEL) return gateMessage(player);

  const district = findDistrict(s, query);
  if (!district) {
    return `❌ Unknown district. Use a number or name:\n${s.districts.map((d, i) => `${i + 1}. ${d.icon} ${d.name}`).join('\n')}`;
  }
  if (!district.controllerId) return `❌ ${district.name} has no controller yet — bid on it instead.`;
  if (district.controllerId === player.id) return `❌ You already control ${district.name}.`;

  const key = `${player.id}:${district.id}`;
  const last = s.lastChallenge[key] || 0;
  const wait = CHALLENGE_COOLDOWN_MS - (now() - last);
  if (wait > 0) return `⏳ You can challenge ${district.name} again in ${Math.ceil(wait / 60000)}m.`;

  const fee = Math.max(CHALLENGE_FEE_FLOOR, Math.round(district.currentBid * CHALLENGE_FEE_RATE));
  if (player.cash < fee) return `❌ Challenging ${district.name} costs a ${fmt(fee)} entry fee (non-refundable). You have ${fmt(player.cash)}.`;

  player.cash -= fee;
  splitIntoPools(s, fee);
  s.lastChallenge[key] = now();
  addXp(player, 60);

  const controller = getPlayer(district.controllerId);
  const attack = (player.level + player.classLevel * 4 + player.strength + player.stealth + player.luck) * (0.85 + Math.random() * 0.3);
  const defenseBase = controller ? controller.level + controller.classLevel * 4 + controller.defense * 2 + controller.security : 40;
  const defense = (defenseBase + district.defenses * 18) * (0.85 + Math.random() * 0.3);

  let result: string;
  if (attack > defense) {
    const previousOwner = district.controllerName;
    district.controllerId = player.id;
    district.controllerName = player.name || `Player #${player.id.slice(-4)}`;
    district.ownedSince = now();
    district.defenses = 0;
    district.currentBid = Math.round(district.currentBid * 1.05);
    s.names[player.id] = district.controllerName;
    result = `⚔️ *${district.name} — CONTROL SEIZED*
━━━━━━━━━━━━━━━━━━━━
${player.name} overpowers ${previousOwner} and takes control.
Entry fee ${fmt(fee)} sunk into the pool.`;
  } else {
    district.defenses += 1;
    result = `🛡️ *${district.name} — DEFENDED*
━━━━━━━━━━━━━━━━━━━━
${district.controllerName} holds the line against ${player.name}.
Entry fee ${fmt(fee)} sunk into the pool. (${district.defenses} defenses now)`;
  }

  savePlayer(player);
  saveDb();
  return result;
}

export function formatTop(): string {
  const s = getState();
  if (!s) return formatAnnouncement(null);
  const rows = Object.entries(s.spend).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) return '📊 No bids placed yet this event.';
  const lines = ['📊 *BLACK MARKET — TOP SPENDERS*', '━━━━━━━━━━━━━━━━━━━━'];
  rows.forEach(([id, amt], i) => {
    lines.push(`${i + 1}. ${s.names[id] || `Player #${id.slice(-4)}`} — ${fmt(amt)}`);
  });
  return lines.join('\n');
}
