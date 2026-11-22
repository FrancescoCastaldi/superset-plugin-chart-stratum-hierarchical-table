jest.mock('@superset-ui/core', () => ({
  ensureIsArray: (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]),
  getNumberFormatter: (fmt: string) => (val: number) => `${fmt}(${val})`,
}));

import fs from 'node:fs';
import path from 'node:path';
import controlPanel from '../src/plugin/controlPanel';

const DOC = path.join(__dirname, '../docs/control_panel_reference.md');

const cell = (text: unknown): string => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function typeName(type: unknown): string {
  if (typeof type === 'function') return type.name || 'Controllo personalizzato';
  return String(type ?? '');
}

function defaultText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value === '' ? '(vuoto)' : value;
  return JSON.stringify(value);
}

/** Riferimento dei controlli, scritto a partire dalla configurazione del pannello. */
export function buildControlReference(): string {
  const lines: string[] = [
    '# Riferimento dei controlli del pannello Explore',
    '',
    'Elenco di tutti i controlli di StratumTree, in ordine di comparsa. Il file è generato dalla',
    'configurazione del pannello: non va modificato a mano. Per aggiornarlo si usa `npm run docs`.',
    '',
  ];
  for (const section of controlPanel.controlPanelSections as any[]) {
    lines.push(`## ${section.label}`, '', section.description ?? '', '');
    lines.push('| Controllo | Etichetta | Tipo | Predefinito | Descrizione |', '| --- | --- | --- | --- | --- |');
    for (const item of (section.controlSetRows as unknown[][]).flat()) {
      if (!item || typeof item !== 'object' || !('config' in (item as object))) continue;
      const { name, config } = item as { name: string; config: Record<string, any> };
      lines.push(
        `| \`${name}\` | ${cell(config.label)} | ${cell(typeName(config.type))} | ${cell(defaultText(config.default))} | ${cell(config.description)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

describe('riferimento dei controlli', () => {
  it('docs/control_panel_reference.md è aggiornato (npm run docs lo rigenera)', () => {
    const expected = buildControlReference();
    if (process.env.UPDATE_DOCS) {
      fs.writeFileSync(DOC, expected, 'utf8');
      return;
    }
    const current = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n') : '';
    expect(current).toBe(expected);
  });
});
