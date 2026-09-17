/**
 * SynAI — main entry point (Phase 2).
 *
 * Syn Bot calls:  getSynAIResponse(question, userId, context) → string
 *            or:  askSynAI(question, userId, context) → SynAIResult
 *
 * Answer pipeline (in priority order):
 *   0. Skills        — math, conversions, time, date math, code sandbox
 *   1. Taught Q&A    — exact → fuzzy (.teach knowledge, always wins)
 *   2. Learned facts — web-learned knowledge (.learn / gap filler)
 *   3. Classifiers   — pattern matcher + TF-IDF fused by confidence scorer
 *   4. Search index  — inverted index over ALL knowledge (boolean/fuzzy)
 *   5. Live skills   — weather / translate (network, on-demand)
 *   6. Fallback      — "I don't know" + gap tracking (learns it later)
 *
 * NO LLM. NO KEYS. NO PAID APIS. Free sources only, offline-first.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { AskContext, Intent, SynAIResult, SynAISource, Turn } from './types.js';
import { PatternMatcher } from './engine/patternMatcher.js';
import { IntentClassifier } from './engine/intentClassifier.js';
import { EntityExtractor } from './engine/entityExtractor.js';
import { ContextManager } from './engine/contextManager.js';
import { ConfidenceScorer, CONFIDENCE_THRESHOLD } from './engine/confidenceScorer.js';
import { ResponseGenerator } from './engine/responseGenerator.js';
import { Teacher } from './learning/teacher.js';
import { FeedbackLoop } from './learning/feedbackLoop.js';
import { WebLearner } from './learning/webLearner.js';
import { GapFiller } from './learning/gapFiller.js';
import { KnowledgeSearch, SearchDoc } from './knowledge/search.js';
import { tryMath, tryConversion, tryPercentage } from './skills/math.js';
import { tryTimeQuestion, tryDateMath } from './skills/time.js';
import { tryWeather } from './skills/weather.js';
import { tryTranslate } from './skills/translate.js';
import { tryCode } from './skills/code.js';
import { normalize } from './engine/textUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load knowledge base (JSON) ──
function loadJson<T>(rel: string): T {
  const candidates = [
    path.join(__dirname, 'knowledge', rel),
    path.join(__dirname, '..', 'src', 'synai', 'knowledge', rel),
    path.join(process.cwd(), 'src', 'synai', 'knowledge', rel),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as T;
    } catch {
      continue;
    }
  }
  throw new Error(`SynAI: missing knowledge file ${rel}`);
}

type IntentsFile = { intents: Intent[] };

const coreIntents = loadJson<IntentsFile>('intents.json').intents;
const gameIntents = loadJson<IntentsFile>('game_intents.json').intents;
const synonyms = loadJson<{ synonyms: Record<string, string[]> }>('synonyms.json').synonyms;
const entitiesData = loadJson<{ entities: Record<string, string[]> }>('entities.json');
const jokesFacts = loadJson<{ jokes: string[]; facts: string[] }>('jokes_facts.json');
const fallbacks = loadJson<{ fallbacks: string[] }>('fallbacks.json').fallbacks;

// Merge + dedupe by intent name (first definition wins)
const intentMap = new Map<string, Intent>();
for (const it of [...gameIntents, ...coreIntents]) {
  if (!intentMap.has(it.name)) intentMap.set(it.name, it);
}
const ALL_INTENTS: Intent[] = [...intentMap.values()];

// ── Engine singletons (built once at module load) ──
const patternMatcher = new PatternMatcher(ALL_INTENTS);
const classifier = new IntentClassifier(ALL_INTENTS, synonyms);
const extractor = new EntityExtractor(entitiesData);
const context = new ContextManager();
const scorer = new ConfidenceScorer();
const generator = new ResponseGenerator(jokesFacts);
const teacher = new Teacher();
const feedback = new FeedbackLoop();
const learner = new WebLearner();
const gapFiller = new GapFiller(learner);
const search = new KnowledgeSearch();

const INTENT_BY_NAME = new Map(ALL_INTENTS.map((i) => [i.name, i]));
const MAX_QUESTION_LEN = 500;
const LAST_INTENT_TTL_MS = 10 * 60 * 1000;

/** Track the last answered intent per user (for .synai good/.synai bad) */
const lastAnswered = new Map<string, { intent: string; ts: number }>();

// ── Index everything into the search engine ──
function indexIntent(i: Intent): void {
  search.add({
    id: `intent:${i.name}`,
    kind: 'intent',
    text: [...i.examples, ...(i.phrases || []), ...(i.keywords || []), i.templates.join(' ')].join(' '),
    answer: i.templates[0],
    boost: 0.8,
  });
}
for (const i of ALL_INTENTS) indexIntent(i);

function indexTaught(): void {
  for (const e of teacher.allEntries()) {
    search.add({
      id: `taught:${e.q}`,
      kind: 'taught',
      text: `${e.q} ${e.a}`,
      answer: e.a,
      boost: 1.0,
    });
  }
}
indexTaught();

