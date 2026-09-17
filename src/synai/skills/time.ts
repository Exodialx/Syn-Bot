/**
 * SynAI — Time & Date Skill (Phase 2).
 *
 * Timezone-aware current time (Intl, zero deps), date math ("3 days from now"),
 * countdowns. All offline.
 */

/** Common timezone aliases → IANA names */
const TZ_ALIASES: Record<string, string> = {
  lagos: 'Africa/Lagos',
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  moscow: 'Europe/Moscow',
  'new york': 'America/New_York',
  'sao paulo': 'America/Sao_Paulo',
  nyc: 'America/New_York',
  chicago: 'America/Chicago',
  denver: 'America/Denver',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  toronto: 'America/Toronto',
  dubai: 'Asia/Dubai',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  shanghai: 'Asia/Shanghai',
  singapore: 'Asia/Singapore',
  hongkong: 'Asia/Hong_Kong',
  sydney: 'Australia/Sydney',
  auckland: 'Pacific/Auckland',
  utc: 'UTC',
  gmt: 'UTC',
};

/** Format the current time in a timezone. Returns null for unknown tz. */
export function timeInZone(tzQuery: string): string | null {
  const key = tzQuery.toLowerCase().trim().replace(/\s+/g, ' ');
  const tz = TZ_ALIASES[key] || (isValidTz(tzQuery) ? tzQuery : null);
  if (!tz) return null;
  try {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date());
    const date = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());
    return `🕐 *${time}* — ${date}\n_( ${tz} )_`;
  } catch {
    return null;
  }
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Detect a "time in X" question. Returns null if not a time question. */
export function tryTimeQuestion(question: string): string | null {
  const q = question.toLowerCase().trim();
  const m = q.match(/(?:what(?:'s| is)? the )?time (?:in|at) ([a-z\s]+?)(?: right now| now)?\??$/) ||
            q.match(/what time is it in ([a-z\s]+?)\??$/);
  if (!m) return null;
  return timeInZone(m[1].trim());
}

/** Date math: "what is 3 days from now", "date in 2 weeks" */
export function tryDateMath(question: string): string | null {
  const q = question.toLowerCase().trim();
  const m = q.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)\s*(?:from (?:now|today)|later|ago)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const isPast = /ago/.test(q);
  const d = new Date();
  const mult: Record<string, number> = {
    day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365,
  };
  const days = n * (mult[unit] || 1) * (isPast ? -1 : 1);
  d.setDate(d.getDate() + days);
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d);
  return `📅 ${n} ${unit}${isPast ? ' ago' : ' from now'} → *${formatted}*`;
}