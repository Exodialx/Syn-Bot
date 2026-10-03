export const LOTTO_TICKET_UNIT_PRICE = 1000;
export const LOTTO_MIN_PURCHASE = 1000;
export const LOTTO_MAX_PURCHASE = Number.MAX_SAFE_INTEGER;
export const LOTTO_JACKPOT_CONTRIBUTION_RATE = 0.9;
export const LOTTO_HOUSE_FEE_RATE = 0.1;
export const LOTTO_ROLL_OVER_ENABLED = true;
export const LOTTO_ROUND_DURATION_MS = 24 * 60 * 60 * 1000;

export type LottoRoundState = 'OPEN' | 'CLOSED' | 'DRAWING' | 'COMPLETED';

export type LottoTicket = {
  id: string;
  playerId: string;
  amount: number;
  entries: number;
  boughtAt: number;
};

export type LottoPlayerStats = {
  totalTicketsBought: number;
  totalAmountSpent: number;
  totalEntries: number;
  wins: number;
  totalWinnings: number;
  biggestJackpotWon: number;
  lastParticipation: number;
};

export type LottoHistoryEntry = {
  roundId: string;
  drawTime: number;
  jackpot: number;
  participants: number;
  totalEntries: number;
  winner?: string;
  winningAmount: number;
  winningTicketId?: string;
};

export type LottoDrawResult = {
  roundId: string;
  winnerPlayerId?: string;
  winningTicketId?: string;
  winningEntry?: number;
  jackpot: number;
  totalEntries: number;
  participantCount: number;
  completedAt: number;
  winningAmount: number;
};

export type LottoRound = {
  id: string;
  state: LottoRoundState;
  startsAt: number;
  endsAt: number;
  jackpot: number;
  totalEntries: number;
  entries: LottoTicket[];
  winner?: string;
  completedAt?: number;
  history: LottoHistoryEntry[];
  playerStats: Record<string, LottoPlayerStats>;
};

export function createLottoTicketId(playerId: string): string {
  const now = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `lotto-ticket-${playerId}-${now}-${randomPart}`;
}

export function createLottoRound(): LottoRound {
  const startedAt = Date.now();
  return {
    id: `lotto-${startedAt}-${Math.random().toString(36).slice(2, 10)}`,
    state: 'OPEN',
    startsAt: startedAt,
    endsAt: startedAt + LOTTO_ROUND_DURATION_MS,
    jackpot: 0,
    totalEntries: 0,
    entries: [],
    history: [],
    playerStats: {}
  };
}

function isValidPlayerId(playerId: string): boolean {
  return typeof playerId === 'string' && playerId.trim().length > 0 && !/\s/.test(playerId.trim());
}

export function calculateLottoEntries(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Lotto amount must be a finite number.');
  }

  if (amount <= 0) {
    throw new Error('Lotto amount must be greater than zero.');
  }

  if (amount < LOTTO_MIN_PURCHASE) {
    throw new Error(`Lotto minimum purchase is $${LOTTO_MIN_PURCHASE.toLocaleString()}.`);
  }

  if (amount > LOTTO_MAX_PURCHASE) {
    throw new Error(`Lotto maximum purchase is $${LOTTO_MAX_PURCHASE.toLocaleString()}.`);
  }

  const entries = Math.floor(amount / LOTTO_TICKET_UNIT_PRICE);
  if (!Number.isFinite(entries) || entries <= 0 || !Number.isSafeInteger(entries)) {
    throw new Error('Lotto purchase does not produce a valid positive entry count.');
  }

  return entries;
}

