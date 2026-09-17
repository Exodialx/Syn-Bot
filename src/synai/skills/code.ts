/**
 * SynAI — Code / Expression Skill (hardened).
 *
 * CRITICAL SECURITY: Never use node:vm with outer-realm objects.
 * Previous version allowed RCE via Math.constructor.constructor etc.
 *
 * This version only evaluates pure arithmetic expressions using the
 * same safe shunting-yard evaluator as the math skill. No Function,
 * no constructors, no objects from the outer realm, no network, no fs.
 */
import { evaluateExpression } from './math.js';

const MAX_LEN = 120;

/**
 * Detect "run <expr>" / "eval <expr>" / "js <expr>" style requests
 * and evaluate a pure math expression safely.
 * Returns null if not a code-style request.
 */
export function tryCode(question: string): string | null {
  const q = question.trim();
  const m = q.match(/^(?:run|eval|js|javascript|calc|calculate)\s+(.+)$/is);
  if (!m) return null;

  const expr = m[1].trim().replace(/\s+/g, '');
  if (!expr) {
    return '💻 Usage: `.synai run 2 + 2 * 3` (pure math only)';
  }
  if (expr.length > MAX_LEN) {
    return `💻 Expression too long (max ${MAX_LEN} chars).`;
  }

  // Hard block any letters or identifiers — only digits and operators allowed
  if (/[a-zA-Z_$]/.test(expr)) {
    return '💻 Only pure math expressions are allowed (numbers and + - * / % ^ ( ) ).\nNo variables, no functions, no code.';
  }

  const result = evaluateExpression(expr);
  if (result === null) {
    return '💻 Could not evaluate that expression. Use basic arithmetic only.';
  }

  // Pretty print integers without trailing .0
  const display = Number.isInteger(result) ? String(result) : String(Number(result.toFixed(8)));
  return `💻 \`${m[1].trim()}\` → *${display}*`;
}
