/**
 * Feature button handlers — register prefixes for Fisch reel/duel/kraken/boss
 * and Syndicates blackjack. Called once at bot startup.
 *
 * Every handler calls the exact same exported function its text-command twin
 * uses — no parallel resolution logic.
 */
import {
  registerInteraction,
  sendButtonMessage,
  type InteractionResult,
} from './interactions.js';
import { getOrCreatePlayer } from '../game/player.js';
import {
  fishPull,
  fishBiteReact,
  fishStruggleFight,
  fishStruggleLetGo,
  duelThrow,
  duelHold,
  duelDouble,
  krakenPull,
  krakenCashout,
  attackBoss,
  ensureBoss,
  getFischPlayer,
} from '../game/fisch.js';
import { bjHit, bjStand, bjDouble, slots, dice, coinflip } from '../game/gambling.js';
import { joinLobby } from '../game/heists.js';
import { sendRandomGif } from './gifLibrary.js';
import { decodeFollowUpPrompt } from '../synai/followups.js';
import { askAi } from '../game/ai.js';
import { recordUserTurn, recordAssistantTurn } from '../synai/conversation.js';
import { exchangeGold, formatMerchant } from '../game/merchant.js';

let registered = false;

/** Per-player lock so rapid duplicate button taps cannot double-resolve. */
const fischBusy = new Set<string>();

function withFischLock(
  senderId: string,
  fn: () => InteractionResult | null
): InteractionResult | null {
  if (fischBusy.has(senderId)) {
    // Silent drop — avoids editing the status message into a spinner on double-tap
    return null;
  }
  fischBusy.add(senderId);
  try {
    return fn();
  } finally {
    fischBusy.delete(senderId);
  }
}

