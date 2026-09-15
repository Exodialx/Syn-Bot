import type { Player } from './player.js';

export type EconomyTransactionType =
  | 'CREDIT'
  | 'DEBIT'
  | 'TRANSFER'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'FEE'
  | 'REWARD'
  | 'PENALTY'
  | 'LOAN'
  | 'REPAYMENT'
  | 'LIQUIDATION'
  | 'OTHER';

export type EconomySource =
  | 'JOB'
  | 'BUSINESS'
  | 'PROPERTY'
  | 'PROPERTY_RENT'
  | 'PROPERTY_MORTGAGE'
  | 'PROPERTY_MORTGAGE_PAYMENT'
  | 'PROPERTY_PURCHASE'
  | 'PROPERTY_SALE'
  | 'PROPERTY_UPGRADE'
  | 'VEHICLE'
  | 'CRIME'
  | 'ROBBERY'
  | 'HEIST'
  | 'RAID'
  | 'HIT'
  | 'GAMBLING'
  | 'LOTTO'
  | 'CRYPTO_BUY'
  | 'CRYPTO_SELL'
  | 'LOAN'
  | 'LOAN_REPAYMENT'
  | 'BANK'
  | 'TAX'
  | 'FEE'
  | 'TRADE'
  | 'ADMIN'
  | 'REWARD'
  | 'QUEST'
  | 'ACHIEVEMENT'
  | 'EXPLORE'
  | 'BLACKJACK'
  | 'OTHER';

export type EconomyTransaction = {
  id: string;
  type: EconomyTransactionType;
  playerId: string;
  counterpartyId?: string;
  amount: number;
  currency: 'cash' | 'bank' | 'credit' | 'liquid';
  balanceBefore: number;
  balanceAfter: number;
  source: EconomySource;
  reason: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type Loan = {
  id: string;
  amount: number;
  principal: number;
  outstandingBalance: number;
  rate: number;
  termDays: number;
  createdAt: number;
  dueAt: number;
  status: 'active' | 'repaid' | 'refinanced';
  totalRepaid: number;
  repayments: { amount: number; timestamp: number }[];
};

export type EconomyBalanceSnapshot = {
  cash: number;
  bank: number;
  totalLiquid: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

const MONEY_PRECISION = 2;

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Monetary value is not finite.');
  }
  return Number(Math.round((value + Number.EPSILON) * 100) / 100);
}

function validateMoneyAmount(amount: number, { allowZero = false, allowNegative = false } = {}): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Monetary value must be finite.');
  }
  if (amount < 0 && !allowNegative) {
    throw new Error('Monetary value cannot be negative.');
  }
  if (amount === 0 && !allowZero) {
    throw new Error('Monetary value must be greater than zero.');
  }
  return roundMoney(amount);
}

function ensurePlayerEconomy(player: Player): void {
  if (!Array.isArray(player.economyLedger)) player.economyLedger = [];
  if (!Array.isArray(player.loans)) player.loans = [];
  if (!Number.isFinite(player.cash)) player.cash = 0;
  if (!Number.isFinite(player.bank)) player.bank = 0;
  if (!Number.isFinite(player.debt)) player.debt = 0;
  if (!Number.isFinite(player.credit)) player.credit = 0;
  player.cash = roundMoney(player.cash);
  player.bank = roundMoney(player.bank);
  player.debt = roundMoney(player.debt);
  player.credit = roundMoney(player.credit);
}

function createTid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasDuplicateTransaction(player: Player, transactionId: string): boolean {
  ensurePlayerEconomy(player);
  return player.economyLedger.some(entry => entry.id === transactionId);
}

export function getCreditTier(score: number): string {
  if (score >= 900) return 'S';
  if (score >= 750) return 'A';
  if (score >= 600) return 'B';
  if (score >= 450) return 'C';
  if (score >= 300) return 'D';
  return 'F';
}

