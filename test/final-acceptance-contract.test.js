import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('final acceptance docs describe production-accepted workspace and exhaustive menu/security gates', () => {
  const memory = read('PROJECT_MEMORY.md');
  const readme = read('README.md');
  assert.match(memory, /Repository Workspace.*PRODUCTION ACCEPTED/i);
  assert.match(memory, /Telegram Menu.*(COMPLETE|ACCEPTED)/i);
  assert.match(memory, /Security Hardening.*(COMPLETE|ACCEPTED)/i);
  assert.match(readme, /public \/status.*minimal/i);
  assert.match(readme, /Safe Approval/i);
  assert.match(readme, /nexa\/edit-/i);
});

test('production acceptance keeps Telegram and security invariants documented', () => {
  const memory = read('PROJECT_MEMORY.md');
  assert.match(memory, /4096/);
  assert.match(memory, /64.*byte/i);
  assert.match(memory, /owner-only/i);
  assert.match(memory, /replay/i);
  assert.match(memory, /main.*unchanged/i);
});
