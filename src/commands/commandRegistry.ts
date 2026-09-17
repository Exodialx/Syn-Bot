import { parseCommand } from '../game/commandParser.js';
import { applyXp, createPlayer, getPlayer, getPlayerSnapshot, getRegisteredPlayer, registerPlayerInstance, savePlayer as savePlayerRow, type Player, getAllPlayers } from '../game/player.js';
import { getDb } from '../db/database.js';
import { buildMainMenu, buildGuide } from '../index.js';
import { GENERAL_LEVEL_CAP, CLASS_LEVEL_CAP, getBusinessPurchaseCostModifier, getClassXpRequiredForLevel, getClassXpToNextLevel, getXpRequiredForLevel, getXpToNextLevel, grantClassXp, grantXp, hydratePlayerProgression } from '../game/progression.js';
import {
  createLoan,
  assessDebt,
  depositToBank,
  withdrawFromBank,
  getPlayerBalanceSnapshot,
  hydrateEconomyState,
  grantMoney,
  chargeMoney
} from '../game/economy.js';
import {
  getTokenBySymbol,
  CRYPTO_CATALOG,
  createCryptoMarket,
  buyCrypto,
  sellCrypto,
  getCryptoPortfolioSummary,
  quoteCryptoTrade,
  compareCryptoAssets,
  getCryptoTradeHistory,
  calculateCryptoTradeStatistics,
  addCryptoWatchlist,
  removeCryptoWatchlist,
  getCryptoWatchlist,
  getCryptoTopGainers,
  getCryptoTopLosers,
  getCryptoTopVolume,
  getCryptoTopVolatility,
  getCryptoTopMarketCap,
  getCryptoTopMomentum,
  getCryptoHoldingAnalytics,
  updateCryptoMarket
} from '../game/crypto.js';
import { CLAN_TIERS, createClan, type Clan } from '../game/clans.js';
import {
  BUSINESS_CATALOG,
  calculateBusinessOperatingSnapshot,
  collectBusinessRevenue,
  createBusinessRuntime,
  fireBusinessStaff,
  getBusinessByName,
  hireBusinessStaff
} from '../game/businessSystem.js';
import {
  addLottoEntry,
  calculateLottoEntries,
  createLottoRound,
  drawLottoRound,
  getLottoParticipantCount,
  getLottoRoundStateLabel,
  getPlayerLottoOdds,
  getPlayerLottoStats,
  getPlayerLottoTicketSummary,
  pickLottoWinner,
  renderLottoBetReceipt,
  renderLottoDashboard,
  renderLottoError,
  renderLottoHistory,
  renderLottoOdds,
  renderLottoStats,
  renderLottoTickets,
  type LottoRound
} from '../game/lotto.js';
import {
  PROPERTY_CATALOG,
  buyProperty,
  calculatePropertyIncome,
  calculatePropertyValue,
  collectPropertyIncome,
  createPropertyMortgage,
  getPortfolioSummary,
  getPropertyById,
  getPropertyByName,
  getPropertyExpenses,
  getPropertyLocation,
  payPropertyMortgage,
  renderPropertyDashboard,
  sellProperty,
  upgradeProperty
} from '../game/properties.js';
import {
  VEHICLE_CATALOG,
  buyVehicle,
  getOwnedVehicleByInstanceId,
  getVehicleById,
  getVehicleByQuery,
  getVehicleGarageSummary,
  maintainVehicle,
  sellVehicle,
  useVehicle
} from '../game/vehicles.js';
import { MARKET_CATALOG, calculateMarketPrice } from '../game/market.js';
import { JOB_CATALOG } from '../game/jobs.js';
import { QUEST_CATALOG } from '../game/quests.js';
import { TERRITORIES } from '../game/territory.js';
import { ACHIEVEMENT_CATALOG } from '../game/achievements.js';
import { CooldownManager } from '../systems/cooldowns.js';
import { createBlackjackRound, scoreHand } from '../game/gambling.js';
import { createWarState, getWarObjectiveById, resolveWarAttack, WAR_OBJECTIVES } from '../game/war.js';
import { handleFischCommand } from '../game/fisch.js';

const clanStore = new Map<string, Clan>();
const cooldowns = new CooldownManager();
const blackjackState = new Map<string, { dealer: number[]; player: number[]; bet: number; active: boolean }>();
let lottoRound: LottoRound | null = createLottoRound();

function savePlayer(player: Player): void {
  registerPlayerInstance(player);
  savePlayerRow(player);
}

export function getPlayerById(id: string): Player | undefined {
  return getRegisteredPlayer(id) ?? getPlayer(id) ?? undefined;
}

export function ensurePlayer(id: string, displayName = 'Player', role: 'Businessman' | 'Mafia' | 'Hitman' = 'Businessman'): Player {
  const existing = getPlayerById(id);
  if (existing) {
    savePlayer(existing);
    return existing;
  }

  const player = createPlayer(id, displayName, role);
  savePlayer(player);
  return player;
}

function parseMoneyArg(args: string[], fallback = 0): number {
  const raw = args.find(arg => /^\d+(\.\d+)?$/.test(arg)) ?? String(fallback);
  const numeric = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applyCooldown(playerId: string, key: string, durationMs: number): boolean {
  const active = cooldowns.has(`${playerId}:${key}`);
  if (active) return false;
  cooldowns.set(`${playerId}:${key}`, durationMs);
  return true;
}

function formatMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function propertyLookupFromOwned(player: Player, query: string): { id: string; name: string; purchasePrice: number; category: string; location: string; tier: string; } | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;

  const ownedProperties = player.properties
    .map(propertyId => getPropertyById(propertyId))
    .filter((property): property is NonNullable<typeof property> => property !== undefined);

  return ownedProperties.find(property => property.name.toLowerCase().includes(normalized) || property.id.toLowerCase().includes(normalized));
}

