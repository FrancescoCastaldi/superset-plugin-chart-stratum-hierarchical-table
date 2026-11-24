import { evaluateFormula, parseFormula } from '../src/utils/formulaEngine';

const values: Record<string, number> = { ricavi: 1000, costi: 700, sconto: 0, importo: 4 };
const lookup = (name: string) => values[name];

function run(text: string, scope = lookup): number | null {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`formula non valida: ${parsed.error} (pos ${parsed.position})`);
  return evaluateFormula(parsed.ast, scope);
}

describe('parseFormula', () => {
  it('raccoglie i riferimenti una sola volta, anche tra parentesi quadre', () => {
    const parsed = parseFormula('([ricavi] - costi) / ricavi * 100 + [SUM(importo)]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.refs.sort()).toEqual(['SUM(importo)', 'costi', 'ricavi']);
  });

  it('segnala errori con la posizione nel testo', () => {
    const parsed = parseFormula('ricavi + * 2');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.position).toBe(9);
  });

  it('rifiuta formule vuote, parentesi non chiuse e caratteri non ammessi', () => {
    expect(parseFormula('   ').ok).toBe(false);
    expect(parseFormula('(ricavi + 1').ok).toBe(false);
    expect(parseFormula('ricavi ; 2').ok).toBe(false);
    expect(parseFormula('[ricavi').ok).toBe(false);
  });

  it('rifiuta funzioni sconosciute e numero di argomenti errato', () => {
    expect(parseFormula('sqrt(ricavi)').ok).toBe(false);
    expect(parseFormula('abs(1, 2)').ok).toBe(false);
    expect(parseFormula('round()').ok).toBe(false);
    expect(parseFormula('round(ricavi, 2)').ok).toBe(true);
  });

  it('rifiuta numeri con più punti decimali', () => {
    expect(parseFormula('1.2.3 + 1').ok).toBe(false);
  });
});

describe('evaluateFormula', () => {
  it('rispetta precedenza e parentesi', () => {
    expect(run('2 + 3 * 4')).toBe(14);
    expect(run('(2 + 3) * 4')).toBe(20);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('8 / 4 / 2')).toBe(1);
  });

  it('calcola un margine percentuale dai riferimenti', () => {
    expect(run('(ricavi - costi) / ricavi * 100')).toBeCloseTo(30);
  });

  it('gestisce il meno unario', () => {
    expect(run('-ricavi + 1')).toBe(-999);
    expect(run('2 * -3')).toBe(-6);
    expect(run('- -4')).toBe(4);
  });

  it('applica le funzioni abs, min, max e round', () => {
    expect(run('abs(costi - ricavi)')).toBe(300);
    expect(run('min(ricavi, costi, 900)')).toBe(700);
    expect(run('max(1, ricavi)')).toBe(1000);
    expect(run('round(2 / 3, 2)')).toBeCloseTo(0.67);
    expect(run('round(2.5)')).toBe(3);
  });

  it('dà null quando un operando manca o non è un numero', () => {
    expect(run('ricavi + assente')).toBeNull();
    expect(run('ricavi + 1', name => (name === 'ricavi' ? 'testo' : 1))).toBeNull();
    expect(run('ricavi + 1', () => null)).toBeNull();
  });

  it('dà null per divisione per zero, invece di Infinity', () => {
    expect(run('ricavi / sconto')).toBeNull();
    expect(run('ricavi / (costi - 700)')).toBeNull();
  });

  it('dà null se una funzione riceve un operando mancante', () => {
    expect(run('abs(assente)')).toBeNull();
    expect(run('max(ricavi, assente)')).toBeNull();
  });
});