export function hydrateEconomyState(player: Player): Player {
  ensurePlayerEconomy(player);
  const activeLoans = (player.loans ?? []).filter(loan => loan && loan.status === 'active');
  const loanDebt = activeLoans.reduce((sum, loan) => sum + Math.max(0, loan.outstandingBalance ?? loan.amount ?? 0), 0);
  player.debt = Math.max(0, Math.max(Number(player.debt ?? 0), loanDebt));
  player.loans = activeLoans;
  player.history = Array.isArray(player.history) ? player.history : [];
  return player;
}

export function normalizeCurrencyValue(value: number): number {
  return roundMoney(validateMoneyAmount(Math.abs(value), { allowZero: true }));
}

export function grantMoney(options: {
  player: Player;
  amount: number;
  source: EconomySource;
  reason: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}): EconomyTransaction {
  const { player, amount, source, reason, metadata } = options;
  const money = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  const transactionId = options.transactionId ?? createTid('credit');
  if (hasDuplicateTransaction(player, transactionId)) {
    throw new Error(`Duplicate transaction rejected: ${transactionId}`);
  }

  const before = player.cash;
  player.cash = roundMoney(player.cash + money);
  const record: EconomyTransaction = {
    id: transactionId,
    type: 'CREDIT',
    playerId: player.id,
    amount: money,
    currency: 'cash',
    balanceBefore: before,
    balanceAfter: player.cash,
    source,
    reason,
    timestamp: Date.now(),
    metadata
  };

  player.economyLedger.push(record);
  if (player.history.length > 20) player.history = player.history.slice(-20);
  player.history.push(`${reason}: +$${money.toLocaleString()}`);
  return record;
}

export function creditMoney(options: { player: Player; amount: number; source: EconomySource; reason: string; transactionId?: string; metadata?: Record<string, unknown> }): EconomyTransaction {
  return grantMoney(options);
}

export function chargeMoney(options: {
  player: Player;
  amount: number;
  source: EconomySource;
  reason: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}): EconomyTransaction {
  const { player, amount, source, reason, metadata } = options;
  const money = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  const transactionId = options.transactionId ?? createTid('debit');
  if (hasDuplicateTransaction(player, transactionId)) {
    throw new Error(`Duplicate transaction rejected: ${transactionId}`);
  }
  if (player.cash < money) {
    throw new Error(`Insufficient cash for ${reason}.`);
  }
  const before = player.cash;
  player.cash = roundMoney(player.cash - money);
  const record: EconomyTransaction = {
    id: transactionId,
    type: 'DEBIT',
    playerId: player.id,
    amount: money,
    currency: 'cash',
    balanceBefore: before,
    balanceAfter: player.cash,
    source,
    reason,
    timestamp: Date.now(),
    metadata
  };
  player.economyLedger.push(record);
  if (player.history.length > 20) player.history = player.history.slice(-20);
  player.history.push(`${reason}: -$${money.toLocaleString()}`);
  return record;
}

export function depositToBank(options: { player: Player; amount: number; reason: string; source?: EconomySource; transactionId?: string; metadata?: Record<string, unknown> }): EconomyTransaction {
  const { player, amount, reason, metadata } = options;
  const money = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  const transactionId = options.transactionId ?? createTid('deposit');
  if (hasDuplicateTransaction(player, transactionId)) throw new Error(`Duplicate transaction rejected: ${transactionId}`);
  if (player.cash < money) throw new Error('Insufficient cash for deposit.');
  const beforeCash = player.cash;
  const beforeBank = player.bank;
  player.cash = roundMoney(player.cash - money);
  player.bank = roundMoney(player.bank + money);
  const record: EconomyTransaction = {
    id: transactionId,
    type: 'DEPOSIT',
    playerId: player.id,
    amount: money,
    currency: 'bank',
    balanceBefore: beforeBank,
    balanceAfter: player.bank,
    source: options.source ?? 'BANK',
    reason,
    timestamp: Date.now(),
    metadata: { ...metadata, sourceCashBefore: beforeCash, sourceCashAfter: player.cash }
  };
  player.economyLedger.push(record);
  player.history.push(`${reason}: bank +$${money.toLocaleString()}`);
  return record;
}

