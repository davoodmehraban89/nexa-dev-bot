import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Phase 2 acceptance docs lock the multi-file safety contract', async () => {
  const [readme, runbook, acceptance] = await Promise.all([
    read('README.md'),
    read('docs/OPERATIONS_RUNBOOK.md'),
    read('docs/PHASE2_MULTIFILE_ACCEPTANCE.md')
  ]);
  const docs = `${readme}\n${runbook}\n${acceptance}`;
  for (const phrase of [
    'multi-file Change Set',
    'nexa/edit-*',
    'exact base SHA',
    'Safe Approval',
    'Kill Switch',
    'single-file compatibility'
  ]) {
    assert.match(
      docs,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `missing acceptance phrase: ${phrase}`
    );
  }
  assert.match(
    docs,
    /no direct [`]?main[`]? mutation|main.*never.*mutat|direct.*main.*prohibit/i
  );
  for (const evidence of ['CI', 'deploy', 'Runtime', 'Owner-device'])
    assert.match(acceptance, new RegExp(evidence, 'i'));
  assert.match(acceptance, /merge SHA/i);
});
