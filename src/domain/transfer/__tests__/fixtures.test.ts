import { readFileSync } from 'fs';
import { join } from 'path';

import { parseImport } from '../importJson';

const fx = (name: string) => readFileSync(join(__dirname, '../../../../e2e/fixtures', name), 'utf8');

describe('E2E JSON fixtures', () => {
  it.each(['export_v1_basic.json', 'export_v1_conflicts.json', 'export_v1_local_only.json'])('%s is a valid export', (name) => {
    expect(parseImport(fx(name)).ok).toBe(true);
  });
  it.each(['export_invalid_format.json', 'export_invalid_schema.json'])('%s is rejected', (name) => {
    expect(parseImport(fx(name)).ok).toBe(false);
  });
});
