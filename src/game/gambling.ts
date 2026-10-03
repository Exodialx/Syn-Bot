/**
 * Casino minigames — house edge real, soft daily loss awareness via heat-free sink
 */
import { Player, savePlayer, addXp } from './player.js';

const MAX_BET = 100_000;

const sessions = new Map<string, { cards: number[]; dealer: number[]; bet: number }>();

function draw(): number {
  // 1-13, face = 10 for BJ value handled below
  return 1 + Math.floor(Math.random() * 13);
}

function bjVal(cards: number[]): number {
  let v = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 1) { aces++; v += 11; }
    else if (c >= 10) v += 10;
    else v += c;
  }
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function cardName(c: number): string {
  if (c === 1) return 'A';
  if (c === 11) return 'J';
  if (c === 12) return 'Q';
  if (c === 13) return 'K';
  return String(c);
}

const CARD_SUITS = ['♠', '♥', '♦', '♣'] as const;

function renderCard(card: number, index: number): string {
  return `${cardName(card)}${CARD_SUITS[index % CARD_SUITS.length]}`;
}

function renderHand(cards: number[], hideSecond = false): string {
  if (hideSecond && cards.length > 1) {
    return `${renderCard(cards[0], 0)}  🂠`;
  }
  return cards.map((card, index) => renderCard(card, index)).join('  ');
}

export function bjStart(p: Player, bet: number): string {
  if (!bet || bet < 100) return '❌ Min bet $100';
  if (bet > MAX_BET) return `❌ Max bet $${MAX_BET.toLocaleString()}`;
  if (p.cash < bet) return '❌ Not enough cash';
  p.cash -= bet;
  const cards = [draw(), draw()];
  const dealer = [draw(), draw()];
  sessions.set(p.id, { cards, dealer, bet });
  savePlayer(p);
  const pv = bjVal(cards);
  return [
    '🎴 BLACKJACK 🎴',
    '────────────────',
    `Bet: $${bet.toLocaleString()}`,
    `Dealer: ${renderHand(dealer, true)}`,
    `You:    ${renderHand(cards)}  (${pv})`,
    '',
    '.bj hit  |  .bj stand  |  .bj double'
  ].join('\n');
}

export function bjHit(p: Player): string {
  const s = sessions.get(p.id);
  if (!s) return '❌ No hand. .bj <bet>';
  s.cards.push(draw());
  const v = bjVal(s.cards);
  if (v > 21) {
    sessions.delete(p.id);
    savePlayer(p);
    return [
      '🎴 BLACKJACK 🎴',
      '────────────────',
      `Dealer: ${renderHand(s.dealer, true)}`,
      `You:    ${renderHand(s.cards)}  (BUST 💥)`,
      '',
      `❌ Lost $${s.bet.toLocaleString()}`
    ].join('\n');
  }
  return [
    '🎴 BLACKJACK 🎴',
    '────────────────',
    `Dealer: ${renderHand(s.dealer, true)}`,
    `You:    ${renderHand(s.cards)}  (${v})`,
    '',
    '.bj hit  |  .bj stand  |  .bj double'
  ].join('\n');
}

export function bjStand(p: Player): string {
  const s = sessions.get(p.id);
  if (!s) return '❌ No hand. .bj <bet>';
  while (bjVal(s.dealer) < 17) s.dealer.push(draw());
  const pv = bjVal(s.cards);
  const dv = bjVal(s.dealer);
  sessions.delete(p.id);
  let result = '';
  if (dv > 21 || pv > dv) {
    const win = Math.floor(s.bet * 1.95); // house edge
    p.cash += win;
    result = `🏆 WIN +$${win.toLocaleString()}`;
    addXp(p, 25);
  } else if (pv === dv) {
    p.cash += s.bet;
    result = '🤝 PUSH';
  } else {
    result = `❌ DEALER WINS  -$${s.bet.toLocaleString()}`;
  }
  savePlayer(p);

  const pvLabel = (pv === 21 && s.cards.length === 2) ? 'BLACKJACK ✨' : (pv > 21 ? 'BUST 💥' : String(pv));
  const dvLabel = (dv === 21 && s.dealer.length === 2) ? 'BLACKJACK ✨' : (dv > 21 ? 'BUST 💥' : String(dv));

  return [
    '🎴 BLACKJACK 🎴',
    '────────────────',
    `Dealer: ${renderHand(s.dealer)}  (${dvLabel})`,
    `You:    ${renderHand(s.cards)}  (${pvLabel})`,
    result,
    `💰 Cash $${p.cash.toLocaleString()}`
  ].join('\n');
}


