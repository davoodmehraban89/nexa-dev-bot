const MAX_CHARS = 20000;
const MAX_BYTES = 65536;
const MAX_COMMIT_MESSAGE = 120;
const MAX_WORKSPACE_FILES = 8;
const MAX_WORKSPACE_BYTES = 131072;
const SAFE_HANDLE = /^[A-Za-z0-9_-]{10}$/;

export const WORKSPACE_EDITOR_LIMITS = Object.freeze({
  maxChars: MAX_CHARS,
  maxBytes: MAX_BYTES,
  maxFiles: MAX_WORKSPACE_FILES,
  maxAggregateBytes: MAX_WORKSPACE_BYTES
});

const encoder = new TextEncoder();

const sensitivePath = (value) => {
  const path = String(value || '')
    .replaceAll('\\', '/')
    .toLowerCase();
  const name = path.split('/').pop() || '';
  if (name === '.env' || name.startsWith('.env.')) return true;
  if (name === 'id_rsa' || name === 'id_ed25519') return true;
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;
  if (name === 'credentials.json') return true;
  if (/^service-account.*\.json$/i.test(name)) return true;
  return false;
};

const codePointLength = (value) => Array.from(value).length;

export function validateEditableFile({ path, text, byteLength } = {}) {
  const source = String(text ?? '');
  const charLength = codePointLength(source);
  const computedBytes = encoder.encode(source).byteLength;
  const providerBytes = Number(byteLength);
  const effectiveBytes =
    Number.isFinite(providerBytes) && providerBytes >= 0
      ? Math.max(computedBytes, providerBytes)
      : computedBytes;

  let reason = '';
  if (sensitivePath(path)) reason = 'Sensitive file path is not editable.';
  else if (source.includes('\0'))
    reason = 'Binary-like content is not editable.';
  else if (
    /^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/.test(source)
  )
    reason = 'Git LFS pointer files are not editable.';
  else if (charLength > MAX_CHARS)
    reason = `Editable text is limited to ${MAX_CHARS.toLocaleString('en-US')} Unicode characters.`;
  else if (effectiveBytes > MAX_BYTES)
    reason = `Editable text is limited to ${MAX_BYTES.toLocaleString('en-US')} UTF-8 bytes.`;

  return {
    editable: reason === '',
    reason,
    text: source,
    charLength,
    byteLength: effectiveBytes
  };
}

export function normalizeCommitMessage(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) throw new Error('Commit message is required');
  if (codePointLength(normalized) > MAX_COMMIT_MESSAGE) {
    throw new Error('Commit message must be 120 characters or fewer');
  }
  return normalized;
}

export function makeTargetBranch(workspaceId) {
  const id = String(workspaceId ?? '');
  if (!SAFE_HANDLE.test(id))
    throw new Error('Workspace ID must be a 10-character URL-safe handle');
  return `nexa/edit-${id}`;
}

