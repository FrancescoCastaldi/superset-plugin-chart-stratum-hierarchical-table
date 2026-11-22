import {
  applyAliases,
  ignoredMessage,
  ignoredPositions,
  jsonSyntaxMessage,
  listKey,
  parseList,
  serializeList,
  toNumberOrUndefined,
  withField,
} from '../src/plugin/controls/listModel';

describe('parseList', () => {
  it('legge testo JSON e array, vuoto significa nessuna riga', () => {
    expect(parseList('').rows).toEqual([]);
    expect(parseList(undefined).rows).toEqual([]);
    expect(parseList('[{"a":1}]').rows).toEqual([{ a: 1 }]);
    expect(parseList([{ a: 1 }]).rows).toEqual([{ a: 1 }]);
  });

  it('segnala sintassi non valida e valori che non sono elenchi', () => {
    expect(parseList('[{').syntaxError).toBeTruthy();
    expect(parseList('{"a":1}').syntaxError).toContain('elenco');
    expect(jsonSyntaxMessage('[{')).toMatch(/^JSON non valido/);
    expect(jsonSyntaxMessage('[]')).toBe(false);
    expect(jsonSyntaxMessage('')).toBe(false);
  });

  it('conta le voci che non sono oggetti', () => {
    const parsed = parseList('[{"a":1}, 4, "x", null, [1]]');
    expect(parsed.rows).toEqual([{ a: 1 }]);
    expect(parsed.invalidCount).toBe(4);
  });
});

describe('serializeList', () => {
  it('salva come array oppure come testo JSON, vuoto senza righe', () => {
    expect(serializeList([{ a: 1 }], 'array')).toEqual([{ a: 1 }]);
    expect(serializeList([], 'array')).toEqual([]);
    expect(serializeList([], 'json')).toBe('');
    expect(JSON.parse(serializeList([{ a: 1 }], 'json') as string)).toEqual([{ a: 1 }]);
  });

  it('listKey non dipende dal formato', () => {
    expect(listKey('[{"a":1}]')).toBe(listKey([{ a: 1 }]));
  });
});

describe('utilità dei campi', () => {
  it('toNumberOrUndefined accetta la virgola e rifiuta il resto', () => {
    expect(toNumberOrUndefined('12,5')).toBe(12.5);
    expect(toNumberOrUndefined(' 7 ')).toBe(7);
    expect(toNumberOrUndefined('')).toBeUndefined();
    expect(toNumberOrUndefined('abc')).toBeUndefined();
  });

  it('withField imposta e toglie i campi', () => {
    expect(withField({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 });
    expect(withField({ a: 1, b: 2 }, 'b', '')).toEqual({ a: 1 });
    expect(withField({ a: 1, b: 2 }, 'b', undefined)).toEqual({ a: 1 });
    expect(withField({ a: 0 }, 'a', 0)).toEqual({ a: 0 });
  });

  it('applyAliases rinomina senza perdere altri campi né sovrascrivere', () => {
    expect(applyAliases({ metricKey: 'a', target: 1 }, { metricKey: 'metric' })).toEqual({ metric: 'a', target: 1 });
    expect(applyAliases({ metricKey: 'a', metric: 'b' }, { metricKey: 'metric' })).toEqual({ metric: 'b' });
  });

  it('segnala le voci ignorate con la loro posizione', () => {
    const normalize = (entries: unknown[]) => entries.filter((e: any) => e.ok);
    expect(ignoredPositions([{ ok: 1 }, {}, { ok: 1 }, {}], normalize)).toEqual([2, 4]);
    expect(ignoredMessage([])).toBeNull();
    expect(ignoredMessage([2])).toContain('La voce 2 verrà ignorata');
    expect(ignoredMessage([2, 4])).toContain('Le voci 2, 4 verranno ignorate');
  });
});
