/**
 * Central button payload builder + inbound tap parser.
 * Sole place that touches Baileys interactive / nativeFlow shapes.
 * All features (Fisch, blackjack, drops) must call these helpers —
 * never construct button payloads inline.
 */
import type { WAMessage, AnyMessageContent } from '@whiskeysockets/baileys';

export type ButtonDef = { id: string; text: string };

/**
 * Build an interactiveMessage with nativeFlowMessage quick_reply buttons.
 * bodyText is the visible message body; buttons are the tappable rows.
 */
export function buildInteractiveButtons(
  bodyText: string,
  buttons: ButtonDef[]
): AnyMessageContent {
  const limited = buttons.slice(0, 3); // WhatsApp caps interactive quick_reply at 3

  const nativeFlowButtons = limited.map((b) => ({
    name: 'quick_reply' as const,
    buttonParamsJson: JSON.stringify({
      display_text: b.text,
      id: b.id,
    }),
  }));

  return {
    interactiveMessage: {
      body: { text: bodyText },
      nativeFlowMessage: {
        buttons: nativeFlowButtons,
        messageParamsJson: '',
      },
    },
  } as AnyMessageContent;
}

/**
 * Parse an inbound button tap.
 * Prefers interactiveResponseMessage (nativeFlow) path used by modern clients;
 * falls back to legacy buttonsResponseMessage for completeness.
 */
export function parseButtonTap(
  msg: WAMessage
): { id: string; displayText: string } | null {
  const m = msg.message;
  if (!m) return null;

  // Modern path: interactiveResponseMessage → nativeFlowResponseMessage
  const native =
    (m as any).interactiveResponseMessage?.nativeFlowResponseMessage;
  if (native?.paramsJson) {
    try {
      const parsed = JSON.parse(native.paramsJson);
      const id = String(parsed?.id || parsed?.button_id || '').trim();
      const displayText = String(
        parsed?.display_text || parsed?.displayText || ''
      ).trim();
      if (id) return { id, displayText };
    } catch {
      // malformed JSON — ignore
    }
  }

  // Some clients nest under interactiveResponseMessage.paramsJson directly
  const ir = (m as any).interactiveResponseMessage;
  if (ir?.paramsJson && typeof ir.paramsJson === 'string') {
    try {
      const parsed = JSON.parse(ir.paramsJson);
      const id = String(parsed?.id || parsed?.button_id || '').trim();
      const displayText = String(
        parsed?.display_text || parsed?.displayText || ''
      ).trim();
      if (id) return { id, displayText };
    } catch {
      // ignore
    }
  }

  // Legacy path (deprecated, but keep for completeness)
  const legacy = m.buttonsResponseMessage;
  if (legacy) {
    const id = String(
      legacy.selectedButtonId || (legacy as any).selectedId || ''
    ).trim();
    const displayText = String(legacy.selectedDisplayText || '').trim();
    if (id) return { id, displayText };
  }

  return null;
}