function indexFacts(): void {
  for (const f of learner.all()) {
    search.add({
      id: `fact:${f.q}`,
      kind: 'fact',
      text: `${f.q} ${f.a}`,
      answer: f.a,
      boost: f.score,
    });
  }
}
indexFacts();

/** Confidence tier prefix — how sure SynAI sounds */
function confidencePrefix(confidence: number): string {
  if (confidence >= 0.8) return '';
  if (confidence >= 0.6) return '🤔 _I think…_\n';
  return '';
}

/**
 * Core engine. Returns full result (answer, intent, confidence, source, latency).
 */
export function askSynAI(question: string, userId: string, ctx?: AskContext): SynAIResult {
  const t0 = Date.now();
  const base: SynAIResult = { answer: '', intent: 'unknown', confidence: 0, source: 'fallback', latencyMs: 0 };
  const finish = (): SynAIResult => {
    base.latencyMs = Date.now() - t0;
    return base;
  };

  // ── Edge cases: empty / too long input ──
  let q = String(question ?? '').trim();
  if (!q) {
    base.answer = '🤖 Ask me something! Example: .synai how does crime work';
    return finish();
  }
  if (q.length > MAX_QUESTION_LEN) q = q.slice(0, MAX_QUESTION_LEN);
  const uid = String(userId || 'anon');

  // ── 0a) Offline skills: math / conversions / percentages / time / date math ──
  const mathAns = tryMath(q) || tryConversion(q) || tryPercentage(q);
  if (mathAns) {
    base.answer = mathAns; base.intent = 'math'; base.confidence = 1; base.source = 'math';
    record(uid, q, base, 'math');
    return finish();
  }
  const timeAns = tryTimeQuestion(q) || tryDateMath(q);
  if (timeAns) {
    base.answer = timeAns; base.intent = 'time'; base.confidence = 1; base.source = 'time';
    record(uid, q, base, 'time');
    return finish();
  }
  // code sandbox (.synai run 2+2)
  const codeAns = tryCode(q);
  if (codeAns) {
    base.answer = codeAns; base.intent = 'code'; base.confidence = 1; base.source = 'math';
    record(uid, q, base, 'code');
    return finish();
  }

  // ── Follow-up resolution (context-aware rewrite) ──
  const resolved = context.resolveFollowUp(uid, q);
  const qNorm = normalize(resolved);

  // ── 1) Taught knowledge: exact → fuzzy (taught always wins) ──
  const exact = teacher.lookupExact(resolved);
  if (exact) {
    base.answer = exact.a;
    base.intent = 'taught';
    base.confidence = 1.0;
    base.source = 'taught';
    record(uid, q, base, null);
    return finish();
  }

  // ── 2) Learned facts (web knowledge): exact lookup ──
  const learned = learner.lookup(resolved);
  if (learned) {
    base.answer = learned.a;
    base.intent = 'learned';
    base.confidence = learned.score;
    base.source = 'learned';
    record(uid, q, base, null);
    return finish();
  }

  // ── 3) Classify: pattern + TF-IDF, fuse scores ──
  const patternCands = patternMatcher.match(resolved);
  const tfidfCands = classifier.classify(resolved, synonyms);
  const fused = scorer.fuse(patternCands, tfidfCands);
  const best = scorer.best(fused);

  if (best) {
    const intent = INTENT_BY_NAME.get(best.intent);
    if (intent) {
      const answer = generator.render(intent, qNorm, ctx);
      base.answer = confidencePrefix(best.confidence) + answer;
      base.intent = intent.name;
      base.confidence = best.confidence;
      base.source = best.patternScore >= 1 ? 'exact' : best.patternScore >= 0.5 ? 'pattern' : 'tfidf';
      record(uid, q, base, intent.topic ?? null);
      return finish();
    }
  }

  // ── 4) Knowledge search over everything (intents + taught + facts) ──
  const hit = search.best(resolved, 0.4);
  if (hit) {
    base.answer = confidencePrefix(hit.score) + hit.doc.answer;
    base.intent = `search:${hit.doc.kind}`;
    base.confidence = hit.score;
    base.source = 'pattern';
    record(uid, q, base, null);
    return finish();
  }

  // ── 5) Fallback — track the gap so SynAI can learn it later ──
  gapFiller.recordGap(resolved);
  const fuzzy = teacher.lookupFuzzy(resolved, 0.75);
  if (fuzzy) {
    base.answer = fuzzy.entry.a;
    base.intent = 'taught';
    base.confidence = fuzzy.score;
    base.source = 'taught';
    record(uid, q, base, null);
    return finish();
  }
  base.answer = generator.fallback(fallbacks, q);
  base.intent = 'unknown';
  base.confidence = fused.length ? fused[0].confidence : 0;
  base.source = 'fallback';
  record(uid, q, base, null);
  return finish();
}

/**
 * Live-skill pipeline (network). Called by the bot AFTER askSynAI returned a
 * fallback — upgrades "I don't know" into a live answer when possible.
 */
