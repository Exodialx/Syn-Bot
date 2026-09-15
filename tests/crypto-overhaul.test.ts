import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/game/player.js';
import {
  createCryptoMarket,
  getTokenBySymbol,
  buyCrypto,
  sellCrypto,
  getCryptoPortfolioSummary,
  calculateTradingFee,
  calculateSlippage,
  quoteCryptoTrade,
  compareCryptoAssets,
  getCryptoTradeHistory,
  calculateCryptoTradeStatistics,
  addCryptoWatchlist,
  getCryptoWatchlist,
  removeCryptoWatchlist,
  updateCryptoMarket,
  type CryptoAsset
} from '../src/game/crypto.js';
import { GameStore } from '../src/data/store.js';
import { processIncomingMessage } from '../src/connection/messageRouter.js';
import { handleCommand } from '../src/commands/commandRegistry.js';

describe('crypto overhaul', () => {
  it('creates a real multi-asset market with stablecoin separation', () => {
    const market = createCryptoMarket();
    const btc = market.assets.BTC;
    const usdt = market.assets.USDT;

    expect(btc).toBeTruthy();
    expect(usdt).toBeTruthy();
    expect(btc.name).toContain('Bitcoin');
    expect(usdt.category).toBe('Stablecoin');
    expect(Object.keys(market.assets).length).toBeGreaterThanOrEqual(18);
  });

  it('executes buy and sell trades with fee, slippage, and portfolio accounting', () => {
    const player = createPlayer('crypto-user-1', 'Crypto Buyer', 'Businessman');
    player.cash = 500000;
    const market = createCryptoMarket();

    const buy = buyCrypto(player, market, 'BTC', 0.5);
    expect(buy.success).toBe(true);
    expect(player.crypto.BTC).toBeGreaterThan(0);
    expect(player.cash).toBeLessThan(500000);

    const summary = getCryptoPortfolioSummary(player, market);
    expect(summary.totalValue).toBeGreaterThan(0);
    expect(summary.realizedPnL).toBeGreaterThanOrEqual(0);

    const sell = sellCrypto(player, market, 'BTC', 0.25);
    expect(sell.success).toBe(true);
    expect(player.crypto.BTC).toBeGreaterThanOrEqual(0.25);
    expect(sell.fee).toBeGreaterThan(0);
  });

  it('rejects invalid trades and protected values', () => {
    const player = createPlayer('crypto-user-2', 'Crypto Guard', 'Businessman');
    player.cash = 5000;
    const market = createCryptoMarket();

    expect(() => buyCrypto(player, market, 'BTC', -1)).toThrow();
    expect(() => sellCrypto(player, market, 'BTC', 1)).toThrow();
    expect(() => buyCrypto(player, market, 'NOPE', 1)).toThrow();
    expect(calculateTradingFee(1000)).toBeGreaterThan(0);
    expect(calculateSlippage(1000, 0.02)).toBeGreaterThan(0);
  });

  it('persists market state and keeps prices usable after restart', () => {
    const store = new GameStore('data/crypto-overhaul-save.json');
    const market = createCryptoMarket();
    store.setMarket(market);

    const loaded = store.getMarket();
    expect(loaded).toBeTruthy();
    expect(loaded?.assets.BTC.symbol).toBe('BTC');
    expect(loaded?.assets.USDT.category).toBe('Stablecoin');
  });

  it('routes crypto commands through the real command pipeline', () => {
    const profileResult = processIncomingMessage('.crypto price BTC', 'crypto-router-1', 'private');
    expect(profileResult.command).toBe('crypto');
    expect(profileResult.response).toContain('BTC');

    const registryResult = handleCommand('.crypto buy BTC 0.1', 'crypto-router-2');
    expect(registryResult).toContain('BTC');
  });

  it('provides quote estimates without mutating state', () => {
    const player = createPlayer('crypto-quote-1', 'Quote User', 'Businessman');
    player.cash = 500000;
    const market = createCryptoMarket();
    const beforeCash = player.cash;
    const beforeTrades = player.cryptoTrades.length;

    const quote = quoteCryptoTrade(market, 'BTC', 'BUY', 0.25);
    expect(quote.referencePrice).toBeGreaterThan(0);
    expect(quote.executionPrice).toBeGreaterThan(quote.referencePrice);
    expect(quote.grossValue).toBeGreaterThan(0);
    expect(player.cash).toBe(beforeCash);
    expect(player.cryptoTrades.length).toBe(beforeTrades);
  });

  it('tracks rich portfolio, trade, and comparison analytics', () => {
    const player = createPlayer('crypto-phase2-1', 'Phase 2 User', 'Businessman');
    player.cash = 1000000;
    const market = createCryptoMarket();

    const buyOne = buyCrypto(player, market, 'BTC', 0.5);
    const buyTwo = buyCrypto(player, market, 'ETH', 1.5);
    const sellOne = sellCrypto(player, market, 'BTC', 0.25);

    expect(buyOne.success).toBe(true);
    expect(buyTwo.success).toBe(true);
    expect(sellOne.success).toBe(true);

    const summary = getCryptoPortfolioSummary(player, market);
    expect(summary.totalValue).toBeGreaterThan(0);
    expect(summary.assetCount).toBeGreaterThanOrEqual(2);
    expect(summary.totalTradeCount).toBeGreaterThanOrEqual(3);
    expect(summary.bestPerformer).toBeTruthy();
    expect(summary.worstPerformer).toBeTruthy();

    const trades = getCryptoTradeHistory(player, { side: 'BUY' });
    expect(trades.length).toBeGreaterThanOrEqual(2);

    const stats = calculateCryptoTradeStatistics(player);
    expect(stats.totalTrades).toBeGreaterThanOrEqual(3);
    expect(stats.buyCount).toBeGreaterThanOrEqual(2);
    expect(stats.sellCount).toBeGreaterThanOrEqual(1);

    const comparison = compareCryptoAssets('BTC', 'ETH');
    expect(comparison.ok).toBe(true);
    expect(comparison.a.symbol).toBe('BTC');
    expect(comparison.b.symbol).toBe('ETH');
  });

  it('supports watchlist persistence and duplicate prevention', () => {
    const player = createPlayer('crypto-watch-1', 'Watch User', 'Businessman');

    expect(addCryptoWatchlist(player, 'BTC')).toBe(true);
    expect(addCryptoWatchlist(player, 'BTC')).toBe(false);
    expect(addCryptoWatchlist(player, 'ETH')).toBe(true);
    expect(removeCryptoWatchlist(player, 'BTC')).toBe(true);
    expect(removeCryptoWatchlist(player, 'BTC')).toBe(false);
    expect(getCryptoWatchlist(player)).toEqual(['ETH']);
  });

  it('runs a deterministic market tick and surfaces live event data', () => {
    const market = createCryptoMarket();
    const before = market.assets.BTC.price;
    const next = updateCryptoMarket(market, { randomSource: () => 0.5, forcedRegime: 'Bull Market', injectedEvent: null });

    expect(next.marketStatus).toBe('Bull Market');
    expect(next.assets.BTC.price).not.toBe(before);
    expect(next.eventLabel).toBeTruthy();
    expect(next.newsFeed.length).toBeGreaterThanOrEqual(0);
  });
});
