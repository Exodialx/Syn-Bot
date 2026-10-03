/**
 * Interaction dispatch table + sent-button message registry.
 *
 * Features register a prefix (e.g. `fisch:pull:`, `syn:bj:hit:`, `drop:claim:`)
 * at startup. The dispatcher validates player ownership (when the id embeds a
 * playerId) once, centrally, then calls the feature handler.
 *
 * Feature handlers return `{ text, buttons? }`. The dispatcher performs the
 * actual send/edit via the sock, reusing the proven edit pattern from
 * loadingAnimation.ts.
 */
import type { WASocket, WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import { buildInteractiveButtons, type ButtonDef } from '../connection/buttons.js';

export type InteractionResult = {
  text: string;
  buttons?: ButtonDef[];
  /** When true, send a new message instead of editing the existing one. */
  forceNew?: boolean;
  /** Optional quoted reply for DETAILS-style side replies. */
  quoteOriginal?: boolean;
};

export type InteractionHandler = (
  chatJid: string,
  senderId: string,
  interactionId: string,
  raw: WAMessage,
  sock: WASocket
) => Promise<InteractionResult | null>;

/** Prefix → handler. Features register at startup. */
const handlers = new Map<string, InteractionHandler>();

/**
 * Registry of outbound button messages so features can edit them later.
 * Key = `${chatJid}|${sessionKey}` (sessionKey is usually playerId or a shared
 * key like the boss / drop chat hash).
 */
const sentButtonMessages = new Map<string, WAMessageKey>();

export function registerInteraction(
  prefix: string,
  handler: InteractionHandler
): void {
  handlers.set(prefix, handler);
}

export function registryKey(chatJid: string, sessionKey: string): string {
  return `${chatJid}|${sessionKey}`;
}

export function storeButtonMessage(
  chatJid: string,
  sessionKey: string,
  key: WAMessageKey
): void {
  sentButtonMessages.set(registryKey(chatJid, sessionKey), key);
}

export function getButtonMessageKey(
  chatJid: string,
  sessionKey: string
): WAMessageKey | undefined {
  return sentButtonMessages.get(registryKey(chatJid, sessionKey));
}

export function clearButtonMessage(
  chatJid: string,
  sessionKey: string
): void {
  sentButtonMessages.delete(registryKey(chatJid, sessionKey));
}

/**
 * Extract the player id segment from an interaction id.
 * Convention: last segment after the final `:` is the playerId
 * (e.g. `fisch:pull:234567890` → `234567890`).
 * Shared-message ids (boss, drop) do not embed a player id and return null.
 */
export function playerIdFromInteractionId(id: string): string | null {
  const parts = id.split(':');
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  // Player ids in this bot are numeric phone-like strings (10–15 digits)
  if (/^[0-9]{8,15}$/.test(last)) return last;
  return null;
}

/**
 * Find the longest matching registered prefix for an interaction id.
 */
function findHandler(id: string): InteractionHandler | null {
  let best: InteractionHandler | null = null;
  let bestLen = -1;
  for (const [prefix, handler] of handlers) {
    if (id.startsWith(prefix) && prefix.length > bestLen) {
      best = handler;
      bestLen = prefix.length;
    }
  }
  return best;
}

/**
 * Central entry point called from whatsapp.ts when a button tap is detected.
 * Does NOT go through handleCommand().
 */
export async function dispatchInteraction(
  chatJid: string,
  senderId: string,
  interactionId: string,
  raw: WAMessage,
  sock: WASocket
): Promise<void> {
  const handler = findHandler(interactionId);
  if (!handler) {
    // Unknown id — silent ignore (stale button from a previous bot version)
    return;
  }

  // Central ownership check: if the id embeds a player id, the tapper must match
  const embedded = playerIdFromInteractionId(interactionId);
  if (embedded && embedded !== senderId) {
    // Someone else tapped a player-owned button — ignore
    return;
  }

  let result: InteractionResult | null;
  try {
    result = await handler(chatJid, senderId, interactionId, raw, sock);
  } catch (err) {
    console.error('Interaction handler error:', err);
    try {
      await sock.sendMessage(
        chatJid,
        { text: '⚠️ Something went wrong. Try again.' },
        { quoted: raw }
      );
    } catch {}
    return;
  }

  if (!result) return;

  const { text, buttons, forceNew, quoteOriginal } = result;

  // Prefer editing the original button message when we have a key and aren't
  // forced to send new / quote-only side reply.
  // Align session keys with sendButtonMessage stores:
  // heist lobby → heistlobby:<heistId>  (see bot.ts open-lobby path)
  // street drop  → drop:<chatJid>       (see drops.ts dropSessionKey)
  let sessionKey: string;
  if (embedded) {
    sessionKey = embedded;
  } else if (interactionId.startsWith('heist:join:')) {
    const heistId = interactionId.split(':')[2] || '';
    sessionKey = `heistlobby:${heistId}`;
  } else if (interactionId.startsWith('drop:claim:') || interactionId.startsWith('drop:details:')) {
    sessionKey = `drop:${chatJid}`;
  } else {
    sessionKey = interactionId.split(':').slice(0, 2).join(':');
  }

  const existingKey = getButtonMessageKey(chatJid, sessionKey);

  try {
    if (quoteOriginal || forceNew || !existingKey) {
      // Fresh message (or DETAILS-style quoted reply)
      const content =
        buttons && buttons.length > 0
          ? buildInteractiveButtons(text, buttons)
          : { text };
      const sent = await sock.sendMessage(
        chatJid,
        content as any,
        quoteOriginal ? { quoted: raw } : undefined
      );
      if (buttons && buttons.length > 0 && sent?.key) {
        storeButtonMessage(chatJid, sessionKey, sent.key);
      }
    } else if (buttons && buttons.length > 0) {
      // Edit in place, keep buttons
      const content = buildInteractiveButtons(text, buttons);
      await sock.sendMessage(chatJid, {
        ...(content as any),
        edit: existingKey,
      });
    } else {
      // Session resolved — edit down to plain text and drop registry entry
      await sock.sendMessage(chatJid, {
        text,
        edit: existingKey,
      });
      clearButtonMessage(chatJid, sessionKey);
    }
  } catch (err) {
    // Edit of interactive messages can fail on some clients — fall back to
    // a fresh message so the player still gets the result.
    console.warn('Button edit failed, falling back to new message:', (err as any)?.message || err);
    try {
      const content =
        buttons && buttons.length > 0
          ? buildInteractiveButtons(text, buttons)
          : { text };
      const sent = await sock.sendMessage(chatJid, content as any);
      if (buttons && buttons.length > 0 && sent?.key) {
        storeButtonMessage(chatJid, sessionKey, sent.key);
      } else {
        clearButtonMessage(chatJid, sessionKey);
      }
    } catch (err2) {
      console.error('Fallback send also failed:', err2);
    }
  }
}

/**
 * Helper for feature modules that need to send an initial button message
 * (e.g. after fishCast / bjStart / formatDrop) and register its key.
 */
export async function sendButtonMessage(
  sock: WASocket,
  chatJid: string,
  sessionKey: string,
  text: string,
  buttons: ButtonDef[],
  quoted?: WAMessage
): Promise<WAMessageKey | undefined> {
  const content = buildInteractiveButtons(text, buttons);
  const sent = await sock.sendMessage(
    chatJid,
    content as any,
    quoted ? { quoted } : undefined
  );
  if (sent?.key) {
    storeButtonMessage(chatJid, sessionKey, sent.key);
    return sent.key;
  }
  return undefined;
}
