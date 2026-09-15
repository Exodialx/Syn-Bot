import { describe, expect, it } from 'vitest';
import {
  LOTTO_TICKET_UNIT_PRICE,
  LOTTO_MIN_PURCHASE,
  calculateLottoEntries,
  createLottoRound,
  addLottoEntry,
  pickLottoWinner,
  drawLottoRound,
  getPlayerLottoOdds,
  getLottoParticipantCount,
  getLottoTicketCount,
  getLottoTotalEntries,
  getLottoJackpot,
  getPlayerLottoEntries,
  getPlayerLottoWins,
  getPlayerLottoWinnings,
  getLottoHistory,
  type LottoRound
} from '../src/game/lotto.js';

describe('lotto phase 1', () => {
  it('creates a round with explicit lifecycle state and duration', () => {
    const round = createLottoRound();
    expect(round.state).toBe('OPEN');
    expect(round.id).toMatch(/^lotto-/);
    expect(round.endsAt).toBeGreaterThan(round.startsAt);
    expect(round.entries).toEqual([]);
  });

  it('accepts valid purchases and rejects invalid values', () => {
    const round = createLottoRound();
    const ticket = addLottoEntry(round, 'player-1', LOTTO_MIN_PURCHASE);

    expect(ticket.entries).toBe(1);
    expect(ticket.amount).toBe(LOTTO_MIN_PURCHASE);
    expect(calculateLottoEntries(LOTTO_MIN_PURCHASE)).toBe(1);

    expect(() => addLottoEntry(round, '', 1000)).toThrow();
    expect(() => addLottoEntry(round, 'player-2', 0)).toThrow();
    expect(() => addLottoEntry(round, 'player-3', Number.NaN)).toThrow();
    expect(() => addLottoEntry(round, 'player-4', Number.POSITIVE_INFINITY)).toThrow();
    expect(() => calculateLottoEntries(-10)).toThrow();
  });

  it('calculates positive integer entries and prevents invalid overflow', () => {
    expect(calculateLottoEntries(LOTTO_TICKET_UNIT_PRICE)).toBe(1);
    expect(calculateLottoEntries(LOTTO_TICKET_UNIT_PRICE * 3)).toBe(3);
    expect(calculateLottoEntries(LOTTO_TICKET_UNIT_PRICE * 2.5)).toBe(2);
    expect(() => calculateLottoEntries(LOTTO_TICKET_UNIT_PRICE * 0.5)).toThrow();
    expect(() => calculateLottoEntries(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('creates unique ticket ids and weighted winner selection works deterministically', () => {
    const round = createLottoRound();
    addLottoEntry(round, 'player-a', 1000);
    addLottoEntry(round, 'player-b', 2000);
    addLottoEntry(round, 'player-c', 3000);

    const ids = round.entries.map(ticket => ticket.id);
    expect(new Set(ids).size).toBe(ids.length);

    const winner = pickLottoWinner(round, () => 0.01);
    expect(['player-a', 'player-b', 'player-c']).toContain(winner);
  });

  it('supports player odds and stats aggregation', () => {
    const round = createLottoRound();
    addLottoEntry(round, 'player-a', 1000);
    addLottoEntry(round, 'player-b', 2000);
    addLottoEntry(round, 'player-c', 3000);

    expect(getLottoParticipantCount(round)).toBe(3);
    expect(getLottoTicketCount(round)).toBe(3);
    expect(getLottoTotalEntries(round)).toBe(6);
    expect(getLottoJackpot(round)).toBeGreaterThan(0);

    const odds = getPlayerLottoOdds(round, 'player-b');
    expect(odds.playerEntries).toBe(2);
    expect(odds.totalEntries).toBe(6);
    expect(odds.rawProbability).toBe(2 / 6);
    expect(odds.percentage).toBeGreaterThan(0);

    expect(getPlayerLottoEntries(round, 'player-b')).toBe(2);
  });

  it('finalizes a round once and stores draw results/history', () => {
    const round = createLottoRound();
    addLottoEntry(round, 'player-a', 2000);
    addLottoEntry(round, 'player-b', 4000);

    const draw = drawLottoRound(round, () => 0.2);
    expect(draw.roundId).toBe(round.id);
    expect(draw.winnerPlayerId).toBeDefined();
    expect(round.state).toBe('COMPLETED');
    expect(round.history).toHaveLength(1);
    expect(round.history[0].winner).toBe(draw.winnerPlayerId);

    expect(() => drawLottoRound(round, () => 0.5)).toThrow();
  });

  it('protects against duplicate finalization and invalid zero-entry behavior', () => {
    const round = createLottoRound();
    expect(() => pickLottoWinner(round)).toThrow();

    const round2 = createLottoRound();
    round2.state = 'COMPLETED';
    expect(() => drawLottoRound(round2)).toThrow();
  });

  it('tracks player wins and winnings over history', () => {
    const round = createLottoRound();
    addLottoEntry(round, 'player-a', 2000);
    addLottoEntry(round, 'player-b', 2000);

    const draw = drawLottoRound(round, () => 0.2);
    expect(getPlayerLottoWins(round, draw.winnerPlayerId!)).toBeGreaterThanOrEqual(1);
    expect(getPlayerLottoWinnings(round, draw.winnerPlayerId!)).toBeGreaterThanOrEqual(0);
    expect(getLottoHistory(round)).toHaveLength(1);
  });

  it('guards against NaN, Infinity, negative and impossible values', () => {
    const round = createLottoRound();

    expect(() => addLottoEntry(round, 'player-x', Number.NaN)).toThrow();
    expect(() => addLottoEntry(round, 'player-x', Number.POSITIVE_INFINITY)).toThrow();
    expect(() => addLottoEntry(round, 'player-x', -1)).toThrow();
    expect(() => addLottoEntry(round, 'player-x', 500)).toThrow();
  });
});