export function registerAllButtonHandlers(): void {
  if (registered) return;
  registered = true;


  // ── SynAI follow-up buttons ────────────────────────────────────────────
  registerInteraction('synai:ask:', async (chatJid, senderId, interactionId, _raw, sock): Promise<InteractionResult | null> => {
    const prompt = decodeFollowUpPrompt(interactionId);
    if (!prompt) return { text: '⚠️ That follow-up expired. Ask with .synai …' };
    try {
      const p = getOrCreatePlayer(senderId);
      // Reuse the same askAi path as .synai text
      const text = await askAi(p, prompt, chatJid);
      // forceNew so the conversation continues as a new readable bubble
      return { text, forceNew: true };
    } catch (e) {
      console.error('synai follow-up', e);
      return { text: '⚠️ SynAI hiccuped on that follow-up. Try .synai again.' };
    }
  });


  registerInteraction('merchant:exchange:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getOrCreatePlayer(senderId);
    const text = exchangeGold(p);
    return { text };
  });

  // ── Heist lobby join ── calls the SAME joinLobby() the .join heist text command uses.
  registerInteraction('heist:join:', async (chatJid, senderId, interactionId): Promise<InteractionResult | null> => {
    const heistId = interactionId.split(':')[2];
    const p = getOrCreatePlayer(senderId);
    const text = joinLobby(p, heistId);
    // Still recruiting → keep the JOIN button so more people can tap it.
    // Full/started/error → drop the button, matching the existing fisch pattern above.
    if (text.includes('Joined') && text.includes('Crew')) {
      return { text, buttons: HEIST_JOIN_BUTTON(heistId) };
    }
    return { text };
  });

  // ── Fisch bite react ───────────────────────────────────────────────────
  registerInteraction('fisch:bite:react:', async (chatJid, senderId, _id, _raw, sock): Promise<InteractionResult | null> => {
    return withFischLock(senderId, () => {
      const p = getFischPlayer(senderId);
      const text = fishBiteReact(p);
      if (text.includes('FIGHTING HARD')) {
        sendRandomGif(sock, chatJid, 'fisch', 'struggle').catch(() => {});
        return {
          text,
          buttons: [
            { id: `fisch:struggle:fight:${senderId}`, text: '💪 PULL' },
            { id: `fisch:struggle:letgo:${senderId}`, text: '✂️ RELEASE' },
          ],
        };
      }
      if (text.includes('*REELING*') || text.includes('on the line')) {
        return {
          text,
          buttons: [{ id: `fisch:pull:${senderId}`, text: '💪 PULL' }],
        };
      }
      // Escape / error / closed — drop buttons
      return { text };
    });
  });

  // ── Fisch struggle ─────────────────────────────────────────────────────
  registerInteraction('fisch:struggle:fight:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    return withFischLock(senderId, () => {
      const p = getFischPlayer(senderId);
      const text = fishStruggleFight(p);
      if (text.includes('*REELING*') || text.includes('on the line')) {
        return {
          text,
          buttons: [{ id: `fisch:pull:${senderId}`, text: '💪 PULL' }],
        };
      }
      return { text };
    });
  });

  registerInteraction('fisch:struggle:letgo:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    return withFischLock(senderId, () => {
      const p = getFischPlayer(senderId);
      const text = fishStruggleLetGo(p);
      return { text };
    });
  });

  // ── Fisch reel ─────────────────────────────────────────────────────────
  registerInteraction('fisch:pull:', async (chatJid, senderId, _id, _raw, sock): Promise<InteractionResult | null> => {
    return withFischLock(senderId, () => {
      const p = getFischPlayer(senderId);
      const text = fishPull(p);
      // Bite stage routed through fishPull → fishBiteReact
      if (text.includes('FIGHTING HARD')) {
        sendRandomGif(sock, chatJid, 'fisch', 'struggle').catch(() => {});
        return {
          text,
          buttons: [
            { id: `fisch:struggle:fight:${senderId}`, text: '💪 PULL' },
            { id: `fisch:struggle:letgo:${senderId}`, text: '✂️ RELEASE' },
          ],
        };
      }
      if (text.includes('SOMETHING BIT')) {
        return {
          text,
          buttons: [{ id: `fisch:bite:react:${senderId}`, text: '⚡ REEL' }],
        };
      }
      // Still reeling if session still exists after pull
      const stillReeling =
        !text.includes('*CATCH*') &&
        !text.includes('line snaps') &&
        !text.includes("Nothing's on your line") &&
        !text.includes('Encounter closed');
      if (stillReeling && !text.startsWith('❌')) {
        return {
          text,
          buttons: [{ id: `fisch:pull:${senderId}`, text: '💪 PULL' }],
        };
      }
      // Catch / escape — meaningful GIF for rare+ catches when available
      if (text.includes('*CATCH*')) {
        if (/LEGENDARY|MYTHIC|ANCIENT/i.test(text)) {
          sendRandomGif(sock, chatJid, 'fisch', 'catch-legendary').catch(() => {});
        } else if (/EPIC|RARE/i.test(text)) {
          sendRandomGif(sock, chatJid, 'fisch', 'catch-rare').catch(() => {});
        }
      }
      return { text };
    });
  });

  // ── Harpoon Duel ───────────────────────────────────────────────────────
  registerInteraction('fisch:duel:throw:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    const text = duelThrow(p);
    const resolved = text.includes('wins') || text.includes('WIN') || text.includes('lose') || text.includes('LOSE') || text.includes('draw') || text.includes('no duel');
    if (resolved) {
      return { text };
    }
    return {
      text,
      buttons: [
        { id: `fisch:duel:throw:${senderId}`, text: '🎣 THROW' },
        { id: `fisch:duel:hold:${senderId}`, text: '✋ HOLD' },
        { id: `fisch:duel:double:${senderId}`, text: '🎯 DOUBLE' },
      ],
    };
  });

  registerInteraction('fisch:duel:hold:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    const text = duelHold(p);
    return { text };
  });

  registerInteraction('fisch:duel:double:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    const text = duelDouble(p);
    const resolved = text.includes('wins') || text.includes('WIN') || text.includes('lose') || text.includes('LOSE') || text.includes('draw') || text.includes('no duel') || text.includes('already');
    if (resolved) {
      return { text };
    }
    return {
      text,
      buttons: [
        { id: `fisch:duel:throw:${senderId}`, text: '🎣 THROW' },
        { id: `fisch:duel:hold:${senderId}`, text: '✋ HOLD' },
        { id: `fisch:duel:double:${senderId}`, text: '🎯 DOUBLE' },
      ],
    };
  });

  // ── Kraken's Grip ──────────────────────────────────────────────────────
  registerInteraction('fisch:kraken:pull:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    const text = krakenPull(p);
    const closed = text.includes('snaps') || text.includes('SNAP') || text.includes('lost') || text.includes('No grip');
    if (closed) {
      return { text };
    }
    return {
      text,
      buttons: [
        { id: `fisch:kraken:pull:${senderId}`, text: '🐙 PULL' },
        { id: `fisch:kraken:cashout:${senderId}`, text: '💰 CASHOUT' },
      ],
    };
  });

  registerInteraction('fisch:kraken:cashout:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    const text = krakenCashout(p);
    return { text };
  });

  // ── World Boss (shared message) ────────────────────────────────────────
  registerInteraction('fisch:boss:attack', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getFischPlayer(senderId);
    ensureBoss();
    const text = attackBoss(p);
    const dead = text.includes('defeated') || text.includes('DEAD') || text.includes('no boss') || text.includes('slain');
    if (dead) {
      return { text };
    }
    return {
      text,
      buttons: [{ id: 'fisch:boss:attack', text: '⚔️ ATTACK' }],
    };
  });

  // ── Blackjack ──────────────────────────────────────────────────────────
  registerInteraction('syn:bj:hit:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getOrCreatePlayer(senderId);
    const text = bjHit(p);
    const done = text.includes('BUST') || text.includes('Lost') || text.includes('No hand');
    if (done) {
      return { text };
    }
    return {
      text,
      buttons: [
        { id: `syn:bj:hit:${senderId}`, text: '🃏 HIT' },
        { id: `syn:bj:stand:${senderId}`, text: '✋ STAND' },
        { id: `syn:bj:double:${senderId}`, text: '⏫ DOUBLE' },
      ],
    };
  });

  registerInteraction('syn:bj:stand:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getOrCreatePlayer(senderId);
    const text = bjStand(p);
    return { text };
  });

  registerInteraction('syn:bj:double:', async (chatJid, senderId): Promise<InteractionResult | null> => {
    const p = getOrCreatePlayer(senderId);
    const text = bjDouble(p);
    return { text };
  });

  // ── Slots ──────────────────────────────────────────────────────────────
  // id: syn:slot:<spin|double>:<bet>:<playerId>
  const slotHandler = (doubleBet: boolean) => async (chatJid: string, senderId: string, id: string): Promise<InteractionResult | null> => {
    const parts = id.split(':');
    const prevBet = parseInt(parts[3], 10);
    if (!Number.isFinite(prevBet) || prevBet <= 0) return null;
    const bet = doubleBet ? prevBet * 2 : prevBet;
    const p = getOrCreatePlayer(senderId);
    const text = slots(p, bet);
    if (text.startsWith('❌')) return { text };
    return { text, buttons: SLOT_BUTTONS(senderId, bet) };
  };
  registerInteraction('syn:slot:spin:', slotHandler(false));
  registerInteraction('syn:slot:double:', slotHandler(true));

  // ── Dice ───────────────────────────────────────────────────────────────
  // id: syn:dice:<again|double>:<bet>:<high|low>:<playerId>
  const diceHandler = (doubleBet: boolean) => async (chatJid: string, senderId: string, id: string): Promise<InteractionResult | null> => {
    const parts = id.split(':');
    const prevBet = parseInt(parts[3], 10);
    const pick = parts[4] === 'low' ? 'low' : 'high';
    if (!Number.isFinite(prevBet) || prevBet <= 0) return null;
    const bet = doubleBet ? prevBet * 2 : prevBet;
    const p = getOrCreatePlayer(senderId);
    const text = dice(p, bet, pick);
    if (text.startsWith('❌') && !text.includes('Lost')) return { text };
    return { text, buttons: DICE_BUTTONS(senderId, bet, pick) };
  };
  registerInteraction('syn:dice:again:', diceHandler(false));
  registerInteraction('syn:dice:double:', diceHandler(true));

  // ── Coinflip ───────────────────────────────────────────────────────────
  // id: syn:coin:<again|double>:<bet>:<heads|tails>:<playerId>
  const coinHandler = (doubleBet: boolean) => async (chatJid: string, senderId: string, id: string): Promise<InteractionResult | null> => {
    const parts = id.split(':');
    const prevBet = parseInt(parts[3], 10);
    const side = parts[4] === 'tails' ? 'tails' : 'heads';
    if (!Number.isFinite(prevBet) || prevBet <= 0) return null;
    const bet = doubleBet ? prevBet * 2 : prevBet;
    const p = getOrCreatePlayer(senderId);
    const text = coinflip(p, bet, side);
    if (text.startsWith('❌')) return { text };
    return { text, buttons: COIN_BUTTONS(senderId, bet, side) };
  };
  registerInteraction('syn:coin:again:', coinHandler(false));
  registerInteraction('syn:coin:double:', coinHandler(true));
}

