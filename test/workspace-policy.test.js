import test from 'node:test';
import assert from 'node:assert/strict';

let policy = {};
try {
  policy = await import('../src/core/workspace-policy.js');
} catch {
  policy = {};
}

const requireFn = name => {
  assert.equal(typeof policy[name], 'function', `${name} must be implemented`);
  return policy[name];
};

test('editable file policy accepts bounded UTF-8 text', () => {
  const validateEditableFile = requireFn('validateEditableFile');
  const result = validateEditableFile({ path: 'src/app.js', text: 'export const ok = true;\n' });
  assert.deepEqual(result, {
    editable: true,
    reason: '',
    text: 'export const ok = true;\n',
    charLength: 24,
    byteLength: 24
  });
});

test('editable file policy rejects sensitive paths binary markers LFS and both size ceilings', () => {
  const validateEditableFile = requireFn('validateEditableFile');
  for (const path of ['.env', '.env.production', 'keys/id_rsa', 'id_ed25519', 'tls/cert.pem', 'tls/private.key', 'a.p12', 'a.pfx', 'credentials.json', 'service-account-prod.json']) {
    const result = validateEditableFile({ path, text: 'safe-looking text' });
    assert.equal(result.editable, false, path);
    assert.match(result.reason, /sensitive/i);
  }

  const binary = validateEditableFile({ path: 'data.txt', text: 'abc\0def' });
  assert.equal(binary.editable, false);
  assert.match(binary.reason, /binary/i);

  const lfs = validateEditableFile({ path: 'asset.txt', text: 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n' });
  assert.equal(lfs.editable, false);
  assert.match(lfs.reason, /LFS/i);

  const tooManyChars = validateEditableFile({ path: 'large.txt', text: 'a'.repeat(20001) });
  assert.equal(tooManyChars.editable, false);
  assert.match(tooManyChars.reason, /20,000|20000/);

  const explicitTooManyBytes = validateEditableFile({ path: 'large.txt', text: 'ok', byteLength: 65537 });
  assert.equal(explicitTooManyBytes.editable, false);
  assert.match(explicitTooManyBytes.reason, /65,536|65536/);
});

test('editable file policy enforces multibyte UTF-8 byte boundary independently from character boundary', () => {
  const validateEditableFile = requireFn('validateEditableFile');
  const exact = '😀'.repeat(16384);
  const exactResult = validateEditableFile({ path: 'emoji.txt', text: exact });
  assert.equal(exactResult.charLength, 16384);
  assert.equal(exactResult.byteLength, 65536);
  assert.equal(exactResult.editable, true);

  const over = `${exact}a`;
  const overResult = validateEditableFile({ path: 'emoji.txt', text: over });
  assert.equal(overResult.charLength, 16385);
  assert.equal(overResult.byteLength, 65537);
  assert.equal(overResult.editable, false);
  assert.match(overResult.reason, /65,536|65536/);
});

test('commit message and target branch normalization fail closed on empty or unsafe values', () => {
  const normalizeCommitMessage = requireFn('normalizeCommitMessage');
  const makeTargetBranch = requireFn('makeTargetBranch');

  assert.equal(normalizeCommitMessage('  test: verify mobile editor  '), 'test: verify mobile editor');
  assert.throws(() => normalizeCommitMessage('   '), /commit message/i);
  assert.throws(() => normalizeCommitMessage('x'.repeat(121)), /120/);

  assert.equal(makeTargetBranch('Ab3_-xYz09'), 'nexa/edit-Ab3_-xYz09');
  assert.throws(() => makeTargetBranch('../bad'), /workspace/i);
  assert.throws(() => makeTargetBranch('short'), /workspace/i);
});

test('unified diff reports exact additions deletions and marks bounded truncation without changing counts', () => {
  const buildUnifiedDiff = requireFn('buildUnifiedDiff');
  const before = 'alpha\nbeta\ngamma\n';
  const after = 'alpha\nBETA\ngamma\ndelta\n';
  const full = buildUnifiedDiff({ path: 'src/app.js', before, after, maxChars: 2600 });
  assert.equal(full.additions, 2);
  assert.equal(full.deletions, 1);
  assert.equal(full.truncated, false);
  assert.match(full.text, /--- a\/src\/app\.js/);
  assert.match(full.text, /\+\+\+ b\/src\/app\.js/);
  assert.match(full.text, /-beta/);
  assert.match(full.text, /\+BETA/);
  assert.match(full.text, /\+delta/);

  const bounded = buildUnifiedDiff({
    path: 'src/app.js',
    before: Array.from({ length: 250 }, (_, i) => `old-${i}`).join('\n'),
    after: Array.from({ length: 250 }, (_, i) => `new-${i}`).join('\n'),
    maxChars: 120
  });
  assert.equal(bounded.additions, 250);
  assert.equal(bounded.deletions, 250);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.text.length <= 120);
});

test('digestText is stable for identical content and changes with content', async () => {
  const digestText = requireFn('digestText');
  const first = await digestText('hello');
  const second = await digestText('hello');
  const changed = await digestText('hello!');
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, changed);
});