export async function digestText(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(String(value ?? ''))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function linesOf(value) {
  return String(value ?? '').split('\n');
}

function smallDiffOperations(beforeLines, afterLines) {
  const rows = beforeLines.length + 1;
  const cols = afterLines.length + 1;
  const table = new Uint16Array(rows * cols);
  const at = (i, j) => i * cols + j;

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[at(i, j)] =
        beforeLines[i] === afterLines[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    if (
      i < beforeLines.length &&
      j < afterLines.length &&
      beforeLines[i] === afterLines[j]
    ) {
      operations.push({ kind: ' ', line: beforeLines[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (
      j < afterLines.length &&
      (i >= beforeLines.length || table[at(i, j + 1)] >= table[at(i + 1, j)])
    ) {
      operations.push({ kind: '+', line: afterLines[j] });
      j += 1;
      continue;
    }
    operations.push({ kind: '-', line: beforeLines[i] });
    i += 1;
  }
  return operations;
}

function diffOperations(beforeLines, afterLines) {
  // Ordinary edits retain the original insertion-first LCS reconstruction.
  // Larger edits use a fixed-distance band: memory is linear in line count,
  // with explicit storage/work limits rather than a quadratic allocation.
  const maxTableCells = 65536;
  const maxDistance = 64;
  const maxBandCells = 1000000;
  let workRemaining = 2000000;
  const tooComplex = () => {
    const error = new Error(
      'This edit is too complex to preview safely. Split it into smaller changes and try again.'
    );
    error.code = 'DIFF_COMPLEXITY_LIMIT';
    return error;
  };
  const spend = (work = 1) => {
    workRemaining -= work;
    if (workRemaining < 0) throw tooComplex();
  };
  if (beforeLines.length > MAX_CHARS + 1 || afterLines.length > MAX_CHARS + 1) {
    throw tooComplex();
  }
  if ((beforeLines.length + 1) * (afterLines.length + 1) <= maxTableCells) {
    return smallDiffOperations(beforeLines, afterLines);
  }

  const operations = [];
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    spend();
    operations.push({ kind: ' ', line: beforeLines[prefix++] });
  }
  const n = beforeLines.length - prefix;
  const m = afterLines.length - prefix;
  if (n === 0 || m === 0) {
    for (let i = 0; i < n; i += 1) {
      operations.push({ kind: '-', line: beforeLines[prefix + i] });
    }
    for (let j = 0; j < m; j += 1) {
      operations.push({ kind: '+', line: afterLines[prefix + j] });
    }
    return operations;
  }

  // Trim suffixes only while measuring distance. Reconstructing against the
  // full suffix preserves legacy ties when the suffix contains repeated lines.
  let suffix = 0;
  while (
    suffix < n &&
    suffix < m &&
    beforeLines[beforeLines.length - suffix - 1] ===
      afterLines[afterLines.length - suffix - 1]
  ) {
    spend();
    suffix += 1;
  }
  const distanceN = n - suffix;
  const distanceM = m - suffix;
  if (Math.abs(distanceN - distanceM) > maxDistance) throw tooComplex();
  const offset = maxDistance + 1;
  const frontier = new Int32Array(2 * maxDistance + 3);
  frontier.fill(-1);
  frontier[offset + 1] = 0;
  let distance = -1;
  search: for (let d = 0; d <= maxDistance; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      spend();
      const slot = offset + k;
      let x =
        k === -d || (k !== d && frontier[slot - 1] < frontier[slot + 1])
          ? frontier[slot + 1]
          : frontier[slot - 1] + 1;
      let y = x - k;
      while (
        x < distanceN &&
        y < distanceM &&
        beforeLines[prefix + x] === afterLines[prefix + y]
      ) {
        spend();
        x += 1;
        y += 1;
      }
      frontier[slot] = x;
      if (x >= distanceN && y >= distanceM) {
        distance = d;
        break search;
      }
    }
  }
  if (distance < 0) throw tooComplex();

  // Every optimal path of edit distance D stays inside |i - j| <= D.
  // Capped suffix distances in this band reconstruct the exact legacy path,
  // including its preference for insertion when both choices are optimal.
  const width = 2 * distance + 1;
  const cells = (n + 1) * width;
  if (cells > maxBandCells) throw tooComplex();
  spend(cells);
  const unreachable = maxDistance + 1;
  const table = new Uint8Array(cells);
  table.fill(unreachable);
  const at = (i, j) => i * width + j - i + distance;
  const score = (i, j) =>
    i > n || j > m || Math.abs(i - j) > distance
      ? unreachable
      : table[at(i, j)];
  for (let i = n; i >= 0; i -= 1) {
    for (
      let j = Math.min(m, i + distance);
      j >= Math.max(0, i - distance);
      j -= 1
    ) {
      spend();
      const value =
        i === n
          ? m - j
          : j === m
            ? n - i
            : beforeLines[prefix + i] === afterLines[prefix + j]
              ? score(i + 1, j + 1)
              : Math.min(score(i + 1, j), score(i, j + 1)) + 1;
      table[at(i, j)] = Math.min(unreachable, value);
    }
  }
  if (score(0, 0) !== distance) throw tooComplex();
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    spend();
    if (i < n && j < m && beforeLines[prefix + i] === afterLines[prefix + j]) {
      operations.push({ kind: ' ', line: beforeLines[prefix + i++] });
      j += 1;
    } else if (j < m && (i === n || score(i, j + 1) <= score(i + 1, j))) {
      operations.push({ kind: '+', line: afterLines[prefix + j++] });
    } else {
      operations.push({ kind: '-', line: beforeLines[prefix + i++] });
    }
  }
  return operations;
}

export function buildUnifiedDiff({
  path,
  before,
  after,
  maxChars = 2600
} = {}) {
  const safePath = String(path || 'file').replace(/[\r\n]/g, '');
  const operations = diffOperations(linesOf(before), linesOf(after));
  const additions = operations.reduce(
    (count, op) => count + (op.kind === '+' ? 1 : 0),
    0
  );
  const deletions = operations.reduce(
    (count, op) => count + (op.kind === '-' ? 1 : 0),
    0
  );
  const raw = [
    `--- a/${safePath}`,
    `+++ b/${safePath}`,
    '@@',
    ...operations.map((op) => `${op.kind}${op.line}`)
  ].join('\n');

  const limit = Math.max(32, Math.min(10000, Number(maxChars) || 2600));
  if (raw.length <= limit) {
    return { text: raw, additions, deletions, truncated: false };
  }
  const marker = '\n…';
  return {
    text: `${raw.slice(0, Math.max(0, limit - marker.length))}${marker}`,
    additions,
    deletions,
    truncated: true
  };
}

export function validateWorkspaceFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0)
    throw new Error('Workspace files are required');
  if (files.length > MAX_WORKSPACE_FILES)
    throw new Error(`Workspace is limited to ${MAX_WORKSPACE_FILES} files`);
  const seen = new Set();
  let totalBytes = 0;
  const normalized = files.map((source) => {
    const path = String(source?.path || '').replaceAll('\\', '/');
    if (!path) throw new Error('Workspace file path is required');
    if (seen.has(path)) throw new Error(`Duplicate workspace path: ${path}`);
    seen.add(path);
    const original = validateEditableFile({
      path,
      text: source?.originalText ?? ''
    });
    if (!original.editable) throw new Error(original.reason);
    const draft = validateEditableFile({
      path,
      text: source?.draftText ?? source?.originalText ?? ''
    });
    if (!draft.editable) throw new Error(draft.reason);
    totalBytes += Math.max(original.byteLength, draft.byteLength);
    return {
      ...source,
      path,
      originalText: original.text,
      draftText: draft.text
    };
  });
  if (totalBytes > MAX_WORKSPACE_BYTES) {
    throw new Error(
      'Workspace aggregate text is limited to 131,072 UTF-8 bytes'
    );
  }
  return { valid: true, files: normalized, totalBytes };
}

