/**
 * SynAI — Math Skill (Phase 2).
 *
 * Safe arithmetic evaluation (shunting-yard, no eval), unit conversions,
 * percentages. Zero dependencies.
 */

/** Evaluate a math expression safely. Returns null on any invalid input. */
export function evaluateExpression(expr: string): number | null {
  // Strict charset validation
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned || !/^[\d+\-*/^%().]+$/.test(cleaned)) return null;
  if (cleaned.length > 100) return null; // sanity cap

  const tokens = cleaned.match(/\d+\.?\d*|[+\-*/^%()]/g);
  if (!tokens) return null;

  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const output: (number | string)[] = [];
  const ops: string[] = [];

  for (const tk of tokens) {
    if (/^\d/.test(tk)) {
      output.push(parseFloat(tk));
    } else if (tk === '(') {
      ops.push(tk);
    } else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop() as string);
      if (!ops.length) return null;
      ops.pop();
    } else {
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[tk]) {
        output.push(ops.pop() as string);
      }
      ops.push(tk);
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === '(') return null;
    output.push(op);
  }

  const stack: number[] = [];
  for (const tk of output) {
    if (typeof tk === 'number') {
      stack.push(tk);
    } else {
      if (stack.length < 2) return null;
      const b = stack.pop() as number;
      const a = stack.pop() as number;
      switch (tk) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': stack.push(a / b); break;
        case '%': stack.push(a % b); break;
        case '^': stack.push(Math.pow(a, b)); break;
        default: return null;
      }
    }
  }
  if (stack.length !== 1) return null;
  const result = stack[0];
  return Number.isFinite(result) ? result : null;
}

/** Detect a math question and answer it. Returns null if not math. */
export function tryMath(question: string): string | null {
  const q = question.toLowerCase().trim();

  // Extract expression from natural language
  const m = q.match(/(?:what is|whats|what's|calculate|compute|solve)?\s*([-+]?[\d(][\d\s+\-*/^%().]*[\d)]|[-+]?[\d.]+\s*[+\-*/^%]\s*[\d.]+)/);
  if (!m) return null;
  const expr = m[1];
  // Must contain an operator to be math (avoid "what is 5" → 5)
  if (!/[+\-*/^%]/.test(expr)) return null;

  const result = evaluateExpression(expr);
  if (result === null) return null;
  const pretty = Number.isInteger(result) ? result.toLocaleString() : parseFloat(result.toFixed(6)).toString();
  return `🧮 ${expr.replace(/\s+/g, ' ').trim()} = *${pretty}*`;
}

// ── Unit conversions ──

type Conversion = { from: string; to: string; factor: number };

const LENGTH_CONVERSIONS: Conversion[] = [
  { from: 'km', to: 'miles', factor: 0.621371 },
  { from: 'miles', to: 'km', factor: 1.609344 },
  { from: 'm', to: 'feet', factor: 3.28084 },
  { from: 'feet', to: 'm', factor: 0.3048 },
  { from: 'cm', to: 'inches', factor: 0.393701 },
  { from: 'inches', to: 'cm', factor: 2.54 },
  { from: 'kg', to: 'lbs', factor: 2.20462262 },
  { from: 'lbs', to: 'kg', factor: 0.45359237 },
  { from: 'celsius', to: 'fahrenheit', factor: NaN }, // special
  { from: 'fahrenheit', to: 'celsius', factor: NaN }, // special
];

/** Try a unit conversion question like "convert 10 km to miles". Returns null if not a conversion. */
export function tryConversion(question: string): string | null {
  const q = question.toLowerCase().trim();
  const m = q.match(/(?:convert\s+)?(-?\d+\.?\d*)\s*(km|miles|mi|m|feet|ft|cm|inches|in|kg|lbs|pounds|celsius|fahrenheit|c|f)\s*(?:to|in|into)\s*(km|miles|mi|m|feet|ft|cm|inches|in|kg|lbs|pounds|celsius|fahrenheit|c|f)/);
  if (!m) return null;

  const value = parseFloat(m[1]);
  const from = normalizeUnit(m[2]);
  const to = normalizeUnit(m[3]);

  // Temperature specials
  if (from === 'celsius' && to === 'fahrenheit') {
    const f = value * 9 / 5 + 32;
    return `🌡️ ${value}°C = *${parseFloat(f.toFixed(2))}°F*`;
  }
  if (from === 'fahrenheit' && to === 'celsius') {
    const c = (value - 32) * 5 / 9;
    return `🌡️ ${value}°F = *${parseFloat(c.toFixed(2))}°C*`;
  }

  const conv = LENGTH_CONVERSIONS.find((c) => c.from === from && c.to === to);
  if (!conv) return null;
  const out = value * conv.factor;
  return `📐 ${value} ${from} = *${parseFloat(out.toFixed(4))} ${to}*`;
}

function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    mi: 'miles', m: 'm', ft: 'feet', in: 'inches',
    c: 'celsius', f: 'fahrenheit', pounds: 'lbs',
  };
  return map[u] || u;
}

/** Percentage questions: "what is 20% of 150" */
export function tryPercentage(question: string): string | null {
  const q = question.toLowerCase().trim();
  const m = q.match(/(\d+\.?\d*)\s*%\s*(?:of|off)\s*(\d+\.?\d*)/);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  const base = parseFloat(m[2]);
  const part = (pct / 100) * base;
  return `🧮 ${pct}% of ${base.toLocaleString()} = *${parseFloat(part.toFixed(4)).toLocaleString()}*`;
}