function renderCryptoDetail(asset: any): string {
  return [
    `💎 *${asset.symbol} — ${asset.name.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `◆ Price       ${formatMoney(asset.price)}`,
    `📉 24H Change  ${asset.change24h ?? 0}%`,
    `🌐 Market Cap  ${formatMoney(asset.marketCap ?? asset.price * (asset.circulatingSupply ?? 1))}`,
    `⚗️ Volume      ${formatMoney(asset.volume24h ?? 0)}`,
    `🔷 Liquidity   ${((asset.liquidity ?? 0) * 100).toFixed(0)}%`,
    `🌀 Volatility  ${asset.volatility ?? 0}%`,
    `🔮 Demand      ${asset.demand ?? 0}`,
    `⚡ Momentum    ${asset.momentum ?? 0}`,
    `${asset.trend ? `🟢 Trend: ${asset.trend.toUpperCase()}` : '🟢 Trend: N/A'}`,
    '━━━━━━━━━━━━━━━━━━━━',
    '.crypto buy BTC',
    '.crypto sell BTC',
    '.crypto quote BTC'
  ].join('\n');
}

function renderLeaderboard(): string {
  const entries = [...Object.values(getDb().players || {})].sort((a, b) => getPlayerWealth(b) - getPlayerWealth(a));
  return [
    '🏆 LEADERBOARD',
    ...entries.slice(0, 10).map((player, index) => `${index + 1}. ${player.displayName} — $${getPlayerWealth(player).toLocaleString()} (${player.role})`)
  ].join('\n');
}

function getPlayerWealth(player: Player): number {
  return player.cash + player.bank + Object.values(player.crypto).reduce((sum, value) => sum + value, 0) + player.businesses.length * 15000 + player.properties.length * 25000;
}

function getClanForPlayer(player: Player): Clan | undefined {
  if (!player.clanId) return undefined;
  return clanStore.get(player.clanId) ?? undefined;
}

function ensureClanState(): void {
  for (const entry of clanStore.values()) {
    clanStore.set(entry.id, entry);
  }
}

function addPlayerHistory(player: Player, text: string): void {
  player.history.push(text);
  if (player.history.length > 20) player.history = player.history.slice(-20);
}

export function handleCommand(rawInput: string, senderId: string): string {
  const parsed = parseCommand(rawInput);
  if (!parsed.command) return '⚠️ Command error. Try .help or .guide';

  const player = ensurePlayer(senderId, 'Player');
  const command = parsed.alias ?? parsed.command;
  ensureClanState();

  const fischResponse = handleFischCommand(command, parsed.args, player.id);
  if (fischResponse !== undefined) {
    return fischResponse;
  }

  switch (command) {
    case 'start': {
      const requestedRole = parsed.args[0]?.toLowerCase();
      if (requestedRole) {
        const validRole = requestedRole === 'mafia' ? 'Mafia' : requestedRole === 'hitman' ? 'Hitman' : requestedRole === 'businessman' || requestedRole === 'business' ? 'Businessman' : undefined;
        if (!validRole) {
          return '⚠️ Invalid role. Choose .start Businessman, .start Mafia, or .start Hitman.';
        }
        const chosen = ensurePlayer(senderId, 'Player', validRole);
        chosen.role = validRole;
        savePlayer(chosen);
        return `⚜️ ${validRole} account activated. Welcome to Underworld Dynasty. .menu, .profile, .guide`;
      }
      return `⚜️ Welcome to Underworld Dynasty. ${player.displayName}, choose your path: .menu, .profile, .guide`;
    }
    case 'menu':
      return buildMainMenu(player.role);
    case 'help':
      return [
        '📘 UNDERWORLD DYNASTY HELP',
        '.menu   — main command terminal',
        '.profile — player status and stats',
        '.balance — cash, bank, and debt',
        '.biz    — business catalog and upgrades',
        '.property — property market and garage',
        '.crypto — token market and pricing',
        '.loan   — borrow funds',
        '.clan   — clan operations',
        '.war    — war and territory info',
        '.blackjack — casino table',
        '.lotto  — global lotto',
        '.guide  — game overview'
      ].join('\n');
    case 'guide':
      return buildGuide();
    case 'status':
    case 'profile':
      return getPlayerSnapshot(player);
    case 'level': {
      hydratePlayerProgression(player);
      const xpNeeded = getXpToNextLevel(player);
      return `📈 Level ${player.level}/${GENERAL_LEVEL_CAP} | Lifetime XP ${player.lifetimeXp} | XP this level ${player.xp}/${getXpRequiredForLevel(player.level)} | Next level in ${xpNeeded} XP`;
    }
    case 'xp': {
      hydratePlayerProgression(player);
      return `⚡ Lifetime XP: ${player.lifetimeXp}\nCurrent level progress: ${player.xp}/${getXpRequiredForLevel(player.level)}\nNext level: ${getXpToNextLevel(player)} XP`;
    }
    case 'class': {
      hydratePlayerProgression(player);
      const nextClassXp = getClassXpToNextLevel(player);
      return `🧩 Class: ${player.role} | Class Level ${player.classLevel}/${CLASS_LEVEL_CAP} | Class XP ${player.classXp}/${getClassXpRequiredForLevel(player.classLevel)} | Next class level in ${nextClassXp} XP`;
    }
    case 'stats':
      return `📊 Stats\nJobs: ${player.stats.jobs}\nBusinesses: ${player.businesses.length}\nProperties: ${player.properties.length}\nVehicles: ${player.vehicles.length}\nHeat: ${player.heat}\nWanted: ${player.wanted}`;
    case 'balance': {
      hydrateEconomyState(player);
      const snapshot = getPlayerBalanceSnapshot(player);
      return `💵 Cash $${snapshot.cash.toLocaleString()} | 🏦 Bank $${snapshot.bank.toLocaleString()} | 📉 Debt $${snapshot.totalLiabilities.toLocaleString()} | 💳 Credit ${player.credit} | 💰 Net Worth $${snapshot.netWorth.toLocaleString()}`;
    }
    case 'bank': {
      const action = parsed.args[0]?.toLowerCase();
      const amount = parseMoneyArg(parsed.args.slice(1), 0);
      if (!action || !['deposit', 'withdraw'].includes(action)) {
        return `🏦 Bank terminal. Use .bank deposit <amount> or .bank withdraw <amount>.\nCash: $${player.cash.toLocaleString()}\nBank: $${player.bank.toLocaleString()}`;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return '⚠️ Bank amount must be greater than zero.';
      }
      try {
        if (action === 'deposit') {
          const tx = depositToBank({ player, amount, reason: 'bank deposit', source: 'BANK' });
          savePlayer(player);
          return `🏦 Deposited $${tx.amount.toLocaleString()} into the bank.\nCash: $${player.cash.toLocaleString()}\nBank: $${player.bank.toLocaleString()}`;
        }
        const tx = withdrawFromBank({ player, amount, reason: 'bank withdrawal', source: 'BANK' });
        savePlayer(player);
        return `🏦 Withdrew $${tx.amount.toLocaleString()} from the bank.\nCash: $${player.cash.toLocaleString()}\nBank: $${player.bank.toLocaleString()}`;
      } catch (error) {
        return `⚠️ ${(error as Error).message}`;
      }
    }
    case 'inventory':
    case 'inv':
      return player.inventory.length ? player.inventory.map(item => `${item.name} x${item.qty}`).join('\n') : '🎒 Inventory is empty.';
    case 'titles':
      return player.titles.length ? `🏅 Titles: ${player.titles.join(', ')}` : '🏅 No titles unlocked yet.';
    case 'achievements':
      return ACHIEVEMENT_CATALOG.slice(0, 5).map(a => `${a.title} — ${a.description}`).join('\n');
    case 'history':
      return `🧾 Recent history\n${player.history.slice(-8).join('\n')}`;
    case 'compare': {
      const sorted = [...Object.values(getDb().players || {})].sort((a, b) => getPlayerWealth(b) - getPlayerWealth(a));
      const index = sorted.findIndex(entry => entry.id === player.id) + 1;
      return `📈 ${player.displayName} is ranked #${index} by wealth with $${getPlayerWealth(player).toLocaleString()}.`;
    }
    case 'business':
    case 'biz': {
      const subcommand = parsed.args[0]?.toLowerCase();
      if (subcommand === 'list' || subcommand === 'catalog') {
        return ['💼 Business catalog', ...BUSINESS_CATALOG.slice(0, 8).map(b => `${b.name} — $${b.purchaseCost.toLocaleString()}`)].join('\n');
      }
      if (subcommand === 'buy') {
        const name = parsed.args.slice(1).join(' ');
        const business = BUSINESS_CATALOG.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (!business) return '⚠️ Business not found. Try .biz list';

        const discountModifier = getBusinessPurchaseCostModifier(player);
        const adjustedCost = Number((business.purchaseCost * (1 - discountModifier)).toFixed(2));

        if (player.cash < adjustedCost) return `⚠️ Not enough cash. ${business.name} costs $${adjustedCost.toLocaleString()}.`;
        chargeMoney({ player, amount: adjustedCost, source: 'BUSINESS', reason: `Purchased ${business.name}`, metadata: { business: business.name, category: business.category, purchaseCostBefore: business.purchaseCost, purchaseCostAfter: adjustedCost, discountPct: discountModifier } });
        player.businesses.push(business.name);
        player.stats.businessesOwned += 1;
        if (!player.businessRuntime) player.businessRuntime = {};
        player.businessRuntime[business.name] = createBusinessRuntime(business);
        grantXp(player, 50, 'BUSINESS', `command-business-purchase:${player.id}:${business.id}`);
        if (player.role === 'Businessman') {
          grantClassXp(player, 25, 'BUSINESS', `command-business-purchase-class:${player.id}:${business.id}`);
        }
        addPlayerHistory(player, `Purchased ${business.name}.`);
        savePlayer(player);
        return `▸ Purchased ${business.name} for $${adjustedCost.toLocaleString()}.`;
      }
      if (subcommand === 'info' || subcommand === 'status') {
        const name = parsed.args.slice(1).join(' ');
        const business = getBusinessByName(name) ?? BUSINESS_CATALOG.find(item => item.name.toLowerCase().includes(name.toLowerCase()));
        if (!business) return '⚠️ Business not found. Try .biz list';
        const runtime = player.businessRuntime?.[business.name] ?? createBusinessRuntime(business);
        const snapshot = calculateBusinessOperatingSnapshot(business, runtime);
        return [
          `🏢 ${business.name}`,
          `Tier: ${business.tier} | Category: ${business.category}`,
          `Capacity: ${snapshot.effectiveCapacity.toFixed(0)} (${snapshot.capacityUtilization.toFixed(2)} util.)`,
          `Demand: ${snapshot.demand.toFixed(0)} | Supply: ${snapshot.supply.toFixed(0)}`,
          `Revenue: $${snapshot.grossRevenue.toLocaleString()} | Profit: $${snapshot.netProfit.toLocaleString()}`,
          `Condition: ${snapshot.condition} | Efficiency: ${snapshot.efficiencyScore.toFixed(0)}%`,
          `Staff: ${runtime.staffTotal} | Output: ${runtime.output.toFixed(0)}`
        ].join('\n');
      }
      if (subcommand === 'hire') {
        const role = parsed.args[1] ?? 'workers';
        const count = Number(parsed.args[2] ?? '1');
        const name = parsed.args.slice(3).join(' ') || player.businesses[0];
        if (!name) return '💼 You do not own any businesses to staff.';
        const hired = hireBusinessStaff(player, name, role, Number.isFinite(count) ? count : 1, false);
        if (!hired) return `⚠️ Unable to hire ${count} ${role} for ${name}.`;
        savePlayer(player);
        return `▸ Hired ${count} ${role} for ${name}.`;
      }
      if (subcommand === 'fire') {
        const role = parsed.args[1] ?? 'workers';
        const count = Number(parsed.args[2] ?? '1');
        const name = parsed.args.slice(3).join(' ') || player.businesses[0];
        if (!name) return '💼 You do not own any businesses to reduce staff on.';
        const fired = fireBusinessStaff(player, name, role, Number.isFinite(count) ? count : 1);
        if (!fired) return `⚠️ Unable to fire ${count} ${role} from ${name}.`;
        savePlayer(player);
        return `▸ Fired ${count} ${role} from ${name}.`;
      }
      return '💼 Business terminal ready. Use .biz list, .biz buy <name>, .biz info <name>, .biz hire <role> <count> <name>.';
    }
    case 'collect':
      if (player.businesses.length === 0) return '💼 You have no businesses to collect from.';
      const collectionResults = player.businesses.map(name => collectBusinessRevenue(player, name));
      const totalIncome = collectionResults.reduce((sum, entry) => sum + entry.netProfit, 0);
      if (totalIncome <= 0) {
        addPlayerHistory(player, 'Collected no net income from businesses.');
        savePlayer(player);
        return '💰 Your operations broke even or underperformed this cycle.';
      }
      addPlayerHistory(player, `Collected $${totalIncome.toLocaleString()} from businesses.`);
      savePlayer(player);
      return `💰 Collected $${totalIncome.toLocaleString()} from your empire.`;
    case 'production':
      return `📦 Production overview: ${player.businesses.length} businesses, ${player.properties.length} properties, ${player.vehicles.length} vehicles.`;
    case 'expenses':
      return `💸 Estimated monthly expenses: $${(player.businesses.length * 1800 + player.properties.length * 1200).toLocaleString()}`;
    case 'property':
    case 'prop': {
      const subcommand = parsed.args[0]?.toLowerCase();
      const filter = parsed.args[1]?.toLowerCase();

      if (!subcommand || subcommand === 'dashboard' || subcommand === 'overview') {
        return renderPropertyDashboard(player);
      }
      if (subcommand === 'list' || subcommand === 'catalog') {
        const categoryFilter = filter && ['residential', 'commercial', 'hospitality', 'industrial', 'development', 'luxury', 'waterfront', 'endgame'].includes(filter) ? filter.toUpperCase() : undefined;
        const entries = PROPERTY_CATALOG.filter(item => !categoryFilter || item.category.toLowerCase() === categoryFilter.toLowerCase());
        const lineLimit = 8;
        return ['🏠 Property market', ...entries.slice(0, lineLimit).map(item => `${item.name} — ${formatMoney(item.purchasePrice)} | ${item.location} | ${item.tier}`)].join('\n');
      }
      if (subcommand === 'search') {
        const query = parsed.args.slice(1).join(' ');
        const matches = PROPERTY_CATALOG.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) || item.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())));
        if (!matches.length) return '⚠️ No matching properties found.';
        return matches.slice(0, 8).map(item => `${item.name} — ${formatMoney(item.purchasePrice)} | ${item.category}`).join('\n');
      }
      if (subcommand === 'buy') {
        const name = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(name) ?? getPropertyById(name);
        if (!property) return '⚠️ Property not found. Try .prop list';
        const result = buyProperty(player, property.id);
        if (!result.owned) return `⚠️ ${result.reason ?? 'Unable to purchase property.'}`;
        addPlayerHistory(player, `Purchased property: ${property.name}.`);
        savePlayer(player);
        return `🏡 Purchased ${property.name} for ${formatMoney(property.purchasePrice)}.`;
      }
      if (subcommand === 'info' || subcommand === 'status') {
        const query = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? PROPERTY_CATALOG.find(item => item.name.toLowerCase().includes(query.toLowerCase()));
        if (!property) return '⚠️ Property not found. Try .prop list';
        const state = player.propertyState?.[property.id] ?? { propertyId: property.id, level: 1, purchasePrice: property.purchasePrice, purchaseDate: Date.now(), currentValue: property.baseValue, totalUpgradeCost: 0, accumulatedIncome: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lifetimeProfit: 0, maintenanceCondition: 'GOOD', securityLevel: 1, developmentLevel: 0, rentalLevel: 0, luxuryLevel: 0, amenitiesLevel: 0, occupancy: 0.75, lastIncomeAt: Date.now(), status: 'ACTIVE', lastMaintenanceAt: Date.now(), lastTaxAt: Date.now() };
        const income = calculatePropertyIncome(player, property.id, Date.now());
        return [
          `🏠 ${property.name}`,
          `📍 ${property.location} | ⭐ ${property.tier}`,
          `💰 Value: ${formatMoney(calculatePropertyValue(property, state))} | Purchase: ${formatMoney(property.purchasePrice)}`,
          `📈 Income: ${formatMoney(income.grossIncome)} | Occupancy: ${income.occupancy}%`,
          `🛠️ Condition: ${state.maintenanceCondition} | Security: ${state.securityLevel}`,
          `🏗️ Development: ${state.developmentLevel} | ✨ Luxury: ${state.luxuryLevel}`,
          `💳 Mortgage: ${state.mortgage ? formatMoney(state.mortgage.outstandingBalance) : 'None'}`
        ].join('\n');
      }
      if (subcommand === 'portfolio') {
        const summary = getPortfolioSummary(player);
        return [
          '📊 Property portfolio',
          `Properties: ${summary.totalProperties}`,
          `Value: ${formatMoney(summary.totalValue)}`,
          `Income: ${formatMoney(summary.totalIncome)}`,
          `Expenses: ${formatMoney(summary.totalExpenses)}`,
          `Net Profit: ${formatMoney(summary.totalProfit)}`,
          `Prestige: ${summary.totalPrestige}`,
          `Highest Value: ${summary.highestValueProperty ?? 'None'}`
        ].join('\n');
      }
      if (subcommand === 'income') {
        if (!player.properties.length) return '💼 You do not own any properties.';
        const rows = player.properties.map(propertyId => {
          const property = getPropertyById(propertyId);
          if (!property) return null;
          const income = calculatePropertyIncome(player, propertyId, Date.now());
          return `${property.name}: Occupancy ${income.occupancy}% | Gross ${formatMoney(income.grossIncome)} | Net ${formatMoney(income.netIncome)}`;
        }).filter(Boolean) as string[];
        return ['💵 Property income', ...rows].join('\n');
      }
      if (subcommand === 'expenses') {
        if (!player.properties.length) return '💼 You do not own any properties.';
        const rows = player.properties.map(propertyId => {
          const property = getPropertyById(propertyId);
          if (!property) return null;
          const expenses = getPropertyExpenses(player, propertyId);
          return `${property.name}: ${formatMoney(expenses.totalExpenses)} (maintenance ${formatMoney(expenses.maintenance)} + mortgage ${formatMoney(expenses.mortgage)} + taxes ${formatMoney(expenses.taxes)} + security ${formatMoney(expenses.security)} + management ${formatMoney(expenses.management)})`;
        }).filter(Boolean) as string[];
        return ['💸 Property expenses', ...rows].join('\n');
      }
      if (subcommand === 'upgrade') {
        const type = (parsed.args[1] as string)?.toUpperCase() as any;
        const query = parsed.args.slice(2).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = upgradeProperty(player, property.id, type || 'RENTAL');
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `▸ ${property.name} upgraded with ${type || 'RENTAL'} for ${formatMoney(property.purchasePrice * 0.06)}.`;
      }
      if (subcommand === 'develop') {
        const query = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = upgradeProperty(player, property.id, 'DEVELOPMENT');
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `🏗️ Development applied to ${property.name}.`;
      }
      if (subcommand === 'maintain') {
        const query = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = upgradeProperty(player, property.id, 'MAINTENANCE');
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `🛠️ ${property.name} maintenance completed.`;
      }
      if (subcommand === 'sell') {
        const query = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = sellProperty(player, property.id);
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `💰 ${result.message}`;
      }
      if (subcommand === 'mortgage') {
        const downPayment = Number(parsed.args[1] ?? 0);
        const principal = Number(parsed.args[2] ?? 0);
        const rate = Number(parsed.args[3] ?? 0.08);
        const termMonths = Number(parsed.args[4] ?? 24);
        const query = parsed.args.slice(5).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = createPropertyMortgage(player, property.id, { downPayment, principal, rate, termMonths });
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `🏦 ${result.message}`;
      }
      if (subcommand === 'pay') {
        const amount = Number(parsed.args[1] ?? 0);
        const query = parsed.args.slice(2).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = payPropertyMortgage(player, property.id, amount);
        if (!result.success) return `⚠️ ${result.message}`;
        savePlayer(player);
        return `💳 ${result.message}`;
      }
      if (subcommand === 'collect' || subcommand === 'rent') {
        const query = parsed.args.slice(1).join(' ');
        const property = getPropertyByName(query) ?? getPropertyById(query) ?? propertyLookupFromOwned(player, query);
        if (!property) return '⚠️ Property not found.';
        const result = collectPropertyIncome(player, property.id, Date.now());
        savePlayer(player);
        if (!result.collected) return `💵 ${property.name} produced no net income this cycle.`;
        return `💵 Collected ${formatMoney(result.netIncome)} from ${property.name}.`;
      }
      return '🏠 Property terminal ready. Use .prop list, .prop buy <name>, .prop info <name>, .prop portfolio, .prop income, .prop upgrade <type> <name>, .prop mortgage <down> <principal> <rate> <months> <name>.';
    }
    case 'vehicle': {
      const subcommand = parsed.args[0]?.toLowerCase();
      if (subcommand === 'list' || subcommand === 'garage') {
        const garage = getVehicleGarageSummary(player);
        const lines = [
          '🚗 Vehicle garage',
          `Capacity: ${garage.occupied}/${garage.capacity}`,
          `Total value: $${garage.totalValue.toLocaleString()}`,
          `Total mileage: ${garage.totalMileage.toLocaleString()} km`,
          `Average condition: ${garage.averageCondition.toFixed(1)}%`,
          '',
          ...VEHICLE_CATALOG.slice(0, 10).map(item => `${item.name} — $${item.purchasePrice.toLocaleString()} (${item.category})`)
        ];
        return lines.join('\n');
      }
      if (subcommand === 'buy') {
        const target = parsed.args.slice(1).join(' ');
        const result = buyVehicle(player, target);
        savePlayer(player);
        if (!result.owned) return `⚠️ ${result.reason}`;
        return `🚗 ${result.reason}`;
      }
      if (subcommand === 'info') {
        const target = parsed.args.slice(1).join(' ');
        const vehicle = getVehicleById(target) ?? VEHICLE_CATALOG.find(item => item.name.toLowerCase().includes(target.toLowerCase()));
        if (!vehicle) return '⚠️ Vehicle not found. Try .vehicle list';
        return [
          `🚗 ${vehicle.name}`,
          `Category: ${vehicle.category}`,
          `Price: $${vehicle.purchasePrice.toLocaleString()}`,
          `Speed: ${vehicle.speed} mph`,
          `Acceleration: ${vehicle.acceleration}/100`,
          `Handling: ${vehicle.handling}/100`,
          `Durability: ${vehicle.durability}/100`,
          `Comfort: ${vehicle.comfort}/100`,
          `Prestige: ${vehicle.prestige}/100`,
          `Utility: ${vehicle.utility}/100`,
          vehicle.description
        ].join('\n');
      }
      if (subcommand === 'use') {
        const target = parsed.args.slice(1).join(' ');
        const distance = Number(parsed.args.at(-1) ?? 20);
        const owned = getVehicleByQuery(player, target) ?? getOwnedVehicleByInstanceId(player, target);
        if (!owned) return '⚠️ Vehicle not found in your garage.';
        const result = useVehicle(player, owned.instanceId, Number.isFinite(distance) ? distance : 20);
        savePlayer(player);
        if (!result.used) return `⚠️ ${result.reason ?? 'Vehicle use failed.'}`;
        return `🚗 ${result.reason ?? 'Vehicle used.'} Cost: $${result.cost.toLocaleString()}. Condition: ${result.conditionAfter.toFixed(1)}%.`;
      }
      if (subcommand === 'maintain') {
        const target = parsed.args.slice(1).join(' ');
        const owned = getVehicleByQuery(player, target) ?? getOwnedVehicleByInstanceId(player, target);
        if (!owned) return '⚠️ Vehicle not found in your garage.';
        const result = maintainVehicle(player, owned.instanceId);
        savePlayer(player);
        if (!result.success) return `⚠️ ${result.reason ?? 'Maintenance failed.'}`;
        return `🛠️ ${result.reason ?? 'Vehicle maintained.'} Cost: $${result.maintenanceCost.toLocaleString()}. Condition: ${result.condition.toFixed(1)}%.`;
      }
      if (subcommand === 'sell') {
        const target = parsed.args.slice(1).join(' ');
        const owned = getVehicleByQuery(player, target) ?? getOwnedVehicleByInstanceId(player, target);
        if (!owned) return '⚠️ Vehicle not found in your garage.';
        const result = sellVehicle(player, owned.instanceId);
        savePlayer(player);
        if (!result.success) return `⚠️ ${result.reason ?? 'Sale failed.'}`;
        return `💸 ${result.reason ?? 'Vehicle sold.'}`;
      }
      return '🚗 Vehicle garage ready. Use .vehicle list, .vehicle buy <name>, .vehicle info <name>, .vehicle use <name> <distance>, .vehicle maintain <name>, .vehicle sell <name>.';
    }
    case 'loan':
    case 'borrow': {
      const amount = parseMoneyArg(parsed.args, 10000);
      const loan = createLoan(player, amount);
      savePlayer(player);
      return `💳 Loan approved: $${loan.amount.toLocaleString()} at ${loan.rate * 100}% for ${loan.termDays} days.\n${assessDebt(player)}`;
    }
    case 'debt':
      return assessDebt(player);
    case 'liquidate':
      return player.businesses.length ? `💼 Liquidated inventory and assets. Cash +$${(player.businesses.length * 1500).toLocaleString()}.` : '💼 No liquidatable assets available.';
    case 'assets':
      return `💰 Net worth: $${getPlayerWealth(player).toLocaleString()} | Cash: $${player.cash.toLocaleString()} | Bank: $${player.bank.toLocaleString()}`;
    case 'invest':
      if (player.cash < 5000) return '📈 Need at least $5,000 to invest.';
      chargeMoney({ player, amount: 5000, source: 'TRADE', reason: 'Portfolio investment', metadata: { type: 'invest' } });
      depositToBank({ player, amount: 5000, reason: 'Portfolio investment deposit', source: 'TRADE' });
      addPlayerHistory(player, 'Invested $5,000 in a portfolio.');
      savePlayer(player);
      return '📈 Portfolio investment placed successfully.';
    case 'market': {
      if (parsed.args[0] === 'list') {
        return ['📊 Market catalog', ...MARKET_CATALOG.slice(0, 6).map(item => `${item.name} — $${calculateMarketPrice(item).toLocaleString()}`)].join('\n');
      }
      if (parsed.args[0] === 'buy') {
        const name = parsed.args.slice(1).join(' ');
        const item = MARKET_CATALOG.find(entry => entry.name.toLowerCase() === name.toLowerCase());
        if (!item) return '⚠️ Market item not found';
        const cost = calculateMarketPrice(item);
        if (player.cash < cost) return `⚠️ Not enough cash. ${item.name} costs $${cost.toLocaleString()}.`;
        chargeMoney({ player, amount: cost, source: 'TRADE', reason: `Market purchase: ${item.name}`, metadata: { item: item.name, category: item.category } });
        addInventoryItem(player, item.name, 1);
        savePlayer(player);
        return `📦 Bought ${item.name} for $${cost.toLocaleString()}.`;
      }
      return '📊 Market open. Use .market list or .market buy <item>';
    }
    case 'trade':
      return '💱 Trade console ready. Use .trade add <item>, .trade remove <item>, .trade confirm.';
    case 'auction':
      return ['🏁 Auction house', ...MARKET_CATALOG.slice(0, 5).map(item => `${item.name} — Top bid $${item.price.toLocaleString()}`)].join('\n');
    case 'crypto': {
      const market = createCryptoMarket();

      const subcommand = parsed.args[0]?.toLowerCase() ?? '';
      const symbol = (parsed.args[1] ?? 'BTC').toUpperCase();
      const quantity = Number(parsed.args[2] ?? '1');

      if (!subcommand || subcommand === 'list' || subcommand === 'market') {
        const topRows = Object.values(market.assets).slice(0, 5).map(asset => `${asset.symbol} $${asset.price.toLocaleString()} ${asset.change24h >= 0 ? '📈' : '📉'} ${asset.change24h ?? 0}%`);
        return [`💠 *SYNDICATES CRYPTO*`, '━━━━━━━━━━━━━━━━━━━━', `💹 Market: ${market.marketStatus.toUpperCase()}`, `🧠 Sentiment: ${market.sentimentLabel.toUpperCase()}`, '', ...topRows.map(line => line.slice(0, 40))].join('\n');
      }

      if (subcommand === 'price' || subcommand === 'stats') {
        const asset = market.assets[symbol] ?? market.assets.BTC;
        return renderCryptoDetail(asset);
      }

      if (subcommand === 'quote') {
        try {
          const quote = quoteCryptoTrade(market, symbol, (parsed.args[3]?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY'), quantity);
          return [`💱 *${quote.symbol} QUOTE*`, '━━━━━━━━━━━━━━━━━━━━', `Ref Price   ${formatMoney(quote.referencePrice)}`, `Exec Price  ${formatMoney(quote.executionPrice)}`, `Gross       ${formatMoney(quote.grossValue)}`, `Slippage    ${formatMoney(quote.slippageAmount)}`, `Fee         ${formatMoney(quote.fee)}`, `Total       ${formatMoney(quote.totalCost)}`].join('\n');
        } catch (error) {
          return `⚠️ ${(error as Error).message}`;
        }
      }

      if (subcommand === 'buy') {
        try {
          const result = buyCrypto(player, market, symbol, quantity);
          addPlayerHistory(player, `Bought ${result.executedQuantity} ${result.symbol}.`);
          savePlayer(player);
          const box = [`▸ *BUY FILLED — ${result.symbol}*`, '━━━━━━━━━━━━━━━━━━━━', `🎯 Qty        ${result.executedQuantity}`, `💹 Exec       ${formatMoney(result.executionPrice)}`, `💵 Gross      ${formatMoney(result.grossValue)}`, `📉 Slippage   ${formatMoney(result.slippageAmount)}`, `💸 Fee        ${formatMoney(result.fee)}`, `💰 Total      ${formatMoney(result.totalCashSpent ?? result.total)}`, `🧾 Trade ID   ${String(result.tradeId ?? 'n/a').slice(0, 10)}`].join('\n');
          return `Purchased ${result.executedQuantity} ${result.symbol} for ${formatMoney(result.totalCashSpent ?? result.total)}.\n${box}`;
        } catch (error) {
          return `⚠️ ${(error as Error).message}`;
        }
      }

      if (subcommand === 'sell') {
        try {
          const result = sellCrypto(player, market, symbol, quantity);
          addPlayerHistory(player, `Sold ${result.executedQuantity} ${result.symbol}.`);
          savePlayer(player);
          return [`▸ *SELL FILLED — ${result.symbol}*`, '━━━━━━━━━━━━━━━━━━━━', `🎯 Qty        ${result.executedQuantity}`, `💵 Proceeds   ${formatMoney(result.netProceeds ?? result.net)}`, `💸 Fee        ${formatMoney(result.fee)}`, `📈 P/L        ${formatMoney(result.realizedPnL ?? 0)}`, `🧾 Trade ID   ${String(result.tradeId ?? 'n/a').slice(0, 10)}`].join('\n');
        } catch (error) {
          return `⚠️ ${(error as Error).message}`;
        }
      }

      if (subcommand === 'portfolio') {
        const summary = getCryptoPortfolioSummary(player, market);
        const lines = summary.holdings.length ? summary.holdings.map(entry => `${entry.symbol} ${entry.quantity} ${entry.unrealizedPnL >= 0 ? '📈' : '📉'} ${formatMoney(entry.unrealizedPnL)} ${formatMoney(entry.marketValue)}`) : ['No crypto positions yet.'];
        return [`🧿 *PORTFOLIO*`, '━━━━━━━━━━━━━━━━━━━━', `💰 Value       ${formatMoney(summary.totalValue)}`, `◆ Cost Basis  ${formatMoney(summary.totalCostBasis)}`, `📈 Unrealized  ${formatMoney(summary.unrealizedPnL)}`, `🏆 Realized    ${formatMoney(summary.realizedPnL)}`, '━━━━━━━━━━━━━━━━━━━━', ...lines.slice(0, 5).map(line => line.slice(0, 40))].join('\n');
      }

      if (subcommand === 'holdings') {
        const holdings = getCryptoHoldingAnalytics(player, market);
        const lines = holdings.length ? holdings.map(entry => `${entry.symbol} ${entry.quantity} ${entry.unrealizedPnL >= 0 ? '+' : ''}${entry.unrealizedPnLPercent}% ${formatMoney(entry.marketValue)}`) : ['No active positions.'];
        return ['🪙 CRYPTO HOLDINGS', ...lines].join('\n');
      }

      if (subcommand === 'history' || subcommand === 'trades') {
        const trades = getCryptoTradeHistory(player, { sort: 'newest' });
        const lines = trades.length ? trades.slice(0, 5).map(trade => `${trade.side} ${trade.symbol} ${trade.quantity} @ ${formatMoney(trade.executionPrice)}`) : ['No crypto trades yet.'];
        return ['🧾 CRYPTO HISTORY', ...lines].join('\n');
      }

      if (subcommand === 'gainers') {
        const rows = getCryptoTopGainers(market, 5).map(asset => `${asset.symbol} ${asset.change24h ?? 0}%`);
        return ['📈 TOP GAINERS', ...rows].join('\n');
      }
      if (subcommand === 'losers') {
        const rows = getCryptoTopLosers(market, 5).map(asset => `${asset.symbol} ${asset.change24h ?? 0}%`);
        return ['📉 TOP LOSERS', ...rows].join('\n');
      }
      if (subcommand === 'volume') {
        const rows = getCryptoTopVolume(market, 5).map(asset => `${asset.symbol} ${formatMoney(asset.volume24h ?? 0)}`);
        return ['📊 TOP VOLUME', ...rows].join('\n');
      }
      if (subcommand === 'volatility') {
        const rows = getCryptoTopVolatility(market, 5).map(asset => `${asset.symbol} ${asset.volatility}%`);
        return ['⚡ TOP VOLATILITY', ...rows].join('\n');
      }
      if (subcommand === 'compare') {
        const left = (parsed.args[1] ?? 'BTC').toUpperCase();
        const right = (parsed.args[2] ?? 'ETH').toUpperCase();
        const comparison = compareCryptoAssets(left, right, market);
        if (!comparison.ok) return `⚠️ ${comparison.error}`;
        const a = comparison.a!;
        const b = comparison.b!;
        return [`${a.symbol} $${a.price.toLocaleString()} vs ${b.symbol} $${b.price.toLocaleString()}`, `${a.symbol} 24h ${a.change24h}% | ${b.symbol} 24h ${b.change24h}%`].join('\n');
      }
      if (subcommand === 'watch') {
        const target = (parsed.args[1] ?? '').toUpperCase();
        if (!target) return '⚠️ Provide a symbol to watch.';
        const added = addCryptoWatchlist(player, target);
        savePlayer(player);
        return added ? `▸ Added ${target} to watchlist.` : `⚠️ ${target} is already being watched or is invalid.`;
      }
      if (subcommand === 'unwatch') {
        const target = (parsed.args[1] ?? '').toUpperCase();
        if (!target) return '⚠️ Provide a symbol to remove.';
        const removed = removeCryptoWatchlist(player, target);
        savePlayer(player);
        return removed ? `▸ Removed ${target} from watchlist.` : `⚠️ ${target} is not on the watchlist.`;
      }
      if (subcommand === 'watchlist') {
        const watchlist = getCryptoWatchlist(player);
        return watchlist.length ? ['👀 WATCHLIST', ...watchlist.map(symbol => `• ${symbol}`)].join('\n') : '👀 Watchlist is empty.';
      }

      if (subcommand === 'sentiment') {
        return `📊 Market sentiment: ${market.sentimentLabel} (${market.sentimentScore}/100) | Status: ${market.marketStatus}`;
      }

      if (subcommand === 'stats') {
        const stats = calculateCryptoTradeStatistics(player);
        return ['📊 CRYPTO STATS', `Trades: ${stats.totalTrades}`, `Buy: ${stats.buyCount}`, `Sell: ${stats.sellCount}`, `Fees: ${formatMoney(stats.feesPaid)}`, `Realized P/L: ${formatMoney(stats.realizedPnL)}`].join('\n');
      }

      return '💠 Crypto market open. Use .crypto list, .crypto price BTC, .crypto buy BTC 0.1, .crypto portfolio';
    }
    case 'jobs':
    case 'job': {
      if (parsed.args[0] === 'list') {
        return ['💼 Jobs board', ...JOB_CATALOG.slice(0, 6).map(job => `${job.name} — $${job.reward.toLocaleString()}`)].join('\n');
      }
      if (parsed.args[0] === 'work') {
        const job = JOB_CATALOG[0];
        const paid = job.reward + player.level * 200;
        if (!applyCooldown(player.id, 'job', job.cooldownMs)) return '⏳ Job cooldown is still active.';
        grantMoney({ player, amount: paid, source: 'JOB', reason: `Worked ${job.name}`, metadata: { jobId: job.id, jobName: job.name } });
        grantXp(player, 40 + player.level * 2, 'JOB', `job-work:${player.id}:${job.id}:${Date.now()}`);
        player.stats.jobs += 1;
        addPlayerHistory(player, `Worked ${job.name} for $${paid.toLocaleString()}.`);
        savePlayer(player);
        return `💼 You worked ${job.name} and earned $${paid.toLocaleString()}.`;
      }
      return '💼 Jobs board ready. Use .jobs list or .job work.';
    }
    case 'quests':
    case 'quest': {
      if (parsed.args[0] === 'list') {
        return ['📜 Quest board', ...QUEST_CATALOG.slice(0, 5).map(quest => `${quest.title} — ${quest.rewardCash.toLocaleString()} cash / ${quest.rewardXp} XP`)].join('\n');
      }
      if (parsed.args[0] === 'claim') {
        const quest = QUEST_CATALOG[0];
        grantXp(player, quest.rewardXp, 'QUEST', `quest-claim:${player.id}:${quest.id}`);
        grantMoney({ player, amount: quest.rewardCash, source: 'QUEST', reason: `Claimed ${quest.title}`, metadata: { questId: quest.id, questTitle: quest.title } });
        player.achievements.push(quest.title);
        addPlayerHistory(player, `Claimed quest: ${quest.title}.`);
        savePlayer(player);
        return `▸ Quest claimed: ${quest.title} (+${quest.rewardXp} XP, $${quest.rewardCash.toLocaleString()}).`;
      }
      return '📜 Quest board ready. Use .quests list or .quest claim.';
    }
    case 'explore': {
      const reward = player.level * 500;
      const xpReward = player.level * 30;
      grantMoney({ player, amount: reward, source: 'EXPLORE', reason: `Exploration reward in ${TERRITORIES[0].name}`, metadata: { territory: TERRITORIES[0].name } });
      grantXp(player, xpReward, 'EXPLORATION', `explore:${player.id}:${Date.now()}`);
      savePlayer(player);
      return `🗺️ Exploration result: ${TERRITORIES[0].name} secured. +${xpReward} XP and +$${reward.toLocaleString()}.`;
    }
    case 'events':
      return '🎉 Live events: Night Market Rush, Harbor Heist Window, Syndicate Cup.';
    case 'clan': {
      if (parsed.args[0] === 'create') {
        const name = parsed.args.slice(1).join(' ') || 'Night Reapers';
        if (player.level < 30) return '🏴 Clans unlock at level 30.';
        const clan = createClan(`clan-${Date.now()}`, name, player.id);
        clanStore.set(clan.id, clan);
        player.clanId = clan.id;
        player.titles.push('Founder');
        addPlayerHistory(player, `Created clan ${clan.name}.`);
        savePlayer(player);
        return `🏴 Clan created: ${clan.name} (${clan.tier}) — treasury $${clan.treasury.toLocaleString()}.`;
      }
      if (parsed.args[0] === 'info') {
        const clan = getClanForPlayer(player);
        return clan ? `🏴 ${clan.name} | Tier ${clan.tier} | Members ${clan.members.length} | Treasury $${clan.treasury.toLocaleString()}` : '🏴 You are not in a clan.';
      }
      return `🏴 Clan system ready. Player: ${player.displayName}. Use .clan create <name> at level 30.`;
    }
    case 'combat':
      return `🛡️ Training complete. Combat readiness +${Math.max(1, player.level / 10)}.`;
    case 'rob':
      if (!applyCooldown(player.id, 'rob', 15 * 60 * 1000)) return '⏳ Robbery cooldown is active.';
      const robberyCash = 15000 + player.level * 600;
      grantMoney({ player, amount: robberyCash, source: 'ROBBERY', reason: 'Successful robbery', metadata: { heat: 5 } });
      player.heat += 5;
      savePlayer(player);
      return `🚨 Robbery successful. +$${robberyCash.toLocaleString()} and heat +5.`;
    case 'raid':
      if (!applyCooldown(player.id, 'raid', 15 * 60 * 1000)) return '⏳ Raid cooldown is active.';
      grantMoney({ player, amount: 35000, source: 'RAID', reason: 'Raid payout', metadata: { raidType: 'standard' } });
      player.stats.raids += 1;
      savePlayer(player);
      return '⚔️ Raid executed successfully.';
    case 'heist':
      if (!applyCooldown(player.id, 'heist', 15 * 60 * 1000)) return '⏳ Heist cooldown is active.';
      grantMoney({ player, amount: 60000, source: 'HEIST', reason: 'Heist payout', metadata: { heistType: 'standard' } });
      player.stats.heists += 1;
      savePlayer(player);
      return '💣 Heist completed.';
    case 'wanted':
      return `🚔 Heat: ${player.heat} | Wanted level: ${player.wanted}`;
    case 'hit':
      if (!applyCooldown(player.id, 'hit', 15 * 60 * 1000)) return '⏳ Hit cooldown is active.';
      grantMoney({ player, amount: 35000, source: 'HIT', reason: 'Contract payout', metadata: { contractType: 'standard' } });
      savePlayer(player);
      return '🎯 Contract fulfilled.';
    case 'contracts':
      return '🎯 Active contracts: Warehouse Sabotage, Political Tail, Harbor Prime.';
    case 'bounty':
      return '💰 Current bounty board: 3 targets, highest payout $250,000.';
    case 'blackjack':
      if (blackjackState.has(player.id) && blackjackState.get(player.id)?.active) return '🃏 You already have an active blackjack round.';
      const round = createBlackjackRound();
      blackjackState.set(player.id, { dealer: round.dealer, player: round.player, bet: 1000, active: true });
      return `🃏 Blackjack table opened. Dealer: ${round.dealer.join(', ')} | Your hand: ${round.player.join(', ')} | Bet: $${1000}.`;
    case 'gamble': {
      const outcome = Math.random() > 0.5 ? 'won' : 'lost';
      const amount = 2500;
      const betTx = chargeMoney({ player, amount, source: 'GAMBLING', reason: 'Gambling wager', metadata: { game: 'gamble', outcome } });
      if (outcome === 'won') {
        grantMoney({ player, amount, source: 'GAMBLING', reason: 'Gambling win', metadata: { game: 'gamble', payoutType: 'win', wagerId: betTx.id } });
      }
      savePlayer(player);
      return `🎲 Gambling result: ${outcome.toUpperCase()} — ${outcome === 'won' ? '+' : '-'}$${amount.toLocaleString()}.`;
    }
    case 'lotto': {
      if (!lottoRound) lottoRound = createLottoRound();
      if (parsed.args[0] === 'bet') {
        const amount = parseMoneyArg(parsed.args.slice(1), 1000);
        if (!Number.isFinite(amount) || amount <= 0) {
          return renderLottoError('INVALID AMOUNT', 'Invalid lotto amount.', 'Use .lotto bet <amount> with a valid dollar value.');
        }
        if (lottoRound.state !== 'OPEN') {
          return renderLottoError('LOTTO CLOSED', 'Betting is closed for this round.', `${getLottoRoundStateLabel(lottoRound)} — wait for the next round.`);
        }
        if (player.cash < amount) {
          return renderLottoError('INSUFFICIENT FUNDS', 'Insufficient funds.', `Required: $${amount.toLocaleString()}\nAvailable: $${player.cash.toLocaleString()}`);
        }

        try {
          const ticket = addLottoEntry(lottoRound, player.id, amount);
          chargeMoney({ player, amount, source: 'LOTTO', reason: 'Lotto ticket purchase', metadata: { ticketId: ticket.id, roundId: lottoRound.id } });
          savePlayer(player);
          return renderLottoBetReceipt(lottoRound, player.id, ticket, amount);
        } catch (error) {
          return renderLottoError('LOTTO ERROR', (error as Error).message, 'Use a valid purchase amount and try again.');
        }
      }

      if (parsed.args[0] === 'tickets') {
        return renderLottoTickets(lottoRound, player.id);
      }

      if (parsed.args[0] === 'odds') {
        return renderLottoOdds(lottoRound, player.id);
      }

      if (parsed.args[0] === 'stats') {
        return renderLottoStats(lottoRound, player.id);
      }

      if (parsed.args[0] === 'history') {
        return renderLottoHistory(lottoRound);
      }

      if (parsed.args[0] && parsed.args[0] !== 'help') {
        return renderLottoError('INVALID COMMAND', 'Unknown lotto subcommand.', 'Available: .lotto, .lotto bet <amount>, .lotto tickets, .lotto odds, .lotto stats, .lotto history');
      }

      return renderLottoDashboard(lottoRound, player.id);
    }
    case 'war': {
      const subcommand = parsed.args[0]?.toLowerCase();
      const search = parsed.args.slice(1).join(' ');
      const activeWarState = createWarState();
      const objective = getWarObjectiveById(activeWarState.objectiveId) ?? getWarObjectiveById(search) ?? WAR_OBJECTIVES[0];

      if (subcommand === 'info' || subcommand === 'status' || !subcommand || subcommand === 'list') {
        return [
          '⚔️ War Front',
          `Objective: ${objective.name}`,
          `Reward: $${objective.reward.toLocaleString()}`,
          `Status: ${activeWarState.active ? 'active' : 'standby'}`,
          `Frontline: ${activeWarState.score.attacker} attacker / ${activeWarState.score.defender} defender`,
          'Use .war attack <district> to push the objective.'
        ].join('\n');
      }

      if (subcommand === 'attack') {
        const target = search || activeWarState.objectiveId;
        const result = resolveWarAttack(player, target);
        savePlayer(player);
        return result.message;
      }

      return [
        '⚔️ War Ground',
        'Use .war info for the active objective.',
        'Use .war attack <district> to assault a zone.',
        'Use .warrank for the live rankings.'
      ].join('\n');
    }
    case 'leaderboard':
      return renderLeaderboard();
    case 'ping':
      return '🏁 Bot online and responsive. Uptime stable.';
    case 'rules':
      return '📜 Rules: respect roleplay, no abuse, no illegal actions, admins decide disputes.';
    case 'moderation':
      return '◆ Moderation console active. Use .kick, .ban, .warn, or .groupinfo when authorized.';
    case 'admin':
      return '🔐 Admin panel available. Use .admin panel, .admin users, or .admin give.';
    default:
      return '⚠️ Command error. Try .help or .guide';
  }
}

function addInventoryItem(player: Player, name: string, qty: number): void {
  const existing = player.inventory.find(item => item.name === name);
  if (existing) {
    existing.qty += qty;
  } else {
    player.inventory.push({ id: name.toLowerCase().replace(/\s+/g, '-'), name, qty, rarity: 'Common', kind: 'resource' });
  }
}
