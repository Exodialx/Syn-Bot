import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/game/player.js';
import { createCryptoMarket, buyCrypto, sellCrypto } from '../src/game/crypto.js';
import { chargeMoney, grantMoney, createLoan } from '../src/game/economy.js';
import { getPlayerById, handleCommand } from '../src/commands/commandRegistry.js';
import { getPropertyById, getDefaultPropertyState, upgradeProperty, buyProperty } from '../src/game/properties.js';
import { GameStore } from '../src/data/store.js';

describe('economy phase2 runtime tests', () => {
  it('crypto buy uses chargeMoney and creates ledger entry', () => {
    const player = createPlayer('eco-crypto-buy-1', 'Trader');
    player.cash = 1000000;
    const market = createCryptoMarket();

    const result = buyCrypto(player as any, market, 'BTC', 0.01);
    expect(result.success).toBe(true);
    expect(result.totalCashSpent).toBeGreaterThan(0);
    const tx = player.economyLedger.find(e => e.id === result.tradeId || e.source === 'CRYPTO_BUY');
    expect(tx).toBeDefined();
    expect(tx?.type).toBe('DEBIT');
  });

  it('crypto sell uses grantMoney and creates ledger entry', () => {
    const player = createPlayer('eco-crypto-sell-1', 'Trader');
    player.cash = 1000000;
    const market = createCryptoMarket();

    // buy first
    const buy = buyCrypto(player as any, market, 'ETH', 1);
    expect(buy.success).toBe(true);

    const sell = sellCrypto(player as any, market, 'ETH', 1);
    expect(sell.success).toBe(true);
    const tx = player.economyLedger.find(e => e.id === sell.tradeId || e.source === 'CRYPTO_SELL');
    expect(tx).toBeDefined();
    expect(tx?.type).toBe('CREDIT');
  });

  it('duplicate transaction protection rejects repeated tx ids', () => {
    const player = createPlayer('eco-dup-1', 'Trader');
    player.cash = 1000000;
    const txId = 'dup-test-1';
    chargeMoney({ player: player as any, amount: 100, source: 'TRADE', reason: 'dup test', transactionId: txId });
    expect(() => chargeMoney({ player: player as any, amount: 50, source: 'TRADE', reason: 'dup test', transactionId: txId })).toThrow();
  });

  it('insufficient funds prevented for crypto buy', () => {
    const player = createPlayer('eco-insuf-1', 'Trader');
    player.cash = 10;
    const market = createCryptoMarket();
    expect(() => buyCrypto(player as any, market, 'BTC', 1)).toThrow();
  });

  it('property upgrade financing uses loan/bank and ledger (no direct cash bypass)', () => {
    const player = createPlayer('eco-prop-1', 'Owner');
    // give low cash but allow loan by credit score
    player.cash = 1000;
    player.bank = 0;
    player.credit = 500; // credit score

    const prop = getPropertyById('studio-apartment')!;
    // assign ownership
    player.properties = [prop.id];
    player.propertyState = { [prop.id]: getDefaultPropertyState(prop, prop.purchasePrice, Date.now()) };

    const beforeDebt = player.debt || 0;
    const res = upgradeProperty(player as any, prop.id, 'DEVELOPMENT');
    expect(res.success).toBe(true);
    // debt should be at least as large as before (loan created if needed)
    expect(player.debt).toBeGreaterThanOrEqual(beforeDebt);
    // ledger contains a PROPERTY_UPGRADE debit
    const tx = player.economyLedger.find(e => e.source === 'PROPERTY_UPGRADE');
    expect(tx).toBeDefined();
  });

  it('save and reload preserves economy state', () => {
    const store = new GameStore('./data/save.test.json');
    const player = createPlayer('eco-save-1', 'Saver');
    player.cash = 5000;
    chargeMoney({ player: player as any, amount: 1000, source: 'TRADE', reason: 'save test' });
    store.setPlayer(player);
    const loaded = store.getPlayer(player.id)!;
    expect(loaded).toBeDefined();
    expect(loaded.economyLedger.length).toBeGreaterThan(0);
    // cleanup
    try { store.setPlayer({ ...loaded, id: 'eco-save-1' }); } catch {}
  });
});