export function withdrawFromBank(options: { player: Player; amount: number; reason: string; source?: EconomySource; transactionId?: string; metadata?: Record<string, unknown> }): EconomyTransaction {
  const { player, amount, reason, metadata } = options;
  const money = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  const transactionId = options.transactionId ?? createTid('withdraw');
  if (hasDuplicateTransaction(player, transactionId)) throw new Error(`Duplicate transaction rejected: ${transactionId}`);
  if (player.bank < money) throw new Error('Insufficient bank balance for withdrawal.');
  const beforeCash = player.cash;
  const beforeBank = player.bank;
  player.bank = roundMoney(player.bank - money);
  player.cash = roundMoney(player.cash + money);
  const record: EconomyTransaction = {
    id: transactionId,
    type: 'WITHDRAW',
    playerId: player.id,
    amount: money,
    currency: 'bank',
    balanceBefore: beforeBank,
    balanceAfter: player.bank,
    source: options.source ?? 'BANK',
    reason,
    timestamp: Date.now(),
    metadata: { ...metadata, cashBefore: beforeCash, cashAfter: player.cash }
  };
  player.economyLedger.push(record);
  player.history.push(`${reason}: cash +$${money.toLocaleString()}`);
  return record;
}

export function transferMoney(options: {
  sender: Player;
  recipient: Player;
  amount: number;
  reason: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}): { amount: number; senderTx: EconomyTransaction; recipientTx: EconomyTransaction } {
  const { sender, recipient, amount, reason, metadata } = options;
  const money = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(sender);
  ensurePlayerEconomy(recipient);
  if (sender.id === recipient.id) {
    throw new Error('A player cannot transfer money to themselves.');
  }
  if (sender.cash < money) {
    throw new Error('Sender has insufficient cash for transfer.');
  }

  const transferId = options.transactionId ?? createTid('transfer');
  if (hasDuplicateTransaction(sender, transferId) || hasDuplicateTransaction(recipient, transferId)) {
    throw new Error(`Duplicate transaction rejected: ${transferId}`);
  }

  const senderBefore = sender.cash;
  const recipientBefore = recipient.cash;
  sender.cash = roundMoney(sender.cash - money);
  recipient.cash = roundMoney(recipient.cash + money);

  const senderTx: EconomyTransaction = {
    id: transferId,
    type: 'TRANSFER',
    playerId: sender.id,
    counterpartyId: recipient.id,
    amount: money,
    currency: 'cash',
    balanceBefore: senderBefore,
    balanceAfter: sender.cash,
    source: 'TRADE',
    reason,
    timestamp: Date.now(),
    metadata: { ...metadata, recipientId: recipient.id }
  };
  const recipientTx: EconomyTransaction = {
    id: `${transferId}-recipient`,
    type: 'TRANSFER',
    playerId: recipient.id,
    counterpartyId: sender.id,
    amount: money,
    currency: 'cash',
    balanceBefore: recipientBefore,
    balanceAfter: recipient.cash,
    source: 'TRADE',
    reason,
    timestamp: Date.now(),
    metadata: { ...metadata, senderId: sender.id }
  };

  sender.economyLedger.push(senderTx);
  recipient.economyLedger.push(recipientTx);
  sender.history.push(`${reason}: -$${money.toLocaleString()}`);
  recipient.history.push(`${reason}: +$${money.toLocaleString()}`);
  return { amount: money, senderTx, recipientTx };
}