/**
 * Helpers used by text-command paths to attach buttons after casting / starting.
 * Call these from the places that currently just return a string, once the
 * reply path has access to sock + chatJid (bot.ts / handler enrichment).
 */
export const REEL_PULL_BUTTON = (playerId: string) => [
  { id: `fisch:pull:${playerId}`, text: '💪 PULL' },
];

export const BITE_REEL_BUTTON = (playerId: string) => [
  { id: `fisch:bite:react:${playerId}`, text: '⚡ REEL' },
];

export const STRUGGLE_BUTTONS = (playerId: string) => [
  { id: `fisch:struggle:fight:${playerId}`, text: '💪 PULL' },
  { id: `fisch:struggle:letgo:${playerId}`, text: '✂️ RELEASE' },
];

export const DUEL_BUTTONS = (playerId: string) => [
  { id: `fisch:duel:throw:${playerId}`, text: '🎣 THROW' },
  { id: `fisch:duel:hold:${playerId}`, text: '✋ HOLD' },
  { id: `fisch:duel:double:${playerId}`, text: '🎯 DOUBLE' },
];

export const KRAKEN_BUTTONS = (playerId: string) => [
  { id: `fisch:kraken:pull:${playerId}`, text: '🐙 PULL' },
  { id: `fisch:kraken:cashout:${playerId}`, text: '💰 CASHOUT' },
];

