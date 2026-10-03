/**
 * SYNDICATES CRYPTO — full 35-token market
 * Shared prices, per-player portfolios, liquidity impact, events, momentum.
 */
import { Player, savePlayer, addXp } from './player.js';
import { getDb, saveDb } from '../db/database.js';

export type TokenTier = 1 | 2 | 3 | 4 | 5;

export type Token = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;      // 0–1 deeper book
  volatility: number;     // base %
  demand: number;         // -1 .. 1
  momentum: number;       // consecutive ticks
  trend: 'bullish' | 'bearish' | 'sideways';
  tier: TokenTier;
  circulatingSupply: number;
};

type MarketState = {
  tokens: Token[];
  lastTick: number;
  sentiment: 'Bull' | 'Bear' | 'Sideways' | 'Volatile';
  sentimentUntil: number;
  event: string;
  eventUntil: number;
  eventTarget?: string;   // symbol for targeted events
};

const TIER_MULT: Record<TokenTier, number> = {
  1: 0.35,
  2: 0.65,
  3: 1.0,
  4: 1.55,
  5: 2.4
};

const FEE_BY_TIER: Record<TokenTier, number> = {
  1: 0.005,
  2: 0.008,
  3: 0.012,
  4: 0.016,
  5: 0.02
};

/** 35 tokens across 5 tiers */
const DEFAULT_TOKENS: Omit<Token, 'change24h' | 'volume24h' | 'demand' | 'momentum' | 'trend'>[] = [
  // Tier 1 — Blue Chip (5)
  { symbol: 'NXUS', name: 'Nexus Blue', price: 68420, liquidity: 0.95, volatility: 0.018, tier: 1, circulatingSupply: 21_000_000, marketCap: 1_436_820_000_000 },
  { symbol: 'VELA', name: 'Vela Ether', price: 3420, liquidity: 0.92, volatility: 0.022, tier: 1, circulatingSupply: 120_000_000, marketCap: 410_400_000_000 },
  { symbol: 'DYNO', name: 'Dyno Reserve', price: 185, liquidity: 0.90, volatility: 0.025, tier: 1, circulatingSupply: 450_000_000, marketCap: 83_250_000_000 },
  { symbol: 'KRON', name: 'Kron Gold', price: 890, liquidity: 0.88, volatility: 0.028, tier: 1, circulatingSupply: 80_000_000, marketCap: 71_200_000_000 },
  { symbol: 'SOLX', name: 'Solarix', price: 142, liquidity: 0.85, volatility: 0.032, tier: 1, circulatingSupply: 550_000_000, marketCap: 78_100_000_000 },
  // Tier 2 — Established (8)
  { symbol: 'ARQX', name: 'Arqex', price: 28.4, liquidity: 0.78, volatility: 0.045, tier: 2, circulatingSupply: 1_200_000_000, marketCap: 34_080_000_000 },
  { symbol: 'PLEX', name: 'Plexus', price: 12.8, liquidity: 0.75, volatility: 0.05, tier: 2, circulatingSupply: 2_500_000_000, marketCap: 32_000_000_000 },
  { symbol: 'DYNA', name: 'Dynasty', price: 9.6, liquidity: 0.72, volatility: 0.055, tier: 2, circulatingSupply: 1_800_000_000, marketCap: 17_280_000_000 },
  { symbol: 'FLUX', name: 'Flux Chain', price: 6.2, liquidity: 0.70, volatility: 0.06, tier: 2, circulatingSupply: 3_000_000_000, marketCap: 18_600_000_000 },
  { symbol: 'GRIT', name: 'Grit Protocol', price: 4.85, liquidity: 0.68, volatility: 0.062, tier: 2, circulatingSupply: 2_200_000_000, marketCap: 10_670_000_000 },
  { symbol: 'ZYNC', name: 'Zync Network', price: 3.1, liquidity: 0.65, volatility: 0.068, tier: 2, circulatingSupply: 4_000_000_000, marketCap: 12_400_000_000 },
  { symbol: 'MOVA', name: 'Mova Layer', price: 2.45, liquidity: 0.63, volatility: 0.07, tier: 2, circulatingSupply: 5_500_000_000, marketCap: 13_475_000_000 },
  { symbol: 'CELO', name: 'Celoria', price: 1.92, liquidity: 0.60, volatility: 0.075, tier: 2, circulatingSupply: 6_000_000_000, marketCap: 11_520_000_000 },
  // Tier 3 — Mid-Cap (10)
  { symbol: 'BRIX', name: 'Brix Token', price: 0.84, liquidity: 0.52, volatility: 0.09, tier: 3, circulatingSupply: 8_000_000_000, marketCap: 6_720_000_000 },
  { symbol: 'ECHO', name: 'Echo Protocol', price: 0.62, liquidity: 0.50, volatility: 0.095, tier: 3, circulatingSupply: 9_500_000_000, marketCap: 5_890_000_000 },
  { symbol: 'VAST', name: 'Vast Network', price: 0.48, liquidity: 0.48, volatility: 0.10, tier: 3, circulatingSupply: 12_000_000_000, marketCap: 5_760_000_000 },
  { symbol: 'LUMA', name: 'Luma Finance', price: 0.35, liquidity: 0.45, volatility: 0.11, tier: 3, circulatingSupply: 15_000_000_000, marketCap: 5_250_000_000 },
  { symbol: 'NEON', name: 'Neon Chain', price: 0.28, liquidity: 0.42, volatility: 0.115, tier: 3, circulatingSupply: 18_000_000_000, marketCap: 5_040_000_000 },
  { symbol: 'TORK', name: 'Tork DAO', price: 0.19, liquidity: 0.40, volatility: 0.12, tier: 3, circulatingSupply: 22_000_000_000, marketCap: 4_180_000_000 },
  { symbol: 'APEX', name: 'Apex Labs', price: 0.14, liquidity: 0.38, volatility: 0.13, tier: 3, circulatingSupply: 25_000_000_000, marketCap: 3_500_000_000 },
  { symbol: 'DREX', name: 'Drexico', price: 0.095, liquidity: 0.35, volatility: 0.14, tier: 3, circulatingSupply: 30_000_000_000, marketCap: 2_850_000_000 },
  { symbol: 'FUSE', name: 'Fuse Network', price: 0.072, liquidity: 0.33, volatility: 0.145, tier: 3, circulatingSupply: 35_000_000_000, marketCap: 2_520_000_000 },
  { symbol: 'ONYX', name: 'Onyx Protocol', price: 0.055, liquidity: 0.30, volatility: 0.15, tier: 3, circulatingSupply: 40_000_000_000, marketCap: 2_200_000_000 },
  // Tier 4 — Small-Cap (7)
  { symbol: 'VOLT', name: 'Volt Energy', price: 0.028, liquidity: 0.22, volatility: 0.18, tier: 4, circulatingSupply: 50_000_000_000, marketCap: 1_400_000_000 },
  { symbol: 'PRISM', name: 'Prism AI', price: 0.016, liquidity: 0.18, volatility: 0.20, tier: 4, circulatingSupply: 60_000_000_000, marketCap: 960_000_000 },
  { symbol: 'DUST', name: 'Dust Coin', price: 0.0092, liquidity: 0.15, volatility: 0.22, tier: 4, circulatingSupply: 80_000_000_000, marketCap: 736_000_000 },
  { symbol: 'MEME', name: 'Meme Forge', price: 0.0055, liquidity: 0.12, volatility: 0.25, tier: 4, circulatingSupply: 100_000_000_000, marketCap: 550_000_000 },
  { symbol: 'PEPO', name: 'Pepo Coin', price: 0.0031, liquidity: 0.10, volatility: 0.28, tier: 4, circulatingSupply: 120_000_000_000, marketCap: 372_000_000 },
  { symbol: 'RUGG', name: 'Rugg Protocol', price: 0.0018, liquidity: 0.08, volatility: 0.32, tier: 4, circulatingSupply: 150_000_000_000, marketCap: 270_000_000 },
  { symbol: 'YOLO', name: 'Yolo Finance', price: 0.00095, liquidity: 0.06, volatility: 0.35, tier: 4, circulatingSupply: 200_000_000_000, marketCap: 190_000_000 },
  // Tier 5 — Degen / Meme (5)
  { symbol: 'CHAD', name: 'Chad Inu', price: 0.00042, liquidity: 0.04, volatility: 0.45, tier: 5, circulatingSupply: 420_000_000_000, marketCap: 176_400_000 },
  { symbol: 'BONK2', name: 'Bonk2.0', price: 0.00018, liquidity: 0.03, volatility: 0.55, tier: 5, circulatingSupply: 690_000_000_000, marketCap: 124_200_000 },
  { symbol: 'WAGMI', name: 'Wagmi Coin', price: 0.000085, liquidity: 0.025, volatility: 0.65, tier: 5, circulatingSupply: 1_000_000_000_000, marketCap: 85_000_000 },
  { symbol: 'NGMI', name: 'Ngmi Token', price: 0.000032, liquidity: 0.02, volatility: 0.80, tier: 5, circulatingSupply: 2_000_000_000_000, marketCap: 64_000_000 },
  { symbol: 'GIG', name: 'Gigachad', price: 0.000012, liquidity: 0.015, volatility: 0.95, tier: 5, circulatingSupply: 5_000_000_000_000, marketCap: 60_000_000 }
];