export function bjDouble(p: Player): string {
  const s = sessions.get(p.id);
  if (!s) return '❌ No hand. .bj <bet>';
  if (s.cards.length !== 2) return '❌ Double only on opening hand';
  if (p.cash < s.bet) return '❌ Need cash to double';
  if (s.bet * 2 > MAX_BET) return `❌ Would exceed max bet $${MAX_BET.toLocaleString()}`;
  p.cash -= s.bet;
  s.bet *= 2;
  s.cards.push(draw());
  savePlayer(p);
  const v = bjVal(s.cards);
  if (v > 21) {
    sessions.delete(p.id);
    return [
      '🎴 BLACKJACK — DOUBLE 🎴',
      '────────────────',
      `You: ${renderHand(s.cards)}  BUST`,
      `❌ Lost $${s.bet.toLocaleString()}`
    ].join('\n');
  }
  // auto stand after double
  return bjStand(p).replace('BLACKJACK', 'BLACKJACK — DOUBLE');
}

export function dice(p: Player, bet: number, pick?: string): string {
  if (!bet || bet < 50) return '❌ Min $50';
  if (bet > MAX_BET) return `❌ Max bet $${MAX_BET.toLocaleString()}`;
  if (p.cash < bet) return '❌ Broke';
  p.cash -= bet;
  const roll = 1 + Math.floor(Math.random() * 6);
  // high = 4-6, low = 1-3
  const guess = (pick || 'high').toLowerCase();
  const high = roll >= 4;
  const win = (guess === 'high' && high) || (guess === 'low' && !high);
  let msg = `🎲 Rolled **${roll}**\n`;
  if (win) {
    const gain = Math.floor(bet * 1.9);
    p.cash += gain;
    msg += `▸ ${guess.toUpperCase()} hits! +$${gain.toLocaleString()}`;
    addXp(p, 15);
  } else {
    msg += `❌ Lost $${bet.toLocaleString()}`;
  }
  savePlayer(p);
  return msg + `\n💰 $${p.cash.toLocaleString()}`;
}

export function coinflip(p: Player, bet: number, side?: string): string {
  if (!bet || bet < 50) return '❌ Min $50';
  if (bet > MAX_BET) return `❌ Max bet $${MAX_BET.toLocaleString()}`;
  if (p.cash < bet) return '❌ Broke';
  p.cash -= bet;
  const flip = Math.random() < 0.5 ? 'heads' : 'tails';
  const pick = (side || 'heads').toLowerCase();
  const win = pick === flip;
  // slight house edge: payout 1.95x
  if (win) {
    const gain = Math.floor(bet * 1.95);
    p.cash += gain;
    savePlayer(p);
    return `🪙 ${flip.toUpperCase()}!\n▸ +$${gain.toLocaleString()}\n💰 $${p.cash.toLocaleString()}`;
  }
  savePlayer(p);
  return `🪙 ${flip.toUpperCase()}!\n❌ Lost $${bet.toLocaleString()}\n💰 $${p.cash.toLocaleString()}`;
}

export function slots(p: Player, bet: number): string {
  if (!bet || bet < 100) return '❌ Min $100';
  if (p.cash < bet) return '❌ Broke';
  p.cash -= bet;
  const symbols = ['🍒', '🍋', '💎', '7️⃣', '💀'];
  const a = symbols[Math.floor(Math.random() * 5)];
  const b = symbols[Math.floor(Math.random() * 5)];
  const c = symbols[Math.floor(Math.random() * 5)];
  let mult = 0;
  if (a === b && b === c) {
    if (a === '💎') mult = 12;
    else if (a === '7️⃣') mult = 8;
    else if (a === '💀') mult = 0;
    else mult = 4;
  } else if (a === b || b === c) mult = 1.5;
  const gain = Math.floor(bet * mult);
  p.cash += gain;
  savePlayer(p);
  const line = mult >= 4 ? '🎉 JACKPOT LINE' : mult > 0 ? '▸ Small hit' : '❌ Dead';
  return `🎰 | ${a} | ${b} | ${c} |
${line}
${gain > 0 ? `💰 +$${gain.toLocaleString()}` : `💸 -$${bet.toLocaleString()}`}
Cash $${p.cash.toLocaleString()}`;
}
