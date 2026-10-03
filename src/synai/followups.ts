/**
 * Dynamic follow-up button suggestions from the last answer + question.
 * Uses existing ButtonDef shape. Max 3. Skip if fewer than 2 useful ones.
 */
import type { ButtonDef } from '../connection/buttons.js';

function clipLabel(s: string, max = 20): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function generateFollowUpButtons(
  playerId: string,
  question: string,
  answer: string
): ButtonDef[] {
  const q = (question || '').toLowerCase();
  const a = (answer || '').toLowerCase();
  const out: ButtonDef[] = [];
  const add = (label: string, prompt: string) => {
    if (out.length >= 3) return;
    if (out.some((b) => b.text === label)) return;
    out.push({
      id: `synai:ask:${Buffer.from(prompt).toString('base64url').slice(0, 72)}:${playerId}`,
      text: clipLabel(label),
    });
  };

  // Game-aware
  if (/\b(car|garage|vehicle|hypercar|repair)\b/.test(q + a)) {
    add('View garage', 'Show me my garage summary');
    add('Repair tips', 'Should I repair my car right now?');
    add('Car shop', 'What cars can I buy in Syndicates?');
  } else if (/\b(money|cash|bank|afford|price)\b/.test(q + a)) {
    add('My balance', 'How much money do I have?');
    add('Earn more', 'How do I make money fast in Syndicates?');
  } else if (/\b(cartel|gang|crew|guild|clan)\b/.test(q + a)) {
    add('How to join?', 'How do I join a cartel or crew in Syndicates?');
    add('vs gang', "What's the difference between a cartel and a gang here?");
  } else if (/\b(heist|rob|crime|launder)\b/.test(q + a)) {
    add('Heist tips', 'How do heists work in Syndicates?');
    add('Commands', 'What commands are used for crimes?');
  } else if (/\b(level|xp|rank)\b/.test(q + a)) {
    add('My level', 'What level am I?');
    add('Level up', 'How do I level up faster?');
  } else if (/generate|image|picture|draw|logo|art\b/.test(q)) {
    add('Try again', question.slice(0, 80));
  } else {
    // Generic but still contextual — only if answer is substantial
    if ((answer || '').length > 80) {
      if (/\?/.test(answer)) {
        /* AI asked something — no need for buttons */
      } else {
        add('Explain more', `Explain more about: ${question.slice(0, 60)}`);
        add('Example', `Give me an example related to: ${question.slice(0, 50)}`);
        if (/\b(how|what|why)\b/.test(q)) {
          add('Next step', `What's the next step after: ${question.slice(0, 50)}`);
        }
      }
    }
  }

  // Only show if we have 2+ useful follow-ups
  if (out.length < 2) return [];
  return out.slice(0, 3);
}

/** Decode follow-up prompt from interaction id */
export function decodeFollowUpPrompt(interactionId: string): string | null {
  // synai:ask:<base64url>:<playerId>
  const parts = interactionId.split(':');
  if (parts.length < 4 || parts[0] !== 'synai' || parts[1] !== 'ask') return null;
  const b64 = parts.slice(2, -1).join(':');
  try {
    return Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
