import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('final acceptance record closes workspace, exhaustive menu and security gates', () => {
  const acceptance = read('docs/FINAL_ACCEPTANCE_V2_1.md');
  const readme = read('README.md');
  assert.match(acceptance, /Repository Workspace.*PRODUCTION ACCEPTED/is);
  assert.match(acceptance, /Telegram Menu Audit.*COMPLETE/is);
  assert.match(acceptance, /Security Hardening.*COMPLETE/is);
  assert.match(readme, /GET \/status.*حداقلی/i);
  assert.match(readme, /Safe Approval/i);
  assert.match(readme, /nexa\/edit-/i);
});

test('production acceptance keeps Telegram and security invariants documented', () => {
  const acceptance = read('docs/FINAL_ACCEPTANCE_V2_1.md');
  assert.match(acceptance, /4096/);
  assert.match(acceptance, /64 UTF-8 bytes/i);
  assert.match(acceptance, /owner-only/i);
  assert.match(acceptance, /replay/i);
  assert.match(acceptance, /`main` unchanged/i);
  assert.match(acceptance, /public `\/status` remains minimal health-only/i);
});
