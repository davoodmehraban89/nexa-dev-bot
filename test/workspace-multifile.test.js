import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkspaceFiles, buildWorkspaceDiff, digestWorkspaceFiles } from '../src/core/workspace-policy.js';

const file = (path, originalText, draftText = originalText) => ({
  path,
  blobSha: 'a'.repeat(40),
  originalText,
  originalDigest: 'b'.repeat(64),
  draftText,
  draftDigest: 'c'.repeat(64)
});

test('multi-file workspace policy accepts a bounded unique file set', () => {
  const result = validateWorkspaceFiles([
    file('README.md', 'before\n', 'after\n'),
    file('src/app.js', 'export const a = 1;\n', 'export const a = 2;\n')
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.files.length, 2);
  assert.ok(result.totalBytes > 0);
});

test('multi-file workspace rejects duplicate and sensitive paths and aggregate overflow', () => {
  assert.throws(() => validateWorkspaceFiles([file('a.txt', 'x'), file('a.txt', 'y')]), /duplicate/i);
  assert.throws(() => validateWorkspaceFiles([file('.env', 'x')]), /sensitive/i);
  assert.throws(() => validateWorkspaceFiles([
    file('a.txt', 'a'.repeat(65536)),
    file('b.txt', 'b'.repeat(65536)),
    file('c.txt', 'c')
  ]), /aggregate|131,072|131072/i);
});

test('aggregate diff preserves per-file identity and exact total counts', () => {
  const diff = buildWorkspaceDiff({
    files: [
      file('a.txt', 'one\ntwo\n', 'one\nTWO\n'),
      file('b.txt', 'x\n', 'x\ny\n')
    ],
    maxChars: 2600
  });
  assert.equal(diff.filesChanged, 2);
  assert.equal(diff.additions, 3);
  assert.equal(diff.deletions, 1);
  assert.match(diff.text, /a\/a\.txt/);
  assert.match(diff.text, /a\/b\.txt/);
});

test('workspace material digest is order-independent but changes with material', async () => {
  const a = file('a.txt', 'x', 'y');
  const b = file('b.txt', 'm', 'n');
  const first = await digestWorkspaceFiles([a, b]);
  const reordered = await digestWorkspaceFiles([b, a]);
  const changed = await digestWorkspaceFiles([a, { ...b, draftText: 'changed' }]);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});