export function addLottoEntry(round: LottoRound, playerId: string, amount: number): LottoTicket {
  if (!round) {
    throw new Error('Lotto round is required.');
  }

  if (!isValidPlayerId(playerId)) {
    throw new Error('Invalid player ID for lotto purchase.');
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount < LOTTO_MIN_PURCHASE) {
    throw new Error('Invalid lotto purchase amount.');
  }

  if (round.state === 'COMPLETED') {
    throw new Error('This lotto round has already been completed.');
  }

  if (round.state !== 'OPEN') {
    throw new Error(`Lotto round is not accepting entries in state: ${round.state}.`);
  }

  if (Date.now() >= round.endsAt) {
    round.state = 'CLOSED';
    throw new Error('This lotto round has closed and is no longer accepting entries.');
  }

  const entries = calculateLottoEntries(amount);
  const ticket: LottoTicket = {
    id: createLottoTicketId(playerId),
    playerId,
    amount,
    entries,
    boughtAt: Date.now()
  };

  round.entries.push(ticket);
  round.totalEntries += entries;
  round.jackpot = Number((round.jackpot + amount * LOTTO_JACKPOT_CONTRIBUTION_RATE).toFixed(2));

  const stats = round.playerStats[playerId] ?? {
    totalTicketsBought: 0,
    totalAmountSpent: 0,
    totalEntries: 0,
    wins: 0,
    totalWinnings: 0,
    biggestJackpotWon: 0,
    lastParticipation: 0
  };

  stats.totalTicketsBought += 1;
  stats.totalAmountSpent += amount;
  stats.totalEntries += entries;
  stats.lastParticipation = ticket.boughtAt;
  round.playerStats[playerId] = stats;

  if (Date.now() >= round.endsAt) {
    round.state = 'CLOSED';
  }

  return ticket;
}

function selectWeightedTicket(round: LottoRound, rng: () => number = Math.random): LottoTicket | undefined {
  if (!round || round.entries.length === 0) {
    return undefined;
  }

  if (round.totalEntries <= 0) {
    return undefined;
  }

  if (round.state === 'COMPLETED') {
    throw new Error('This lotto round has already been drawn.');
  }

  const roll = rng();
  const target = Math.max(0, Math.min(1, Number.isFinite(roll) ? roll : 0)) * round.totalEntries;
  let runningTotal = 0;

  for (const ticket of round.entries) {
    runningTotal += ticket.entries;
    if (target < runningTotal) {
      return ticket;
    }
  }

  return round.entries[round.entries.length - 1];
}

export function pickLottoWinner(round: LottoRound, rng: () => number = Math.random): string | undefined {
  if (!round) {
    throw new Error('Lotto round is required.');
  }

  if (round.entries.length === 0 || round.totalEntries <= 0) {
    throw new Error('Cannot draw a lotto winner with no valid entries.');
  }

  if (round.state === 'COMPLETED') {
    throw new Error('This lotto round has already been drawn.');
  }

  const winner = selectWeightedTicket(round, rng);
  return winner?.playerId;
}

export function drawLottoRound(round: LottoRound, rng: () => number = Math.random): LottoDrawResult {
  if (!round) {
    throw new Error('Lotto round is required.');
  }

  if (round.state === 'COMPLETED') {
    throw new Error('This lotto round has already been finalized.');
  }

  if (round.entries.length === 0 || round.totalEntries <= 0) {
    throw new Error('Cannot draw a lotto round with no valid entries.');
  }

  round.state = 'DRAWING';
  const ticket = selectWeightedTicket(round, rng);
  if (!ticket) {
    throw new Error('Unable to select a valid lotto winner.');
  }

  const result: LottoDrawResult = {
    roundId: round.id,
    winnerPlayerId: ticket.playerId,
    winningTicketId: ticket.id,
    winningEntry: ticket.entries,
    jackpot: round.jackpot,
    totalEntries: round.totalEntries,
    participantCount: getLottoParticipantCount(round),
    completedAt: Date.now(),
    winningAmount: round.jackpot
  };

  round.winner = ticket.playerId;
  round.completedAt = result.completedAt;
  round.state = 'COMPLETED';

  const stats = round.playerStats[ticket.playerId] ?? {
    totalTicketsBought: 0,
    totalAmountSpent: 0,
    totalEntries: 0,
    wins: 0,
    totalWinnings: 0,
    biggestJackpotWon: 0,
    lastParticipation: 0
  };

  stats.wins += 1;
  stats.totalWinnings += result.winningAmount;
  stats.biggestJackpotWon = Math.max(stats.biggestJackpotWon, result.winningAmount);
  round.playerStats[ticket.playerId] = stats;

  round.history.push({
    roundId: round.id,
    drawTime: result.completedAt,
    jackpot: result.jackpot,
    participants: result.participantCount,
    totalEntries: result.totalEntries,
    winner: result.winnerPlayerId,
    winningAmount: result.winningAmount,
    winningTicketId: result.winningTicketId
  });

  return result;
}