function makeToken(base: typeof DEFAULT_TOKENS[0]): Token {
  return {
    ...base,
    change24h: 0,
    volume24h: 0,
    demand: 0,
    momentum: 0,
    trend: 'sideways'
  };
}

function getMarket(): MarketState {
  const db = getDb() as any;
  if (!db.crypto || !Array.isArray(db.crypto.tokens) || db.crypto.tokens.length < 30) {
    db.crypto = {
      tokens: DEFAULT_TOKENS.map(makeToken),
      lastTick: Date.now(),
      sentiment: 'Sideways',
      sentimentUntil: 0,
      event: 'Market open',
      eventUntil: 0
    };
  }
  // ensure all symbols present
  const existing = new Set(db.crypto.tokens.map((t: Token) => t.symbol));
  for (const def of DEFAULT_TOKENS) {
    if (!existing.has(def.symbol)) {
      db.crypto.tokens.push(makeToken(def));
    }
  }
  if (!db.crypto.sentiment) db.crypto.sentiment = 'Sideways';
  return db.crypto as MarketState;
}

function ensurePortfolio(p: Player): Record<string, { qty: number; avgCost: number }> {
  const db = getDb() as any;
  if (!db.portfolios) db.portfolios = {};
  if (!db.portfolios[p.id]) db.portfolios[p.id] = {};
  // migrate old flat qty → {qty, avgCost}
  const port = db.portfolios[p.id];
  for (const k of Object.keys(port)) {
    if (typeof port[k] === 'number') {
      port[k] = { qty: port[k], avgCost: 0 };
    }
  }
  return port;
}

