/**
 * Formule per le metriche calcolate: parser a discesa ricorsiva ed evaluatore. Nessun `eval`
 * né `new Function`: la formula è un testo dell'utente, quindi viene letta come dati.
 *
 * Sintassi: numeri (con il punto decimale), `+ - * /`, parentesi, meno unario, riferimenti a
 * metriche come `ricavi` oppure `[SUM(importo)]` (le parentesi quadre servono per nomi con spazi
 * o simboli), e le funzioni `abs(x)`, `min(a, b, ...)`, `max(a, b, ...)`, `round(x, decimali)`.
 */

export type FormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'neg'; operand: FormulaNode }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; fn: FormulaFunction; args: FormulaNode[] };

export type FormulaFunction = 'abs' | 'min' | 'max' | 'round';

export type FormulaParseResult =
  { ok: true; ast: FormulaNode; refs: string[] } | { ok: false; error: string; position: number };

const FUNCTIONS: Record<FormulaFunction, { min: number; max: number }> = {
  abs: { min: 1, max: 1 },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
  round: { min: 1, max: 2 },
};

type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'ident'; name: string; pos: number }
  | { type: 'ref'; name: string; pos: number }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' | ','; pos: number }
  | { type: 'end'; pos: number };

class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const start = i;
      while (i < text.length && /[0-9.]/.test(text[i])) i++;
      const literal = text.slice(start, i);
      if ((literal.match(/\./g) ?? []).length > 1) {
        throw new FormulaSyntaxError(`numero non valido "${literal}"`, start);
      }
      tokens.push({ type: 'num', value: Number(literal), pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i++;
      tokens.push({ type: 'ident', name: text.slice(start, i), pos: start });
      continue;
    }
    if (ch === '[') {
      const start = i;
      const close = text.indexOf(']', i + 1);
      if (close < 0) throw new FormulaSyntaxError('parentesi quadra non chiusa', start);
      const name = text.slice(i + 1, close).trim();
      if (!name) throw new FormulaSyntaxError('riferimento vuoto []', start);
      tokens.push({ type: 'ref', name, pos: start });
      i = close + 1;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ type: 'op', op: ch as '+' | '-' | '*' | '/' | '(' | ')' | ',', pos: i });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`carattere non ammesso "${ch}"`, i);
  }
  tokens.push({ type: 'end', pos: text.length });
  return tokens;
}

class Parser {
  private index = 0;
  readonly refs = new Set<string>();

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const node = this.expression();
    const next = this.peek();
    if (next.type !== 'end')
      throw new FormulaSyntaxError('simbolo inatteso dopo la formula', next.pos);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  private isOp(token: Token, op: string): boolean {
    return token.type === 'op' && token.op === op;
  }

  private expression(): FormulaNode {
    let left = this.term();
    while (this.isOp(this.peek(), '+') || this.isOp(this.peek(), '-')) {
      const op = (this.advance() as { op: '+' | '-' }).op;
      left = { kind: 'bin', op, left, right: this.term() };
    }
    return left;
  }

  private term(): FormulaNode {
    let left = this.unary();
    while (this.isOp(this.peek(), '*') || this.isOp(this.peek(), '/')) {
      const op = (this.advance() as { op: '*' | '/' }).op;
      left = { kind: 'bin', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): FormulaNode {
    if (this.isOp(this.peek(), '-')) {
      this.advance();
      return { kind: 'neg', operand: this.unary() };
    }
    if (this.isOp(this.peek(), '+')) {
      this.advance();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.advance();
    if (token.type === 'num') return { kind: 'num', value: token.value };
    if (token.type === 'ref') {
      this.refs.add(token.name);
      return { kind: 'ref', name: token.name };
    }
    if (token.type === 'ident') {
      if (this.isOp(this.peek(), '(')) return this.call(token);
      this.refs.add(token.name);
      return { kind: 'ref', name: token.name };
    }
    if (this.isOp(token, '(')) {
      const inner = this.expression();
      const close = this.advance();
      if (!this.isOp(close, ')'))
        throw new FormulaSyntaxError('manca la parentesi di chiusura', close.pos);
      return inner;
    }
    if (token.type === 'end') throw new FormulaSyntaxError('formula incompleta', token.pos);
    throw new FormulaSyntaxError('operando atteso', token.pos);
  }

  private call(nameToken: Extract<Token, { type: 'ident' }>): FormulaNode {
    const fn = nameToken.name.toLowerCase();
    if (!(fn in FUNCTIONS)) {
      throw new FormulaSyntaxError(`funzione sconosciuta "${nameToken.name}"`, nameToken.pos);
    }
    this.advance(); // (
    const args: FormulaNode[] = [];
    if (!this.isOp(this.peek(), ')')) {
      args.push(this.expression());
      while (this.isOp(this.peek(), ',')) {
        this.advance();
        args.push(this.expression());
      }
    }
    const close = this.advance();
    if (!this.isOp(close, ')'))
      throw new FormulaSyntaxError('manca la parentesi di chiusura', close.pos);
    const limits = FUNCTIONS[fn as FormulaFunction];
    if (args.length < limits.min || args.length > limits.max) {
      throw new FormulaSyntaxError(`numero di argomenti errato per ${fn}`, nameToken.pos);
    }
    return { kind: 'call', fn: fn as FormulaFunction, args };
  }
}

/** Legge una formula. Gli errori riportano il messaggio e la posizione (da 0) nel testo. */
export function parseFormula(text: string): FormulaParseResult {
  if (text.trim() === '') return { ok: false, error: 'formula vuota', position: 0 };
  try {
    const parser = new Parser(tokenize(text));
    const ast = parser.parse();
    return { ok: true, ast, refs: Array.from(parser.refs) };
  } catch (err) {
    if (err instanceof FormulaSyntaxError)
      return { ok: false, error: err.message, position: err.position };
    throw err;
  }
}

/**
 * Valore di una formula. Un operando mancante o non finito, o una divisione per zero, dà null:
 * la cella resta vuota invece di mostrare un numero falso.
 */
export function evaluateFormula(
  node: FormulaNode,
  lookup: (name: string) => number | string | null | undefined,
): number | null {
  const value = (n: FormulaNode): number | null => {
    switch (n.kind) {
      case 'num':
        return n.value;
      case 'ref': {
        const v = lookup(n.name);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      }
      case 'neg': {
        const v = value(n.operand);
        return v === null ? null : -v;
      }
      case 'bin': {
        const l = value(n.left);
        const r = value(n.right);
        if (l === null || r === null) return null;
        let out: number;
        if (n.op === '+') out = l + r;
        else if (n.op === '-') out = l - r;
        else if (n.op === '*') out = l * r;
        else {
          if (r === 0) return null;
          out = l / r;
        }
        return Number.isFinite(out) ? out : null;
      }
      case 'call': {
        const args = n.args.map(value);
        if (args.some(a => a === null)) return null;
        const nums = args as number[];
        switch (n.fn) {
          case 'abs':
            return Math.abs(nums[0]);
          case 'min':
            return Math.min(...nums);
          case 'max':
            return Math.max(...nums);
          case 'round': {
            const decimals = nums.length > 1 ? Math.max(0, Math.floor(nums[1])) : 0;
            const factor = 10 ** decimals;
            return Math.round(nums[0] * factor) / factor;
          }
        }
      }
    }
    return null;
  };
  return value(node);
}