export function getLottoParticipantCount(round: LottoRound): number {
  return new Set(round.entries.map(ticket => ticket.playerId)).size;
}

export function getLottoTicketCount(round: LottoRound): number {
  return round.entries.length;
}

export function getLottoTotalEntries(round: LottoRound): number {
  return round.totalEntries;
}

export function getLottoJackpot(round: LottoRound): number {
  return Number.isFinite(round.jackpot) ? Math.max(0, round.jackpot) : 0;
}

export function getPlayerLottoEntries(round: LottoRound, playerId: string): number {
  if (!isValidPlayerId(playerId)) return 0;
  return round.entries.filter(ticket => ticket.playerId === playerId).reduce((sum, ticket) => sum + ticket.entries, 0);
}

export function getPlayerLottoOdds(round: LottoRound, playerId: string): { playerEntries: number; totalEntries: number; rawProbability: number; percentage: number } {
  if (!round || !isValidPlayerId(playerId)) {
    return { playerEntries: 0, totalEntries: 0, rawProbability: 0, percentage: 0 };
  }

  const playerEntries = getPlayerLottoEntries(round, playerId);
  const totalEntries = round.totalEntries || 0;
  if (totalEntries <= 0 || playerEntries <= 0) {
    return { playerEntries: 0, totalEntries, rawProbability: 0, percentage: 0 };
  }

  const rawProbability = playerEntries / totalEntries;
  return {
    playerEntries,
    totalEntries,
    rawProbability,
    percentage: Math.min(100, Math.max(0, rawProbability * 100))
  };
}

export function getLottoHistory(round: LottoRound): LottoHistoryEntry[] {
  return [...(round.history ?? [])];
}

export function getPlayerLottoWins(round: LottoRound, playerId: string): number {
  if (!isValidPlayerId(playerId)) return 0;
  return round.history.filter(entry => entry.winner === playerId).length;
}

export function getPlayerLottoWinnings(round: LottoRound, playerId: string): number {
  if (!isValidPlayerId(playerId)) return 0;
  return round.history.filter(entry => entry.winner === playerId).reduce((sum, entry) => sum + entry.winningAmount, 0);
}

export function getPlayerLottoStats(round: LottoRound, playerId: string): LottoPlayerStats | undefined {
  if (!isValidPlayerId(playerId)) return undefined;
  return round.playerStats[playerId];
}

