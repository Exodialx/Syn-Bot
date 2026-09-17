/**
 * SynAI — Web Scraper (Phase 2).
 *
 * Fetches knowledge from FREE, NO-API-KEY sources and converts it into
 * SynAI-compatible knowledge entries. Used by webLearner/gapFiller and by
 * on-demand skills (weather, translate, define).
 *
 * Sources:
 *  - Wikipedia REST summary      (high confidence)
 *  - Free Dictionary API         (high confidence)
 *  - DuckDuckGo Instant Answer   (medium confidence)
 *  - Numbers API                 (medium confidence)
 *  - Quotable                    (medium confidence)
 *  - JokeAPI                     (medium confidence)
 *  - wttr.in                     (live weather)
 *  - MyMemory translate          (live translation)
 *
 * Uses native fetch (Node 18+). Zero dependencies. All network calls are
 * timeout-guarded and fail-soft: a dead source never crashes the bot.
 */

/** Confidence levels for scraped sources */
export type SourceConfidence = 'high' | 'medium' | 'low';

export type ScrapedFact = {
  /** Canonical question this fact answers */
  question: string;
  /** The answer text */
  answer: string;
  /** Where it came from */
  source: string;
  /** Source reliability */
  confidence: SourceConfidence;
  /** Numeric confidence 0..1 */
  score: number;
  /** When it was scraped */
  scrapedAt: number;
};

const FETCH_TIMEOUT_MS = 6_000;
const MAX_FACTS_PER_SOURCE = 5;

/** Confidence → numeric score */
const SCORES: Record<SourceConfidence, number> = { high: 0.9, medium: 0.65, low: 0.4 };

/** fetch with hard timeout + typed error, returns null on any failure */
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await safeFetch(url, { headers: { 'User-Agent': 'SynAI/2.1 (WhatsApp bot; offline-first)' } });
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function now(): number {
  return Date.now();
}

function fact(question: string, answer: string, source: string, confidence: SourceConfidence): ScrapedFact {
  return {
    question: question.toLowerCase().replace(/\s+/g, ' ').trim(),
    answer: answer.trim(),
    source,
    confidence,
    score: SCORES[confidence],
    scrapedAt: now(),
  };
}

// ─────────────────────────────────────────────────────────────
// Wikipedia
// ─────────────────────────────────────────────────────────────

type WikiSummary = {
  title?: string;
  extract?: string;
  type?: string;
  description?: string;
};

/**
 * Fetch a Wikipedia summary for a topic.
 * High confidence — curated encyclopedia content.
 */
export async function scrapeWikipedia(topic: string): Promise<ScrapedFact | null> {
  const t = encodeURIComponent(topic.trim().replace(/\s+/g, '_'));
  if (!t) return null;
  const data = await fetchJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${t}`
  );
  if (!data?.extract || data.extract.length < 40) return null;
  const q = `what is ${topic}`;
  return fact(q, `${data.extract}`, 'wikipedia.org', 'high');
}

// ─────────────────────────────────────────────────────────────
// Free Dictionary
// ─────────────────────────────────────────────────────────────

type DictEntry = {
  word?: string;
  phonetic?: string;
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
    synonyms?: string[];
  }[];
};

/**
 * Fetch a dictionary definition for a word.
 * High confidence.
 */
export async function scrapeDefinition(word: string): Promise<ScrapedFact | null> {
  const w = encodeURIComponent(word.trim().toLowerCase());
  if (!w || /\s/.test(word.trim())) return null;
  const data = await fetchJson<DictEntry[]>(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${w}`
  );
  const entry = data?.[0];
  const meaning = entry?.meanings?.[0];
  const def = meaning?.definitions?.[0]?.definition;
  if (!def) return null;
  const pos = meaning?.partOfSpeech ? ` (${meaning.partOfSpeech})` : '';
  const example = meaning?.definitions?.[0]?.example ? `\nExample: "${meaning.definitions[0].example}"` : '';
  return fact(
    `define ${word}`,
    `📖 *${entry?.word || word}*${pos}\n${def}${example}`,
    'dictionaryapi.dev',
    'high'
  );
}

// ─────────────────────────────────────────────────────────────
// DuckDuckGo Instant Answer (no-key JSON API, not scraping HTML)
// ─────────────────────────────────────────────────────────────

type DDGAnswer = {
  AbstractText?: string;
  AbstractURL?: string;
  Answer?: string;
  Definition?: string;
  DefinitionURL?: string;
};

/**
 * DuckDuckGo Instant Answer API — medium confidence.
 * Returns the abstract/definition when DDG has one.
 */
export async function scrapeDuckDuckGo(query: string): Promise<ScrapedFact | null> {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  const data = await fetchJson<DDGAnswer>(
    `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`
  );
  const text = data?.AbstractText || data?.Answer || data?.Definition;
  if (!text || text.length < 30) return null;
  return fact(query, text, data?.AbstractURL || 'duckduckgo.com', 'medium');
}

// ─────────────────────────────────────────────────────────────
// Numbers API
// ─────────────────────────────────────────────────────────────

