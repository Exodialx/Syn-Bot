/**
 * Lightweight rotating weekly event flags for existing systems.
 */
import { getDb, saveDb } from '../db/database.js';

export type WeekEventId = 'fisch' | 'street' | 'business' | 'none';

type WeekState = {
  id: WeekEventId;
  label: string;
  startedAt: number;
  endsAt: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const LABELS: Record<WeekEventId, string> = {
  fisch: '🎣 FISCH WEEK — sea pays better',
  street: '🔫 STREET WEEK — street jobs heat up',
  business: '💼 BUSINESS WEEK — collections hit harder',
  none: 'No active city event',
};

function store(): WeekState {
  const db = getDb() as any;
  if (!db.weekEvent) {
    db.weekEvent = {
      id: 'none',
      label: LABELS.none,
      startedAt: Date.now(),
      endsAt: Date.now() + WEEK_MS,
    };
  }
  return db.weekEvent as WeekState;
}

export function getWeekEvent(): WeekState {
  const s = store();
  if (Date.now() > s.endsAt) {
    // rotate
    const order: WeekEventId[] = ['fisch', 'street', 'business', 'none'];
    const idx = Math.max(0, order.indexOf(s.id));
    const next = order[(idx + 1) % order.length];
    s.id = next;
    s.label = LABELS[next];
    s.startedAt = Date.now();
    s.endsAt = Date.now() + WEEK_MS;
    saveDb();
  }
  return s;
}

export function formatWeekEvent(): string {
  const s = getWeekEvent();
  const left = Math.max(0, s.endsAt - Date.now());
  const days = (left / 86400000).toFixed(1);
  return `📅 *CITY EVENT*\n${s.label}\n_${days}d remaining_\n▸ .event`;
}

/** Multipliers consumed by other systems (default 1). */
export function eventMult(kind: 'fisch' | 'street' | 'business'): number {
  const s = getWeekEvent();
  if (s.id === kind) return 1.15;
  return 1;
}