function formatLottoPanel(title: string, lines: string[]): string {
  const width = 56;
  const safeTitle = title.slice(0, Math.min(title.length, 46));
  const header = `${safeTitle.padEnd(width - 4, ' ')} `;
  const body = lines.map(line => `${String(line).slice(0, width - 4).padEnd(width - 4, ' ')} `);

  return [
    '━━━━━━━━━━━━━━━━━━━━',
    '━━━━━━━━━━━━━━━━━━━━',
    ...body,
    '━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
}

export function getLottoRoundStateLabel(round: LottoRound): string {
  switch (round.state) {
    case 'OPEN':
      return '🟢 LOTTO OPEN';
    case 'CLOSED':
      return '🔴 BETTING CLOSED';
    case 'DRAWING':
      return '🟡 DRAW IN PROGRESS';
    case 'COMPLETED':
      return '🏆 ROUND COMPLETED';
    default:
      return '❔ LOTTO STATUS';
  }
}

export function formatLottoCountdown(round: LottoRound): string {
  const remainingMs = Math.max(0, round.endsAt - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (hours > 0) return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  return `${String(seconds).padStart(2, '0')}s`;
}

export function getPlayerLottoTicketSummary(round: LottoRound, playerId: string) {
  const tickets = round.entries.filter(ticket => ticket.playerId === playerId);
  return {
    ticketsOwned: tickets.length,
    totalEntries: tickets.reduce((sum, ticket) => sum + ticket.entries, 0),
    totalSpent: tickets.reduce((sum, ticket) => sum + ticket.amount, 0),
    recentTickets: tickets.slice(-5).map(ticket => ({
      id: ticket.id,
      entries: ticket.entries,
      amount: ticket.amount
    }))
  };
}

export function renderLottoError(title: string, message: string, detail?: string): string {
  const lines = [`❌ ${message}`];
  if (detail) lines.push(detail);
  return formatLottoPanel(`⚠️ ${title}`, lines);
}

export function renderLottoDashboard(round: LottoRound, playerId: string): string {
  const playerStats = getPlayerLottoStats(round, playerId) ?? {
    totalTicketsBought: 0,
    totalAmountSpent: 0,
    totalEntries: 0,
    wins: 0,
    totalWinnings: 0,
    biggestJackpotWon: 0,
    lastParticipation: 0
  };
  const playerOdds = getPlayerLottoOdds(round, playerId);
  const playerTickets = getPlayerLottoTicketSummary(round, playerId);
  const lines = [
    '🎰 SYNDICATES LOTTO',
    '',
    `💰 CURRENT JACKPOT`,
    '',
    `$${getLottoJackpot(round).toLocaleString()} 💵`,
    '',
    `👥 PLAYERS ${getLottoParticipantCount(round)}`,
    `🎟️ TICKETS ${getLottoTicketCount(round)}`,
    `🎯 TOTAL ENTRIES ${getLottoTotalEntries(round)}`,
    '',
    `⏰ DRAW COUNTDOWN`,
    `⏳ ${formatLottoCountdown(round)}`,
    '',
    getLottoRoundStateLabel(round),
    '',
    '👤 YOUR LOTTO',
    `🎫 Tickets : ${playerTickets.ticketsOwned}`,
    `🎯 Entries : ${playerTickets.totalEntries}`,
    `📊 Win Chance : ${playerOdds.percentage.toFixed(2)}%`,
    `💵 Total Spent : $${playerTickets.totalSpent.toLocaleString()}`,
    `🏆 Total Wins : ${playerStats.wins}`,
    '',
    '🎮 COMMANDS',
    '🎟️ .lotto bet <amount>',
    '🎫 .lotto tickets',
    '📊 .lotto odds',
    '📈 .lotto stats',
    '📜 .lotto history'
  ];

  return formatLottoPanel('🎰 SYNDICATES LOTTO', lines);
}

export function renderLottoBetReceipt(round: LottoRound, playerId: string, ticket: LottoTicket, paidAmount: number): string {
  const odds = getPlayerLottoOdds(round, playerId);
  const lines = [
    '▸ TICKET PURCHASED',
    `💵 Paid: $${paidAmount.toLocaleString()}`,
    `🎯 Entries: +${ticket.entries}`,
    `🎫 Ticket ID: ${ticket.id}`,
    '',
    `💰 Jackpot: $${getLottoJackpot(round).toLocaleString()}`,
    `📊 Your odds: ${odds.percentage.toFixed(2)}%`
  ];

  return formatLottoPanel('🎟️ LOTTO TICKET', lines);
}

export function renderLottoTickets(round: LottoRound, playerId: string): string {
  const summary = getPlayerLottoTicketSummary(round, playerId);
  const recent = summary.recentTickets.length
    ? summary.recentTickets.map(ticket => `🎫 ${ticket.id.slice(-8)} +${ticket.entries} entries $${ticket.amount.toLocaleString()}`)
    : ['🎫 No tickets purchased yet.'];

  const lines = [
    `🎟️ Tickets Owned: ${summary.ticketsOwned}`,
    `🎯 Total Entries: ${summary.totalEntries}`,
    `💵 Total Spent: $${summary.totalSpent.toLocaleString()}`,
    '',
    'Recent purchases:',
    ...recent
  ];

  return formatLottoPanel('🎫 YOUR TICKETS', lines);
}

export function renderLottoOdds(round: LottoRound, playerId: string): string {
  const odds = getPlayerLottoOdds(round, playerId);
  const lines = [
    `🎯 Your entries : ${odds.playerEntries}`,
    `🎯 Total entries : ${odds.totalEntries}`,
    '',
    `📊 Your win chance : ${odds.percentage.toFixed(4)}%`,
    '',
    '⚖️ Formula:',
    'your entries ÷ total entries'
  ];

  return formatLottoPanel('📊 LOTTO ODDS', lines);
}

export function renderLottoStats(round: LottoRound, playerId: string): string {
  const stats = getPlayerLottoStats(round, playerId) ?? {
    totalTicketsBought: 0,
    totalAmountSpent: 0,
    totalEntries: 0,
    wins: 0,
    totalWinnings: 0,
    biggestJackpotWon: 0,
    lastParticipation: 0
  };
  const odds = getPlayerLottoOdds(round, playerId);

  const lines = [
    `🎟️ Tickets purchased: ${stats.totalTicketsBought}`,
    `🎯 Total entries: ${stats.totalEntries}`,
    `💵 Total spent: $${stats.totalAmountSpent.toLocaleString()}`,
    `🏆 Wins: ${stats.wins}`,
    `💰 Total winnings: $${stats.totalWinnings.toLocaleString()}`,
    `💎 Biggest jackpot: $${stats.biggestJackpotWon.toLocaleString()}`,
    `📊 Current odds: ${odds.percentage.toFixed(2)}%`,
    `⏱️ Lifetime participation: ${stats.lastParticipation ? new Date(stats.lastParticipation).toLocaleDateString() : 'Never'}`
  ];

  return formatLottoPanel('📈 LOTTO STATS', lines);
}

export function renderLottoHistory(round: LottoRound): string {
  const recent = (round.history ?? []).slice(-5);
  if (!recent.length) {
    return renderLottoError('LOTTO HISTORY', 'No completed lotto rounds yet.', 'The next draw will appear here.');
  }

  const lines = recent.flatMap(entry => [
    `🏆 ROUND ${entry.roundId.split('-').at(-1) ?? 'N/A'}`,
    `💰 Jackpot: $${entry.jackpot.toLocaleString()}`,
    `👑 Winner: ${entry.winner ?? 'Unknown'}`,
    `🎯 Entries: ${entry.totalEntries}`,
    `📅 Drawn: ${new Date(entry.drawTime).toLocaleDateString()}`,
    ''
  ]);

  return formatLottoPanel('📜 LOTTO HISTORY', lines.slice(0, -1));
}

export function renderLottoDrawAnnouncement(result: LottoDrawResult): string {
  const lines = [
    '🎟️ FINAL DRAW',
    '🎲 🎲 🎲 🎲 🎲',
    '',
    '🏆 WINNER',
    `👑 ${result.winnerPlayerId ?? 'Unknown'}`,
    '',
    `💰 $${result.winningAmount.toLocaleString()}`,
    '',
    `🎯 Entries: ${result.totalEntries}`,
    `👥 Participants: ${result.participantCount}`
  ];

  return formatLottoPanel('🎰 LOTTO DRAW', lines);
}