function ensureTradeHistory(p: Player): any[] {
  const db = getDb() as any;
  if (!db.tradeHistory) db.tradeHistory = {};
  if (!db.tradeHistory[p.id]) db.tradeHistory[p.id] = [];
  return db.tradeHistory[p.id];
}

function ensureWatchlist(p: Player): string[] {
  const db = getDb() as any;
  if (!db.watchlists) db.watchlists = {};
  if (!db.watchlists[p.id]) db.watchlists[p.id] = [];
  return db.watchlists[p.id];
}

function findToken(symbol: string): Token | undefined {
  const m = getMarket();
  const s = symbol.toUpperCase();
  return m.tokens.find(t => t.symbol === s);
}

function sentimentModifier(s: MarketState['sentiment']): number {
  switch (s) {
    case 'Bull': return 1.15;
    case 'Bear': return 0.85;
    case 'Volatile': return 1.0;
    default: return 1.0;
  }
}

/** Passive market tick */
export function tickMarket() {
  const m = getMarket();
  const now = Date.now();
  const mins = (now - (m.lastTick || now)) / 60000;
  if (mins < 0.35) return; // ~20s minimum between ticks

  // rotate global sentiment
  if (now > (m.sentimentUntil || 0)) {
    const roll = Math.random();
    if (roll < 0.28) { m.sentiment = 'Bull'; m.sentimentUntil = now + 8 * 60_000; }
    else if (roll < 0.50) { m.sentiment = 'Bear'; m.sentimentUntil = now + 7 * 60_000; }
    else if (roll < 0.65) { m.sentiment = 'Volatile'; m.sentimentUntil = now + 5 * 60_000; }
    else { m.sentiment = 'Sideways'; m.sentimentUntil = now + 10 * 60_000; }
  }

  // random market events
  if (now > (m.eventUntil || 0) && Math.random() < 0.12) {
    fireRandomEvent(m);
  }

  const sentMod = sentimentModifier(m.sentiment);
  let tier1Delta = 0;

  for (const t of m.tokens) {
    const tierM = TIER_MULT[t.tier];
    let noise = (Math.random() - 0.5) * 2; // -1..1
    if (m.sentiment === 'Volatile') noise *= 1.6;

    // momentum compounds
    const momFactor = 1 + Math.sign(t.momentum) * Math.min(0.35, Math.abs(t.momentum) * 0.04);

    let delta = t.volatility * tierM * sentMod * noise * momFactor * 0.55;

    // event targeting
    if (m.eventTarget === t.symbol && now < m.eventUntil) {
      if (m.event.includes('PUMP')) delta += 0.12 + Math.random() * 0.18;
      if (m.event.includes('RUG')) delta -= 0.55 + Math.random() * 0.3;
      if (m.event.includes('HACK')) delta -= 0.25 + Math.random() * 0.2;
      if (m.event.includes('WHALE') && m.event.includes('buy')) delta += 0.06 + Math.random() * 0.08;
      if (m.event.includes('HALVING') && t.tier === 1) delta += 0.03 + Math.random() * 0.04;
    }

    // Tier 1 correlation drag
    if (t.tier === 1) {
      tier1Delta += delta;
    } else if (Math.abs(tier1Delta) > 0.01) {
      delta += tier1Delta * 0.18 * (1 / t.tier);
    }

    const old = t.price;
    t.price = Math.max(t.price * (1 + delta), t.price * 0.0001, 0.00000001);
    const pct = ((t.price - old) / old) * 100;
    t.change24h = Math.max(-99, Math.min(999, t.change24h * 0.92 + pct * 0.35));

    // momentum
    if (pct > 0.15) t.momentum = Math.min(12, t.momentum + 1);
    else if (pct < -0.15) t.momentum = Math.max(-12, t.momentum - 1);
    else t.momentum = Math.sign(t.momentum) * Math.max(0, Math.abs(t.momentum) - 1);

    t.trend = t.momentum >= 3 ? 'bullish' : t.momentum <= -3 ? 'bearish' : 'sideways';
    t.demand = Math.max(-1, Math.min(1, t.demand * 0.9 + (Math.random() - 0.5) * 0.2));
    t.marketCap = t.price * t.circulatingSupply;
    // volume decay
    t.volume24h = Math.max(0, t.volume24h * 0.97);
  }

  m.lastTick = now;
  saveDb();
}

