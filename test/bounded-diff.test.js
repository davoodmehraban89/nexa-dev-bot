import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildUnifiedDiff } from '../src/core/workspace-policy.js';

// Independent legacy oracle: small fixtures only, never editor-sized matrices.
function legacyDiff(before, after, maxChars = 10000) {
  const a = before.split('\n');
  const b = after.split('\n');
  const table = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const output = ['--- a/file', '+++ b/file', '@@'];
  let additions = 0;
  let deletions = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      output.push(` ${a[i++]}`);
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || table[i][j + 1] >= table[i + 1][j])
    ) {
      output.push(`+${b[j++]}`);
      additions += 1;
    } else {
      output.push(`-${a[i++]}`);
      deletions += 1;
    }
  }
  const raw = output.join('\n');
  const truncated = raw.length > maxChars;
  return {
    text: truncated ? `${raw.slice(0, maxChars - 2)}\n…` : raw,
    additions,
    deletions,
    truncated
  };
}

function runIsolated(body) {
  const moduleUrl = new URL('../src/core/workspace-policy.js', import.meta.url);
  const script = `
    import assert from 'node:assert/strict';
    import { buildUnifiedDiff, validateEditableFile } from ${JSON.stringify(moduleUrl.href)};
    // Reject dangerous allocations before allocating, so the RED regression
    // cannot reserve the old ~800 MiB matrix in either process.
    let allocatedBytes = 0;
    for (const name of ['Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array']) {
      const Original = globalThis[name];
      globalThis[name] = new Proxy(Original, {
        construct(target, args) {
          const bytes = Number(args[0]) * Original.BYTES_PER_ELEMENT;
          allocatedBytes += bytes;
          assert.ok(bytes <= 2 * 1024 * 1024, 'oversized diff allocation: ' + bytes);
          assert.ok(allocatedBytes <= 4 * 1024 * 1024, 'excessive diff allocations');
          return Reflect.construct(target, args);
        }
      });
    }
    ${body}
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      timeout: 5000,
      maxBuffer: 16384,
      encoding: 'utf8'
    }
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
}

test('editor-sized identical newline and separated sparse changes stay within a small memory budget', () => {
  runIsolated(`
    const identical = '\\n'.repeat(20000);
    assert.equal(validateEditableFile({ path: 'file', text: identical }).editable, true);
    const same = buildUnifiedDiff({ before: identical, after: identical, maxChars: 120 });
    assert.equal(same.additions, 0);
    assert.equal(same.deletions, 0);
    assert.equal(same.truncated, true);
    const lines = Array(19999).fill('');
    const before = lines.join('\\n');
    lines[5000] = 'x';
    lines[15000] = 'y';
    const after = lines.join('\\n');
    assert.equal(after.length, 20000);
    assert.equal(validateEditableFile({ path: 'file', text: after }).editable, true);
    const sparse = buildUnifiedDiff({ before, after, maxChars: 120 });
    assert.equal(sparse.additions, 2);
    assert.equal(sparse.deletions, 2);
    assert.equal(sparse.truncated, true);
    assert.ok(sparse.text.length <= 120);
  `);
});

test('large disjoint and repetitive edits fail explicitly before exhausting memory or work', () => {
  runIsolated(`
    const cases = [
      ['a\\n'.repeat(10000), 'b\\n'.repeat(10000)],
      ['a\\n'.repeat(5000) + 'b\\n'.repeat(5000), 'b\\n'.repeat(5000) + 'a\\n'.repeat(5000)]
    ];
    for (const [before, after] of cases) {
      assert.throws(() => buildUnifiedDiff({ before, after }), (error) => {
        assert.equal(error.code, 'DIFF_COMPLEXITY_LIMIT');
        assert.match(error.message, /smaller/i);
        return true;
      });
    }
  `);
});

test('large sparse edits exceeding the reconstruction budget fail without approximate counts', () => {
  runIsolated(`
    const lines = Array(19988).fill('');
    const before = lines.join('\\n');
    for (let i = 0; i < 13; i += 1) lines[1 + 1500 * i] = 'x';
    const after = lines.join('\\n');
    assert.equal(after.length, 20000);
    assert.throws(() => buildUnifiedDiff({ before, after }), {
      code: 'DIFF_COMPLEXITY_LIMIT'
    });
  `);
});

test('ordinary diffs preserve legacy insertion-first ties, exact counts and truncation', () => {
  let seed = 0x6e657861;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const alphabet = ['', 'a', 'b', 'c', '😀', '\r'];
  for (let fixture = 0; fixture < 500; fixture += 1) {
    const makeText = () =>
      Array.from(
        { length: random(24) + 1 },
        () => alphabet[random(alphabet.length)]
      ).join('\n');
    const before = makeText();
    const after = makeText();
    const maxChars = fixture % 2 ? 10000 : 32;
    assert.deepEqual(
      buildUnifiedDiff({ before, after, maxChars }),
      legacyDiff(before, after, maxChars),
      `fixture ${fixture}`
    );
  }
});

test('large sparse diffs retain canonical ties even in repeated common suffixes', () => {
  const cases = [
    [`a\n${Array(500).fill('b').join('\n')}`, Array(499).fill('b').join('\n')],
    [Array(500).fill('b').join('\n'), `a\n${Array(499).fill('b').join('\n')}`],
    [
      Array.from({ length: 500 }, (_, i) => `${i % 7}`).join('\n'),
      Array.from({ length: 500 }, (_, i) =>
        i === 100 || i === 400 ? 'x' : `${i % 7}`
      ).join('\n')
    ]
  ];
  for (const [before, after] of cases) {
    assert.deepEqual(
      buildUnifiedDiff({ before, after, maxChars: 10000 }),
      legacyDiff(before, after)
    );
  }
});

test('randomized large sparse diffs match the legacy oracle through band reconstruction', () => {
  let seed = 0xabcdef;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  for (let fixture = 0; fixture < 40; fixture += 1) {
    const beforeLines = Array.from({ length: 300 }, () => `${random(7)}`);
    const afterLines = [...beforeLines];
    for (let edit = 0; edit < 8; edit += 1) {
      const position = random(afterLines.length);
      const kind = random(3);
      if (kind === 0) afterLines.splice(position, 1);
      else if (kind === 1) afterLines.splice(position, 0, 'x');
      else afterLines[position] = 'x';
    }
    const before = beforeLines.join('\n');
    const after = afterLines.join('\n');
    assert.deepEqual(
      buildUnifiedDiff({ before, after, maxChars: 10000 }),
      legacyDiff(before, after),
      `band fixture ${fixture}`
    );
  }
});