export function buildWorkspaceDiff({ files = [], maxChars = 3000 } = {}) {
  const validated = validateWorkspaceFiles(files);
  const changed = [];
  let additions = 0;
  let deletions = 0;
  for (const file of validated.files) {
    if (file.originalText === file.draftText) continue;
    const diff = buildUnifiedDiff({
      path: file.path,
      before: file.originalText,
      after: file.draftText,
      maxChars: 10000
    });
    additions += diff.additions;
    deletions += diff.deletions;
    changed.push(diff.text);
  }
  const raw = changed.join('\n\n');
  const limit = Math.max(32, Math.min(10000, Number(maxChars) || 3000));
  const marker = '\n…';
  const truncated = raw.length > limit;
  const text = truncated
    ? `${raw.slice(0, Math.max(0, limit - marker.length))}${marker}`
    : raw;
  return {
    text,
    additions,
    deletions,
    filesChanged: changed.length,
    truncated
  };
}

export async function digestWorkspaceFiles(files = []) {
  const validated = validateWorkspaceFiles(files);
  const canonical = validated.files
    .map((file) => ({
      path: file.path,
      blobSha: String(file.blobSha || ''),
      originalDigest: String(file.originalDigest || ''),
      draftText: file.draftText,
      draftDigest: String(file.draftDigest || '')
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return digestText(JSON.stringify(canonical));
}
