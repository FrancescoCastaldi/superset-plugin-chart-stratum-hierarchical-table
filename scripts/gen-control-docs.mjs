// Rigenera docs/control_panel_reference.md dalla configurazione del pannello (via Jest, che sa leggere il TypeScript).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jest = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
const result = spawnSync(process.execPath, [jest, '--preset=ts-jest', '--ci', 'test/controlDocs.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_DOCS: '1' },
});
process.exit(result.status ?? 1);
