/**
 * Attention / intent layer — when should SynAI speak in a group?
 * Hierarchy: mention → reply-to-SynAI → active follow-up → silent.
 * Never hijacks dot-commands.
 */
import { isActiveConversation, wasReplyToSynAi } from './conversation.js';

/** Direct address — requires syn/synai as a clear vocative, not mid-sentence noise. */
const ADDRESS_RE =
  /(?:^|[\s,])(?:@?synai\b|@?syn-bot\b|yo\s+syn\b|hey\s+syn\b|hi\s+syn\b|ok\s+syn\b|synai[,:]|syn[,:])/i;

/**
 * Follow-ups only when conversation is already active.
 * Deliberately does NOT match every message ending in "?".
 */
const FOLLOW_UP_RE =
  /^(why\b|how\b|what about\b|and\b|ok but\b|but what\b|tell me more\b|explain\b|more\b|really\b|what if\b|what about that\b|same but\b|\d+\s*%|and \d)/i;

export type AttentionInput = {
  text: string;
  chatJid: string;
  senderId: string;
  isDotCommand: boolean;
  quotedStanzaId?: string | null;
  botMentioned?: boolean;
};

export type AttentionResult = {
  shouldRespond: boolean;
  reason: string;
  cleanedText: string;
};

export function shouldRespondToMessage(input: AttentionInput): AttentionResult {
  const text = (input.text || '').trim();
  if (!text) return { shouldRespond: false, reason: 'empty', cleanedText: '' };

  if (input.isDotCommand) {
    if (/^\.(synai|ai|ask)\b/i.test(text)) {
      const cleaned = text.replace(/^\.(synai|ai|ask)\s*/i, '').trim();
      return { shouldRespond: true, reason: 'dot-synai', cleanedText: cleaned || text };
    }
    return { shouldRespond: false, reason: 'game-command', cleanedText: text };
  }

  if (input.botMentioned || ADDRESS_RE.test(text)) {
    let cleaned = text
      .replace(/@?synai\b/gi, ' ')
      .replace(/@?syn-bot\b/gi, ' ')
      .replace(/\byo\s+syn\b/gi, ' ')
      .replace(/\bhey\s+syn\b/gi, ' ')
      .replace(/\bhi\s+syn\b/gi, ' ')
      .replace(/\bok\s+syn\b/gi, ' ')
      .replace(/\bsyn\b\s*[,:]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Bare greeting to Syn — still respond with a natural opener
    if (!cleaned) cleaned = 'hey';
    return { shouldRespond: true, reason: 'direct-address', cleanedText: cleaned };
  }

  if (wasReplyToSynAi(input.chatJid, input.senderId, input.quotedStanzaId)) {
    return { shouldRespond: true, reason: 'reply-to-synai', cleanedText: text };
  }

  if (isActiveConversation(input.chatJid, input.senderId) && FOLLOW_UP_RE.test(text)) {
    return { shouldRespond: true, reason: 'active-followup', cleanedText: text };
  }

  // Very short continuations only while conversation is hot (<3 min)
  if (
    isActiveConversation(input.chatJid, input.senderId, 3 * 60 * 1000) &&
    text.length <= 48 &&
    /^(why|how|and|what about|what if|yes|no|more|ok)\b/i.test(text)
  ) {
    return { shouldRespond: true, reason: 'hot-followup', cleanedText: text };
  }

  return { shouldRespond: false, reason: 'group-chatter', cleanedText: text };
}