export function getTotalDebt(player: Player): number {
  ensurePlayerEconomy(player);
  const activeLoans = (player.loans ?? []).filter(loan => loan && loan.status === 'active');
  const loanDebt = activeLoans.reduce((sum, loan) => sum + Math.max(0, Number(loan.outstandingBalance ?? loan.amount ?? 0)), 0);
  return roundMoney(Math.max(0, Math.max(Number(player.debt ?? 0), loanDebt)));
}

export function getPlayerBalanceSnapshot(player: Player): EconomyBalanceSnapshot {
  ensurePlayerEconomy(player);
  const investments = Object.values(player.investments ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const crypto = Object.values(player.crypto ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const cash = roundMoney(Number(player.cash ?? 0));
  const bank = roundMoney(Number(player.bank ?? 0));
  const totalLiquid = roundMoney(cash + bank + crypto + investments);
  const totalAssets = totalLiquid;
  const totalLiabilities = getTotalDebt(player);
  return {
    cash,
    bank,
    totalLiquid,
    totalAssets,
    totalLiabilities,
    netWorth: roundMoney(totalAssets - totalLiabilities)
  };
}

export function getEconomyStats(player: Player): { totalEarned: number; totalSpent: number; totalFees: number; totalLoaned: number; totalRepaid: number; largestTransaction: number; transactionVolume: number } {
  ensurePlayerEconomy(player);
  const ledger = player.economyLedger ?? [];
  const totalEarned = ledger.filter(entry => entry.amount > 0 && (entry.type === 'CREDIT' || entry.type === 'REWARD' || entry.type === 'TRANSFER' && entry.playerId === player.id)).reduce((sum, entry) => sum + entry.amount, 0);
  const totalSpent = ledger.filter(entry => entry.amount > 0 && (entry.type === 'DEBIT' || entry.type === 'TRANSFER' && entry.playerId === player.id)).reduce((sum, entry) => sum + entry.amount, 0);
  const totalFees = ledger.filter(entry => entry.type === 'FEE').reduce((sum, entry) => sum + entry.amount, 0);
  const totalLoaned = (player.loans ?? []).reduce((sum, loan) => sum + (loan?.amount ?? 0), 0);
  const totalRepaid = (player.loans ?? []).reduce((sum, loan) => sum + (loan?.totalRepaid ?? 0), 0);
  const largestTransaction = ledger.reduce((max, entry) => Math.max(max, entry.amount), 0);
  return {
    totalEarned: roundMoney(totalEarned),
    totalSpent: roundMoney(totalSpent),
    totalFees: roundMoney(totalFees),
    totalLoaned: roundMoney(totalLoaned),
    totalRepaid: roundMoney(totalRepaid),
    largestTransaction: roundMoney(largestTransaction),
    transactionVolume: roundMoney(ledger.reduce((sum, entry) => sum + entry.amount, 0))
  };
}

export function createLoan(player: Player, amount: number, rate = 0.12, termDays = 30): Loan {
  const safeAmount = validateMoneyAmount(Math.max(5000, amount), { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  if (player.credit < 300) {
    throw new Error('Insufficient credit to obtain a loan.');
  }

  const loanId = createTid('loan');
  const now = Date.now();
  const loan: Loan = {
    id: loanId,
    amount: safeAmount,
    principal: safeAmount,
    outstandingBalance: safeAmount,
    rate,
    termDays,
    createdAt: now,
    dueAt: now + termDays * 24 * 60 * 60 * 1000,
    status: 'active',
    totalRepaid: 0,
    repayments: []
  };

  const beforeBank = player.bank;
  player.bank = roundMoney(player.bank + safeAmount);
  player.debt = roundMoney(Math.max(player.debt, getTotalDebt(player)) + safeAmount);
  player.credit = Math.max(100, roundMoney(player.credit - 15));
  player.loans.push(loan);
  player.economyLedger.push({
    id: loanId,
    type: 'LOAN',
    playerId: player.id,
    amount: safeAmount,
    currency: 'bank',
    balanceBefore: beforeBank,
    balanceAfter: player.bank,
    source: 'LOAN',
    reason: 'Loan issued',
    timestamp: now,
    metadata: { rate, termDays }
  });
  player.history.push(`Loan created for $${safeAmount.toLocaleString()}.`);
  return loan;
}

export function repayLoan(player: Player, amount: number): boolean {
  const safeAmount = validateMoneyAmount(amount, { allowZero: false, allowNegative: false });
  ensurePlayerEconomy(player);
  const outstanding = getTotalDebt(player);
  const payment = Math.min(safeAmount, outstanding);
  if (payment <= 0) return false;
  if (player.bank < payment) {
    throw new Error('Insufficient bank balance to repay the loan.');
  }

  const now = Date.now();
  const beforeBank = player.bank;
  player.bank = roundMoney(player.bank - payment);
  player.debt = roundMoney(Math.max(0, player.debt - payment));
  const activeLoan = (player.loans ?? []).find(loan => loan && loan.status === 'active');
  if (activeLoan) {
    activeLoan.outstandingBalance = roundMoney(Math.max(0, activeLoan.outstandingBalance - payment));
    activeLoan.totalRepaid = roundMoney(activeLoan.totalRepaid + payment);
    activeLoan.repayments.push({ amount: payment, timestamp: now });
    if (activeLoan.outstandingBalance <= 0) {
      activeLoan.status = 'repaid';
      activeLoan.outstandingBalance = 0;
    }
  }
  player.credit = Math.min(1000, roundMoney(player.credit + 5));
  player.economyLedger.push({
    id: createTid('repayment'),
    type: 'REPAYMENT',
    playerId: player.id,
    amount: payment,
    currency: 'bank',
    balanceBefore: beforeBank,
    balanceAfter: player.bank,
    source: 'LOAN_REPAYMENT',
    reason: 'Loan repayment',
    timestamp: now,
    metadata: { loanId: activeLoan?.id ?? 'unknown' }
  });
  player.history.push(`Repaid $${payment.toLocaleString()} of debt.`);
  return true;
}

export function assessDebt(player: Player): string {
  hydrateEconomyState(player);
  const debt = getTotalDebt(player);
  const monthly = roundMoney(debt * 0.12);
  return `💳 Debt: $${debt.toLocaleString()} | Credit: ${player.credit} (${getCreditTier(player.credit)}) | Monthly cost: $${monthly.toLocaleString()}`;
}

export function liquidateAssets(player: Player, assetType: 'business' | 'property' | 'vehicle' | 'inventory' | 'investment', assetName: string, amount = 1): boolean {
  const safeAmount = validateMoneyAmount(Math.abs(amount), { allowZero: true, allowNegative: false });
  if (assetType === 'business') {
    const index = player.businesses.indexOf(assetName);
    if (index >= 0) {
      player.businesses.splice(index, 1);
      const cashGain = roundMoney(1500 * safeAmount);
      grantMoney({ player, amount: cashGain, source: 'BUSINESS', reason: `Liquidated ${assetName}`, metadata: { assetType, assetName, amount: safeAmount } });
      return true;
    }
  }
  if (assetType === 'property') {
    const index = player.properties.indexOf(assetName);
    if (index >= 0) {
      player.properties.splice(index, 1);
      const cashGain = roundMoney(2500 * safeAmount);
      grantMoney({ player, amount: cashGain, source: 'PROPERTY', reason: `Liquidated ${assetName}`, metadata: { assetType, assetName, amount: safeAmount } });
      return true;
    }
  }
  if (assetType === 'vehicle') {
    const index = player.vehicles.indexOf(assetName);
    if (index >= 0) {
      player.vehicles.splice(index, 1);
      const cashGain = roundMoney(1800 * safeAmount);
      grantMoney({ player, amount: cashGain, source: 'VEHICLE', reason: `Liquidated ${assetName}`, metadata: { assetType, assetName, amount: safeAmount } });
      return true;
    }
  }
  return false;
}
