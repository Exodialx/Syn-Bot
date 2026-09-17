/**
 * SynAI — Weather Skill (Phase 2).
 * Wraps wttr.in (free, no key). Live data, never cached.
 */
import { fetchWeather } from '../knowledge/webScraper.js';

/** Detect "weather in X" questions and answer live. Returns null if not weather. */
export async function tryWeather(question: string): Promise<string | null> {
  const q = question.toLowerCase().trim();
  const m = q.match(/weather (?:in|for|at) ([a-z\s]+?)\??$/) ||
            q.match(/(?:is it raining|how hot is it) in ([a-z\s]+?)\??$/);
  if (!m) return null;
  const city = m[1].trim();
  if (!city || city.length > 60) return null;
  const result = await fetchWeather(city);
  if (result) return result;
  return `🌦️ Couldn't reach the weather service for "${city}". It may be offline — try again later.`;
}