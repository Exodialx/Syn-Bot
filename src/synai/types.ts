/**
 * SynAI — shared types.
 *
 * SynAI is the offline brain inside Syn Bot:
 *  - NO LLM, NO API calls, NO external services, NO API keys.
 *  - Pure pattern matching + TF-IDF intent classification + knowledge bases.
 *  - Target latency: < 100ms per query, fully offline capable.
 */

/** A single intent definition (loaded from knowledge/intents.json) */
export type Intent = {
  /** Unique intent id, e.g. "greeting" */
  name: string;
  /** Optional topic tag used for follow-up resolution ("what about X?") */
  topic?: string;
  /** Example phrases used to build the TF-IDF model */
  examples: string[];
  /** Single-word keyword triggers (word-boundary match). Default weight 1. */
  keywords?: string[];
  /** Multi-word phrase triggers matched against the full normalized query */
  phrases?: string[];
  /** Optional regex rules (case-insensitive, tested against the raw query) */
  regex?: string[];
  /** Base weight multiplier for this intent (default 1) */
  weight?: number;
  /** Response templates. {vars} are filled by the response generator. */
  templates: string[];
};

/** Result of entity extraction over a query */
export type EntityHit = {
  /** Numeric amounts found (supports 5000 / 50k / 1.5m / 2b) */
  numbers: number[];
  /** @mentions or bare player-name tokens */
  mentions: string[];
  /** Known entity names found (games, roles, commands, places, crypto…) */
  entities: string[];
  /** Best-guess topic of the query (used for follow-ups) */
  topic: string | null;
};

/** One stored conversation turn (per user, max 5 kept) */
export type Turn = {
  q: string;
  a: string;
  intent: string;
  topic: string | null;
  ts: number;
};

/** Per-user conversation state */
export type UserContext = {
  userId: string;
  lastIntent: string | null;
  lastTopic: string | null;
  turns: number;
  history: Turn[]; // newest last, max 5
};

/** How an answer was produced */
export type SynAISource =
  | 'exact'
  | 'taught'
  | 'learned'
  | 'pattern'
  | 'tfidf'
  | 'context'
  | 'math'
  | 'time'
  | 'fallback';

/** Full result returned by the engine */
export type SynAIResult = {
  answer: string;
  intent: string;
  confidence: number;
  source: SynAISource;
  latencyMs: number;
};

/** Optional player context Syn Bot can pass in for personalized answers */
export type AskContext = {
  name?: string;
  role?: string;
  cash?: number;
};

/** Internal candidate produced by the classifiers */
export type Candidate = {
  intent: string;
  score: number;
};