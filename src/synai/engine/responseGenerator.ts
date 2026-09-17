/**
 * SynAI — Response Generator.
 * Picks a template variation, fills variables ({name}, {joke}, {fact}),
 * and renders special placeholders (__TIME__, __MATH__).
 */
import { AskContext, Intent } from '../types.js';
import { pickRandom, pickSeeded } from './textUtils.js';

export type TemplateVars = {
  name?: string;
  joke?: string;
  fact?: string;
};

export class ResponseGenerator {
  private jokes: string[];
  private facts: string[];

  constructor(jokesFacts: { jokes: string[]; facts: string[] }) {
    this.jokes = jokesFacts?.jokes || [];
    this.facts = jokesFacts?.facts || [];
  }

  /**
   * Render an intent into a final answer string.
   * Seeded pick keeps answers stable for the same question (nice for tests),
   * except jokes/facts which intentionally rotate.
   */
  render(intent: Intent, question: string, ctx?: AskContext): string {
    const vars: TemplateVars = {
      name: ctx?.name || undefined,
      joke: this.jokes.length ? pickRandom(this.jokes) : 'Why did the bot cross the road? To fetch the API response 🤖',
      fact: this.facts.length ? pickRandom(this.facts) : 'The first computer bug was an actual moth in 1947.',
    };

    const template = intent.templates.length > 1
      ? pickSeeded(intent.templates, question.toLowerCase())
      : intent.templates[0];

    let out = template;
    // Fill {var} placeholders
    out = out.replace(/\{(\w+)\}/g, (match, key: string) => {
      const val = (vars as Record<string, unknown>)[key];
      return val !== undefined && val !== null ? String(val) : match;
    });
    // Render special placeholders
    if (out.includes('__TIME__')) out = this.renderTime(out);
    if (out.includes('__MATH__')) out = this.renderMath(out, question);
    return out;
  }

  private renderTime(template: string): string {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return template
      .replace('__TIME__', `🕐 ${time} — ${date}\n_(server time)_`);
  }

  /**
   * Safe arithmetic evaluator: extracts a math expression from the question,
   * validates the charset strictly, then evaluates with shunting-yard.
   * Supports + - * / % ^ and parentheses. Never uses eval().
   */
  private renderMath(template: string, question: string): string {
    // Extract expression: allow digits, operators, parens, spaces, dots
    const match = question.match(/[-+]?[\d(][\d\s+\-*/^%().]*[\d)]/);
    if (!match) {
      return template.replace('__MATH__', '🧮 Give me an expression, e.g. .ai what is 25*4');
    }
    let expr = match[0].trim();

    // Convert word operators
    const q = question.toLowerCase();
    if (/\bplus\b|\badd\b/.test(q)) expr = expr.replace(/\bplus\b|\badd\b/g, '+');
    if (/\bminus\b|\bsubtract\b/.test(q)) expr = expr.replace(/\bminus\b|\bsubtract\b/g, '-');
    if (/\btimes\b|\bmultiply\b|\bmultiplied by\b/.test(q)) expr = expr.replace(/\btimes\b/g, '*').replace(/\bmultiplied by\b/g, '*');
    if (/\bdivided by\b|\bdivide\b/.test(q)) expr = expr.replace(/\bdivided by\b/g, '/').replace(/\bdivide\b/g, '/');

    // Strict charset validation before evaluation
    if (!/^[\d\s+\-*/^%().]+$/.test(expr)) {
      return template.replace('__MATH__', '🧮 I can only do arithmetic (+ − × ÷ % ^).');
    }

    try {
      const result = this.evaluate(expr);
      if (!Number.isFinite(result)) throw new Error('non-finite');
      const pretty = Number.isInteger(result) ? result.toLocaleString() : parseFloat(result.toFixed(6)).toString();
      return template.replace('__MATH__', `🧮 ${expr.replace(/\s+/g, ' ').trim()} = *${pretty}*`);
    } catch {
      return template.replace('__MATH__', '🧮 That expression broke my calculator. Try something like 25*4 or (100+50)/2');
    }
  }

  /** Shunting-yard evaluation — no eval(), no Function() */
  private evaluate(expr: string): number {
    const tokens = expr.match(/\d+\.?\d*|[+\-*/^%()]/g);
    if (!tokens) throw new Error('no tokens');

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
        if (!ops.length) throw new Error('mismatched parens');
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
      if (op === '(') throw new Error('mismatched parens');
      output.push(op);
    }

    // RPN evaluation
    const stack: number[] = [];
    for (const tk of output) {
      if (typeof tk === 'number') {
        stack.push(tk);
      } else {
        if (stack.length < 2) throw new Error('bad rpn');
        const b = stack.pop() as number;
        const a = stack.pop() as number;
        switch (tk) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/': stack.push(a / b); break;
          case '%': stack.push(a % b); break;
          case '^': stack.push(Math.pow(a, b)); break;
          default: throw new Error('bad op');
        }
      }
    }
    if (stack.length !== 1) throw new Error('bad result');
    return stack[0];
  }

  /** Format the "I don't know" fallback */
  fallback(fallbacks: string[], question: string): string {
    return pickSeeded(fallbacks, question.toLowerCase());
  }
}