export const BOSS_ATTACK_BUTTON = [{ id: 'fisch:boss:attack', text: '⚔️ ATTACK' }];
export const HEIST_JOIN_BUTTON = (heistId: string) => [{ id: `heist:join:${heistId}`, text: '📢 JOIN LOBBY' }];

export const BJ_BUTTONS = (playerId: string) => [
  { id: `syn:bj:hit:${playerId}`, text: '🃏 HIT' },
  { id: `syn:bj:stand:${playerId}`, text: '✋ STAND' },
  { id: `syn:bj:double:${playerId}`, text: '⏫ DOUBLE' },
];

export const MERCHANT_EXCHANGE_BUTTON = (playerId: string) => [
  { id: `merchant:exchange:${playerId}`, text: '💰 EXCHANGE' },
];

/** Bet is encoded in the id; player id stays the LAST segment (dispatcher ownership check). */
export const SLOT_BUTTONS = (playerId: string, bet: number) => [
  { id: `syn:slot:spin:${bet}:${playerId}`, text: '🎰 SPIN AGAIN' },
  { id: `syn:slot:double:${bet}:${playerId}`, text: '⏫ DOUBLE BET' },
];

export const DICE_BUTTONS = (playerId: string, bet: number, pick: string) => [
  { id: `syn:dice:again:${bet}:${pick}:${playerId}`, text: '🎲 ROLL AGAIN' },
  { id: `syn:dice:double:${bet}:${pick}:${playerId}`, text: '⏫ DOUBLE BET' },
];

export const COIN_BUTTONS = (playerId: string, bet: number, side: string) => [
  { id: `syn:coin:again:${bet}:${side}:${playerId}`, text: '🪙 FLIP AGAIN' },
  { id: `syn:coin:double:${bet}:${side}:${playerId}`, text: '⏫ DOUBLE BET' },
];