/** Fetch a trivia fact about a number. Medium confidence. */
export async function scrapeNumberFact(num: number): Promise<ScrapedFact | null> {
  if (!Number.isFinite(num)) return null;
  const res = await safeFetch(`http://numbersapi.com/${Math.floor(num)}?json`);
  if (!res) return null;
  try {
    const data = (await res.json()) as { text?: string; number?: number };
    if (!data?.text) return null;
    return fact(`what is special about the number ${num}`, data.text, 'numbersapi.com', 'medium');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Quotable
// ─────────────────────────────────────────────────────────────

type QuoteData = {
  content?: string;
  author?: string;
};

/** Fetch a random quote. Medium confidence. */
export async function scrapeQuote(): Promise<ScrapedFact | null> {
  const data = await fetchJson<QuoteData>('https://api.quotable.io/random?maxLength=140');
  if (!data?.content) return null;
  return fact(
    'give me a quote',
    `❝ ${data.content}❞\n— *${data.author || 'Unknown'}*`,
    'quotable.io',
    'medium'
  );
}

// ─────────────────────────────────────────────────────────────
// JokeAPI
// ─────────────────────────────────────────────────────────────

type JokeData = {
  error?: boolean;
  type?: 'single' | 'twopart';
  joke?: string;
  setup?: string;
  delivery?: string;
};

/** Fetch a clean joke. Medium confidence. */
export async function scrapeJoke(): Promise<ScrapedFact | null> {
  const data = await fetchJson<JokeData>(
    'https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,religious,racist,sexist,explicit'
  );
  if (!data || data.error) return null;
  const text = data.type === 'single' ? data.joke : `${data.setup}\n\n…${data.delivery}`;
  if (!text) return null;
  return fact('tell me a joke', text, 'jokeapi.dev', 'medium');
}

// ─────────────────────────────────────────────────────────────
// wttr.in weather
// ─────────────────────────────────────────────────────────────

type WttrCurrent = {
  current_condition?: {
    temp_C?: string;
    FeelsLikeC?: string;
    humidity?: string;
    weatherDesc?: { value?: string }[];
    windspeedKmph?: string;
  }[];
  nearest_area?: { areaName?: { value?: string }[]; country?: { value?: string }[] }[];
};

/** Fetch weather for a city. Live data — never cached as a fact. */
export async function fetchWeather(city: string): Promise<string | null> {
  const c = encodeURIComponent(city.trim());
  if (!c) return null;
  const data = await fetchJson<WttrCurrent>(`https://wttr.in/${c}?format=j1`);
  const cur = data?.current_condition?.[0];
  if (!cur) return null;
  const desc = cur.weatherDesc?.[0]?.value || 'unknown';
  const area = data?.nearest_area?.[0]?.areaName?.[0]?.value || city;
  return `🌦️ *${area}*\n${desc}\n🌡️ ${cur.temp_C}°C (feels ${cur.FeelsLikeC ?? cur.temp_C}°C)\n💧 Humidity ${cur.humidity}%  ·  💨 Wind ${cur.windspeedKmph} km/h`;
}

// ─────────────────────────────────────────────────────────────
// MyMemory translation
// ─────────────────────────────────────────────────────────────

type MyMemory = { responseData?: { translatedText?: string }; responseStatus?: number | string };

/** Translate text via MyMemory (free, no key). Live — never cached. */
export async function fetchTranslation(text: string, targetLang: string): Promise<string | null> {
  const t = encodeURIComponent(text.trim().slice(0, 400));
  const lang = encodeURIComponent(targetLang.trim().toLowerCase());
  if (!t || !lang) return null;
  const data = await fetchJson<MyMemory>(
    `https://api.mymemory.translated.net/get?q=${t}&langpair=en|${lang}`
  );
  const out = data?.responseData?.translatedText;
  if (!out || data?.responseStatus !== 200) return null;
  return out;
}

// ─────────────────────────────────────────────────────────────
// Multi-source research (used by webLearner / gapFiller)
// ─────────────────────────────────────────────────────────────

/**
 * Research a question across all high-value sources.
 * Returns every fact found (caller filters by confidence threshold).
 */
export async function researchQuestion(question: string): Promise<ScrapedFact[]> {
  const facts: ScrapedFact[] = [];
  const q = question.trim();
  if (!q) return facts;

  // Strip question scaffolding to get the topic
  const topic = q
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|does|do|did)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();

  const results = await Promise.allSettled([
    scrapeWikipedia(topic || q),
    scrapeDuckDuckGo(q),
    scrapeDefinition(topic.split(/\s+/)[0] || ''),
  ]);

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) facts.push(r.value);
  }
  return facts.slice(0, MAX_FACTS_PER_SOURCE);
}

/** Best single answer for a question (highest-confidence source wins) */
export async function bestAnswer(question: string): Promise<ScrapedFact | null> {
  const facts = await researchQuestion(question);
  if (!facts.length) return null;
  facts.sort((a, b) => b.score - a.score);
  return facts[0];
}