function fireRandomEvent(m: MarketState) {
  const now = Date.now();
  const roll = Math.random();
  const degen = m.tokens.filter(t => t.tier >= 4);
  const blue = m.tokens.filter(t => t.tier === 1);
  const any = m.tokens;

  if (roll < 0.18 && degen.length) {
    const t = degen[Math.floor(Math.random() * degen.length)];
    m.event = `🚀 PUMP — ${t.symbol}`;
    m.eventTarget = t.symbol;
    m.eventUntil = now + 90_000;
  } else if (roll < 0.28 && degen.length) {
    const t = degen[Math.floor(Math.random() * degen.length)];
    m.event = `💀 RUG — ${t.symbol}`;
    m.eventTarget = t.symbol;
    m.eventUntil = now + 60_000;
  } else if (roll < 0.40) {
    const t = any[Math.floor(Math.random() * any.length)];
    m.event = `🐋 WHALE buy — ${t.symbol}`;
    m.eventTarget = t.symbol;
    m.eventUntil = now + 75_000;
  } else if (roll < 0.50) {
    const t = any[Math.floor(Math.random() * any.length)];
    m.event = `🔓 HACK — ${t.symbol}`;
    m.eventTarget = t.symbol;
    m.eventUntil = now + 120_000;
  } else if (roll < 0.58) {
    m.event = `📋 LISTING hype`;
    m.eventTarget = undefined;
    m.eventUntil = now + 100_000;
    // boost volume on a random mid/small
    const t = m.tokens[Math.floor(Math.random() * m.tokens.length)];
    t.volume24h += t.marketCap * 0.02;
  } else if (roll < 0.70) {
    m.event = `⚖️ REGULATION scare`;
    m.sentiment = 'Bear';
    m.sentimentUntil = now + 6 * 60_000;
    m.eventUntil = now + 5 * 60_000;
    m.eventTarget = undefined;
  } else if (roll < 0.80 && blue.length) {
    const t = blue[Math.floor(Math.random() * blue.length)];
    m.event = `⛏️ HALVING — ${t.symbol}`;
    m.eventTarget = t.symbol;
    m.eventUntil = now + 4 * 60_000;
  } else {
    m.event = 'Market open';
    m.eventUntil = now + 3 * 60_000;
    m.eventTarget = undefined;
  }
}

