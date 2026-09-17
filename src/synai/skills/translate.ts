/**
 * SynAI — Translation Skill (Phase 2).
 * MyMemory free API (no key). Supports 50+ language pairs from English.
 */
import { fetchTranslation } from '../knowledge/webScraper.js';

/** Language name → ISO code (common ones) */
const LANGS: Record<string, string> = {
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  dutch: 'nl', russian: 'ru', ukrainian: 'uk', polish: 'pl', turkish: 'tr',
  arabic: 'ar', hebrew: 'he', persian: 'fa', hindi: 'hi', urdu: 'ur',
  bengali: 'bn', tamil: 'ta', telugu: 'te', chinese: 'zh', mandarin: 'zh',
  japanese: 'ja', korean: 'ko', vietnamese: 'vi', thai: 'th', indonesian: 'id',
  malay: 'ms', filipino: 'tl', tagalog: 'tl', swahili: 'sw', hausa: 'ha',
  yoruba: 'yo', igbo: 'ig', zulu: 'zu', afrikaans: 'af', greek: 'el',
  swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', czech: 'cs',
  romanian: 'ro', hungarian: 'hu', english: 'en',
};

/** Detect "translate <text> to <lang>" and answer live. Returns null if not a translate request. */
export async function tryTranslate(question: string): Promise<string | null> {
  const q = question.trim();
  const m = q.match(/^translate\s+(.+?)\s+(?:to|into|in)\s+([a-z]+)\??$/i);
  if (!m) return null;
  const text = m[1].trim();
  const langName = m[2].toLowerCase().trim();
  const code = LANGS[langName] || (langName.length === 2 ? langName : null);
  if (!code) {
    return `🌐 I don't know the language "${langName}". Try: spanish, french, german, japanese, yoruba…`;
  }
  if (!text) return null;

  const out = await fetchTranslation(text, code);
  if (!out) return '🌐 Translation service is unreachable right now. Try again shortly.';
  return `🌐 *${text}*\n→ (${langName}) *${out}*`;
}