export async function tryLiveSkills(question: string): Promise<string | null> {
  const weather = await tryWeather(question);
  if (weather) return weather;
  const translated = await tryTranslate(question);
  if (translated) return translated;
  return null;
}

/** Bookkeeping after every answer: memory + last-intent tracking */
function record(uid: string, question: string, result: SynAIResult, topic: string | null): void {
  const turn: Turn = { q: question, a: result.answer, intent: result.intent, topic, ts: Date.now() };
  context.record(uid, turn);
  lastAnswered.set(uid, { intent: result.intent, ts: Date.now() });
  context.flush();
  teacher.flush();
  feedback.flush();
  learner.flush();
  gapFiller.flush();
}

/**
 * Simple string interface for the bot handler.
 */
export function getSynAIResponse(question: string, userId: string, ctx?: AskContext): string {
  return askSynAI(question, userId, ctx).answer;
}

// ── Feedback & teaching surface (called from handler) ──

/** .synai good / .synai bad */
export function rateSynAI(userId: string, good: boolean): string {
  const entry = lastAnswered.get(String(userId || ''));
  if (!entry || Date.now() - entry.ts > LAST_INTENT_TTL_MS) {
    return '⏳ Nothing recent to rate — ask me something first, then rate it.';
  }
  return feedback.recordFeedback(entry.intent, good, String(userId || ''));
}

/** .teach "q" "a" — also refreshes the search index */
export function teachSynAI(question: string, answer: string, adminId: string): string {
  const res = teacher.teach(question, answer, adminId);
  if (res.startsWith('🎓') || res.startsWith('✅')) {
    const key = String(question).toLowerCase().replace(/\s+/g, ' ').trim();
    search.add({
      id: `taught:${key}`,
      kind: 'taught',
      text: `${key} ${answer}`,
      answer,
      boost: 1.0,
    });
  }
  return res;
}

/** .teach list */
export function listTaught(page = 1): string {
  return teacher.list(page);
}

/** .teach forget "q" */
export function forgetTaught(question: string): string {
  const res = teacher.forget(question);
  if (res.startsWith('🧹')) {
    const key = String(question).toLowerCase().replace(/\s+/g, ' ').trim();
    search.remove(`taught:${key}`);
  }
  return res;
}

/** .learn <topic> — force web learning (admin) */
export async function learnTopic(topic: string): Promise<string> {
  if (/^gaps?$/i.test(topic.trim())) {
    return gapFiller.processGaps(5);
  }
  const res = await learner.learnQuery(topic, 'manual');
  // index anything new
  indexFacts();
  return res;
}

/** .learn log — recent learning activity */
export function learnLog(): string {
  return learner.recentLog(10);
}

/** .search <query> — search the knowledge base */
export function searchKnowledge(query: string): string {
  const results = search.search(query, 3);
  if (!results.length) return `🔍 No results for "${query}".\nTeach me: .teach "question" "answer"`;
  const lines = results.map((r, i) => {
    const src = r.doc.kind === 'taught' ? '🎓 taught' : r.doc.kind === 'fact' ? '🌐 learned' : '🧠 intent';
    return `${i + 1}. [${src}] ${r.doc.answer.slice(0, 120)}${r.doc.answer.length > 120 ? '…' : ''}\n   relevance: ${(r.score * 100).toFixed(0)}%`;
  });
  return `🔍 *SEARCH: "${query}"*\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`;
}

/** .aifeedback (admin) */
export function synAIFeedbackSummary(): string {
  return feedback.summary();
}

/** .aistats (admin) — engine diagnostics */
export function synAIStats(): string {
  return `🧠 *SYNAI STATS*
━━━━━━━━━━━━━━━━━━━━
Intents: *${ALL_INTENTS.length}*
Taught Q&A: *${teacher.size}*
Learned facts: *${learner.size}*
Search index: *${search.size}* docs
Knowledge gaps: *${gapFiller.size}*
Vocabulary: *${classifier.size}* terms
Threshold: ${CONFIDENCE_THRESHOLD}
Mode: offline-first · free sources only · no LLM
━━━━━━━━━━━━━━━━━━━━
.teach "q" "a" · .learn <topic> · .search <q>`;
}

/** Start background learners (hourly auto-learn + gap fill) */
export function startSynAILearning(): void {
  learner.startAutoLearn();
  gapFiller.startAutoFill();
}

/** Stop background learners (clean shutdown) */
export function stopSynAILearning(): void {
  learner.stopAutoLearn();
  gapFiller.stopAutoFill();
}

/** Test/diagnostic entry — returns raw details without side effects */
export function debugClassify(question: string): { intent: string; confidence: number; source: SynAISource } {
  const patternCands = patternMatcher.match(question);
  const tfidfCands = classifier.classify(question, synonyms);
  const fused = scorer.fuse(patternCands, tfidfCands);
  const best = scorer.best(fused);
  return {
    intent: best?.intent || 'unknown',
    confidence: best?.confidence || 0,
    source: best ? (best.patternScore >= 1 ? 'exact' : best.patternScore >= 0.5 ? 'pattern' : 'tfidf') : 'fallback',
  };
}