/** Liquidity impact from large order */
function applyImpact(t: Token, notionalUsd: number, side: 'buy' | 'sell'): number {
  // deeper liquidity → smaller impact
  const depth = Math.max(0.01, t.liquidity) * (t.marketCap * 0.0008 + 50_000);
  let impact = notionalUsd / depth;
  impact = Math.min(0.45, impact); // cap
  if (side === 'buy') {
    t.price *= (1 + impact);
  } else {
    t.price *= (1 - impact);
  }
  t.volume24h += notionalUsd;
  t.liquidity = Math.min(0.99, t.liquidity + notionalUsd / (t.marketCap + 1) * 0.15);
  t.marketCap = t.price * t.circulatingSupply;
  return impact;
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

function changeArrow(c: number): string {
  if (c > 0.05) return `▲ +${c.toFixed(1)}%`;
  if (c < -0.05) return `▼ ${c.toFixed(1)}%`;
  return `▸ ${c.toFixed(1)}%`;
}

function trendIcon(t: Token['trend']): string {
  return t === 'bullish' ? '📈' : t === 'bearish' ? '📉' : '➡️';
}

// ─── Public API ───────────────────────────────────────────────

export function formatMarket(): string {
  tickMarket();
  const m = getMarket();
  const sorted = [...m.tokens].sort((a, b) => b.marketCap - a.marketCap);
  const sentIcon = m.sentiment === 'Bull' ? '🟢' : m.sentiment === 'Bear' ? '🔴' : m.sentiment === 'Volatile' ? '⚡' : '⚪';
  const byChg = [...m.tokens].sort((a, b) => b.change24h - a.change24h);
  const gainer = byChg[0];
  const loser = byChg[byChg.length - 1];

  let out = `🪙 *CRYPTO MARKET*
━━━━━━━━━━━━━━━━━━━━
${sentIcon} *${m.sentiment}*  ·  ${m.event}
▲ ${gainer.symbol} ${changeArrow(gainer.change24h)}
▼ ${loser.symbol} ${changeArrow(loser.change24h)}
━━━━━━━━━━━━━━━━━━━━
`;
  for (const tok of sorted.slice(0, 10)) {
    out += `*${tok.symbol}*  $${formatPrice(tok.price)}  ${changeArrow(tok.change24h)} ${trendIcon(tok.trend)}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.crypto <SYM>     detail
.crypto buy|sell <SYM> <amt>
.crypto portfolio · watchlist
.crypto top gainers|losers|volume`;
  return out;
}

export function formatTokenDetail(symbol: string): string {
  tickMarket();
  const t = findToken(symbol);
  if (!t) return '❌ Unknown token. .crypto';
  const tierName = ['', 'Blue Chip', 'Established', 'Mid-Cap', 'Small-Cap', 'Degen'][t.tier] || `T${t.tier}`;
  return `🪙 *${t.name}*
━━━━━━━━━━━━━━━━━━━━
▸ Symbol    *${t.symbol}*
▸ Price     $${formatPrice(t.price)}
▸ 24h       ${changeArrow(t.change24h)}
▸ Trend     ${trendIcon(t.trend)} ${t.trend}
▸ Tier      ${t.tier} · ${tierName}
▸ Liquidity ${(t.liquidity * 100).toFixed(0)}%
▸ Volume    $${Math.floor(t.volume24h).toLocaleString()}
▸ MCap      $${(t.marketCap / 1e9).toFixed(2)}B
━━━━━━━━━━━━━━━━━━━━
.crypto buy ${t.symbol} <amt>
.crypto sell ${t.symbol} <amt>
.crypto watch ${t.symbol}`;
}

export function buyCrypto(p: Player, symbol: string, amount: number): string {
  tickMarket();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return '❌ Invalid amount';
  const t = findToken(symbol);
  if (!t) return '❌ Unknown token. .crypto';

  const feeRate = FEE_BY_TIER[t.tier];
  // businessman discount handled by caller if needed
  const notional = t.price * amount;
  const impact = applyImpact(t, notional, 'buy');
  const execPrice = t.price; // post-impact
  const gross = execPrice * amount;
  const fee = Math.ceil(gross * feeRate);
  const total = Math.ceil(gross + fee);

  if (p.cash < total) {
    return `❌ Need $${total.toLocaleString()} (incl. ${(feeRate * 100).toFixed(1)}% fee)`;
  }

  p.cash -= total;
  const port = ensurePortfolio(p);
  const prev = port[t.symbol] || { qty: 0, avgCost: 0 };
  const newQty = prev.qty + amount;
  const newAvg = newQty > 0 ? (prev.avgCost * prev.qty + gross) / newQty : execPrice;
  port[t.symbol] = { qty: newQty, avgCost: newAvg };

  const hist = ensureTradeHistory(p);
  hist.unshift({ side: 'buy', symbol: t.symbol, qty: amount, price: execPrice, fee, ts: Date.now() });
  if (hist.length > 20) hist.length = 20;

  savePlayer(p);
  saveDb();
  return `🟢 *BUY* ${amount} *${t.symbol}*
━━━━━━━━━━━━━━━━━━━━
▸ Price   $${formatPrice(execPrice)}
▸ Impact  +${(impact * 100).toFixed(2)}%
▸ Fee     $${fee.toLocaleString()}
▸ Total   -$${total.toLocaleString()}
💰 Cash $${p.cash.toLocaleString()}`;
}

export function sellCrypto(p: Player, symbol: string, amount: number): string {
  tickMarket();
  if (!Number.isFinite(amount) || amount <= 0) return '❌ Invalid amount';
  const t = findToken(symbol);
  if (!t) return '❌ Unknown token';

  const port = ensurePortfolio(p);
  const held = port[t.symbol];
  if (!held || held.qty < amount) {
    return `❌ You hold ${held?.qty ?? 0} ${t.symbol}`;
  }

  const feeRate = FEE_BY_TIER[t.tier];
  const notional = t.price * amount;
  const impact = applyImpact(t, notional, 'sell');
  const execPrice = t.price;
  const gross = Math.floor(execPrice * amount);
  const fee = Math.floor(gross * feeRate);
  const net = gross - fee;

  const costBasis = held.avgCost * amount;
  const realized = net - costBasis;

  held.qty -= amount;
  if (held.qty <= 1e-12) delete port[t.symbol];
  else port[t.symbol] = held;

  p.cash += net;
  addXp(p, Math.min(120, Math.floor(Math.abs(realized) / 1500) + 5));

  const hist = ensureTradeHistory(p);
  hist.unshift({ side: 'sell', symbol: t.symbol, qty: amount, price: execPrice, fee, realized, ts: Date.now() });
  if (hist.length > 20) hist.length = 20;

  savePlayer(p);
  saveDb();
  const pnlStr = realized >= 0 ? `+$${Math.floor(realized).toLocaleString()}` : `-$${Math.floor(Math.abs(realized)).toLocaleString()}`;
  return `🔴 *SELL* ${amount} *${t.symbol}*
━━━━━━━━━━━━━━━━━━━━
▸ Price    $${formatPrice(execPrice)}
▸ Impact   -${(impact * 100).toFixed(2)}%
▸ Fee      $${fee.toLocaleString()}
▸ Net      +$${net.toLocaleString()}
▸ Realized ${pnlStr}
💰 Cash $${p.cash.toLocaleString()}`;
}

export function formatPortfolio(p: Player): string {
  tickMarket();
  const m = getMarket();
  const port = ensurePortfolio(p);
  let totalValue = 0;
  let totalCost = 0;
  const rows: string[] = [];
  for (const tok of m.tokens) {
    const h = port[tok.symbol];
    if (!h || h.qty <= 0) continue;
    const val = h.qty * tok.price;
    totalValue += val;
    totalCost += h.avgCost * h.qty;
    const uPnl = val - h.avgCost * h.qty;
    const sign = uPnl >= 0 ? '▲' : '▼';
    const uStr = `${sign} $${Math.abs(Math.floor(uPnl)).toLocaleString()}`;
    const qtyStr = h.qty < 1 ? h.qty.toPrecision(3) : h.qty.toLocaleString();
    rows.push(`*${tok.symbol}*  ${qtyStr}\n   $${formatPrice(val)}  ${uStr}  ${trendIcon(tok.trend)}`);
  }
  if (!rows.length) {
    return `💼 *PORTFOLIO*
━━━━━━━━━━━━━━━━━━━━
Empty book.

.crypto buy <SYM> <amt>
.crypto top gainers`;
  }
  const uTotal = totalValue - totalCost;
  const uTotalStr = uTotal >= 0
    ? `▲ +$${Math.floor(uTotal).toLocaleString()}`
    : `▼ -$${Math.floor(Math.abs(uTotal)).toLocaleString()}`;
  return `💼 *PORTFOLIO*
━━━━━━━━━━━━━━━━━━━━
${rows.join('\n')}
━━━━━━━━━━━━━━━━━━━━
Value   $${Math.floor(totalValue).toLocaleString()}
uP/L    ${uTotalStr}
.crypto history  ·  .crypto`;
}

export function formatTop(kind: 'gainers' | 'losers' | 'volume'): string {
  tickMarket();
  const m = getMarket();
  let list = [...m.tokens];
  if (kind === 'gainers') list.sort((a, b) => b.change24h - a.change24h);
  else if (kind === 'losers') list.sort((a, b) => a.change24h - b.change24h);
  else list.sort((a, b) => b.volume24h - a.volume24h);
  list = list.slice(0, 10);
  const title = kind === 'gainers' ? 'TOP GAINERS' : kind === 'losers' ? 'TOP LOSERS' : 'TOP VOLUME';
  const icon = kind === 'gainers' ? '📈' : kind === 'losers' ? '📉' : '📊';
  let out = `${icon} *${title}*
━━━━━━━━━━━━━━━━━━━━
`;
  list.forEach((tok, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    out += `${rank} *${tok.symbol}*  $${formatPrice(tok.price)}  ${changeArrow(tok.change24h)}\n`;
  });
  out += `━━━━━━━━━━━━━━━━━━━━
.crypto <SYM>  ·  .crypto buy <SYM> <amt>`;
  return out;
}

export function formatWatchlist(p: Player): string {
  tickMarket();
  const wl = ensureWatchlist(p);
  if (!wl.length) {
    return `⭐ *WATCHLIST*
━━━━━━━━━━━━━━━━━━━━
Empty.

.crypto watch <SYM>`;
  }
  let out = `⭐ *WATCHLIST*
━━━━━━━━━━━━━━━━━━━━
`;
  for (const sym of wl) {
    const tok = findToken(sym);
    if (!tok) continue;
    out += `*${tok.symbol}*  $${formatPrice(tok.price)}  ${changeArrow(tok.change24h)} ${trendIcon(tok.trend)}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━
.crypto unwatch <SYM>`;
  return out;
}

export function watchToken(p: Player, symbol: string): string {
  const t = findToken(symbol);
  if (!t) return '❌ Unknown token';
  const wl = ensureWatchlist(p);
  if (wl.includes(t.symbol)) return `Already watching ${t.symbol}`;
  if (wl.length >= 15) return '❌ Watchlist full (max 15)';
  wl.push(t.symbol);
  saveDb();
  return `⭐ Now watching ${t.symbol}`;
}

export function unwatchToken(p: Player, symbol: string): string {
  const t = findToken(symbol);
  if (!t) return '❌ Unknown token';
  const wl = ensureWatchlist(p);
  const i = wl.indexOf(t.symbol);
  if (i < 0) return `Not watching ${t.symbol}`;
  wl.splice(i, 1);
  saveDb();
  return `Removed ${t.symbol} from watchlist`;
}

export function formatHistory(p: Player): string {
  const hist = ensureTradeHistory(p);
  if (!hist.length) {
    return `📜 *TRADE HISTORY*
━━━━━━━━━━━━━━━━━━━━
No trades yet.`;
  }
  let out = `📜 *TRADE HISTORY*
━━━━━━━━━━━━━━━━━━━━
`;
  for (const h of hist.slice(0, 12)) {
    const side = h.side === 'buy' ? '🟢 BUY ' : '🔴 SELL';
    out += `${side} ${h.qty} *${h.symbol}* @ $${formatPrice(h.price)}\n`;
  }
  out += `━━━━━━━━━━━━━━━━━━━━`;
  return out;
}

export function buyCryptoWithRole(p: Player, symbol: string, amount: number): string {
  // 0.25% discount applied by reducing effective fee inside if needed;
  // for simplicity we keep standard fees and note the role perk elsewhere.
  return buyCrypto(p, symbol, amount);
}
