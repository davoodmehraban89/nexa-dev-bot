import { WORKSPACE_EDITOR_LIMITS } from '../core/workspace-policy.js';

const json = (payload, status = 200) => Response.json(payload, { status });
const HANDLE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const WORKSPACE_TTL_MS = 30 * 60_000,
  REF_TTL_MS = 15 * 60_000,
  COMMITTED_RETENTION_MS = 24 * 60 * 60_000;
const MAX_WORKSPACE_BYTES = 262144;
function randomHandle(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += HANDLE_ALPHABET[byte & 63];
  return out;
}
function finiteNow(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Date.now();
}
function positiveTtl(v, f) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : f;
}
function expired(r, now) {
  return Boolean(
    r && Number.isFinite(Number(r.expiresAt)) && Number(r.expiresAt) < now
  );
}
function normalizePath(value) {
  const path = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  if (
    !path ||
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Workspace file path is invalid');
  return path;
}
function fileRevision(file) {
  return Number.isSafeInteger(file?.revision) && file.revision >= 0
    ? file.revision
    : 0;
}
function nextRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER)
    throw new Error('Workspace file revision limit reached');
  return revision + 1;
}
function revisionConflict() {
  const error = new Error('Workspace file revision conflict');
  error.code = 'REVISION_CONFLICT';
  return error;
}
function assertExpectedRevision(payload, revision) {
  if (payload.expectedRevision === undefined) return;
  if (
    !Number.isSafeInteger(payload.expectedRevision) ||
    payload.expectedRevision < 0
  )
    throw new Error('Workspace file revision is invalid');
  if (payload.expectedRevision !== revision) throw revisionConflict();
}
function assertExpectedReview(expectedReview, workspace, proposed) {
  if (expectedReview === undefined) return;
  if (
    !expectedReview ||
    typeof expectedReview.baseHeadSha !== 'string' ||
    !Array.isArray(expectedReview.files)
  )
    throw new Error('Workspace review is invalid');
  const revisions = new Map();
  for (const file of expectedReview.files) {
    if (
      typeof file?.path !== 'string' ||
      !Number.isSafeInteger(file.revision) ||
      file.revision < 0 ||
      revisions.has(file.path)
    )
      throw new Error('Workspace review is invalid');
    revisions.set(file.path, file.revision);
  }
  if (
    expectedReview.baseHeadSha !== workspace.baseHeadSha ||
    (expectedReview.commitMessageDigest !== undefined &&
      expectedReview.commitMessageDigest !== workspace.commitMessageDigest) ||
    revisions.size !== workspace.files.length ||
    workspace.files.some(
      (file) => revisions.get(file.path) !== fileRevision(file)
    )
  )
    throw revisionConflict();
  if (
    expectedReview.commitMessageDigest !== undefined &&
    (proposed.workspaceId !== workspace.id ||
      Number(proposed.repoId) !== Number(workspace.repoId) ||
      proposed.baseBranch !== workspace.baseBranch ||
      proposed.baseHeadSha !== workspace.baseHeadSha ||
      proposed.baseTreeSha !== workspace.baseTreeSha ||
      proposed.commitMessageDigest !== workspace.commitMessageDigest ||
      !Array.isArray(proposed.files) ||
      proposed.files.length !== workspace.files.length ||
      workspace.files.some(
        (file, index) =>
          proposed.files[index]?.path !== file.path ||
          proposed.files[index]?.sourceBlobSha !== file.blobSha ||
          proposed.files[index]?.contentDigest !== file.draftDigest
      ))
  )
    throw revisionConflict();
}
function legacyFile(payload) {
  return {
    path: normalizePath(payload.path),
    blobSha: String(payload.blobSha || ''),
    originalText: String(payload.originalText ?? ''),
    originalDigest: String(payload.originalDigest || ''),
    draftText: String(payload.originalText ?? ''),
    draftDigest: String(payload.originalDigest || ''),
    revision: 0
  };
}
function migrate(ws) {
  if (!ws) return ws;
  if (Array.isArray(ws.files))
    return {
      ...ws,
      files: ws.files.map((file) => ({
        ...file,
        revision: fileRevision(file)
      }))
    };
  return {
    ...ws,
    schemaVersion: 2,
    files: [
      {
        path: String(ws.path || ''),
        blobSha: String(ws.blobSha || ''),
        originalText: String(ws.originalText ?? ''),
        originalDigest: String(ws.originalDigest || ''),
        draftText: String(ws.draftText ?? ws.originalText ?? ''),
        draftDigest: String(ws.draftDigest || ws.originalDigest || ''),
        revision: 0
      }
    ]
  };
}
function bytes(files) {
  return files.reduce(
    (n, f) =>
      n +
      new TextEncoder().encode(String(f.originalText ?? '')).length +
      new TextEncoder().encode(String(f.draftText ?? '')).length,
    0
  );
}
function validateFiles(files) {
  if (!Array.isArray(files) || !files.length)
    throw new Error('Workspace must contain at least one file');
  const seen = new Set();
  for (const f of files) {
    const p = normalizePath(f.path);
    if (seen.has(p)) throw new Error('Workspace file path already exists');
    seen.add(p);
  }
  if (bytes(files) > MAX_WORKSPACE_BYTES)
    throw new Error('Workspace aggregate size is too large');
  const encoder = new TextEncoder(),
    aggregateBytes = files.reduce(
      (total, file) =>
        total +
        Math.max(
          encoder.encode(String(file.originalText ?? '')).byteLength,
          encoder.encode(String(file.draftText ?? '')).byteLength
        ),
      0
    );
  if (
    files.length > WORKSPACE_EDITOR_LIMITS.maxFiles ||
    aggregateBytes > WORKSPACE_EDITOR_LIMITS.maxAggregateBytes
  ) {
    const error = new Error('Workspace aggregate text or file limit exceeded');
    error.code = 'WORKSPACE_LIMIT_EXCEEDED';
    throw error;
  }
}

export class WorkspaceStore {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST')
      return new Response('Not Found', { status: 404 });
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid workspace payload' }, 400);
    }
    const now = finiteNow(payload?.now);
    try {
      switch (url.pathname) {
        case '/refs/create':
          return json({ result: await this.#createRefs(payload, now) });
        case '/refs/get':
          return json({
            result: await this.#getExpiring(
              `ref:${String(payload.refId || '')}`,
              now
            )
          });
        case '/workspace/create':
          return json({ result: await this.#createWorkspace(payload, now) });
        case '/workspace/get':
          return json({
            result: migrate(
              await this.#getExpiring(
                `ws:${String(payload.workspaceId || '')}`,
                now
              )
            )
          });
        case '/workspace/draft':
          return json({ result: await this.#updateDraft(payload, now) });
        case '/workspace/file/upsert':
          return json({ result: await this.#upsertFile(payload, now) });
        case '/workspace/file/draft':
          return json({ result: await this.#updateFileDraft(payload, now) });
        case '/workspace/file/remove':
          return json({ result: await this.#removeFile(payload, now) });
        case '/workspace/message':
          return json({ result: await this.#setCommitMessage(payload, now) });
        case '/workspace/cancel':
          return json({ result: await this.#cancelWorkspace(payload) });
        case '/pending/set':
          return json({ result: await this.#setPending(payload, now) });
        case '/pending/get':
          return json({ result: await this.#getPending(now) });
        case '/pending/consume':
          return json({ result: await this.#consumePending(payload, now) });
        case '/intent/seal':
          return json({ result: await this.#sealIntent(payload, now) });
        case '/intent/get':
          return json({
            result: await this.#getExpiring(
              `intent:${String(payload.intentId || '')}`,
              now
            )
          });
        case '/intent/begin':
          return json({ result: await this.#beginCommit(payload, now) });
        case '/intent/candidate':
          return json({ result: await this.#setCandidate(payload, now) });
        case '/intent/complete':
          return json({ result: await this.#completeCommit(payload, now) });
        case '/intent/stale':
          return json({ result: await this.#markStale(payload, now) });
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      const status = {
        REVISION_CONFLICT: 409,
        WORKSPACE_NOT_EDITABLE: 409,
        WORKSPACE_LIMIT_EXCEEDED: 422
      }[error?.code];
      return json(
        {
          error: String(error?.message || 'Workspace store operation failed'),
          ...(status ? { code: error.code } : {})
        },
        status || 400
      );
    }
  }
  async #schedule(expiresAt) {
    const expiry = Number(expiresAt);
    if (!Number.isFinite(expiry)) return;
    const current = Number(await this.state.storage.get('__next_alarm'));
    if (!Number.isFinite(current) || expiry < current) {
      await this.state.storage.put('__next_alarm', expiry);
      await this.state.storage.setAlarm(expiry);
    }
  }
  async #getExpiring(key, now, storage = this.state.storage) {
    if (!key || key.endsWith(':')) return null;
    const record = await storage.get(key);
    if (!record) return null;
    if (expired(record, now)) {
      await storage.delete(key);
      return null;
    }
    return record;
  }
  async #createRefs(payload, now) {
    if (!Array.isArray(payload.refs))
      throw new Error('Navigation refs are required');
    const expiresAt = now + positiveTtl(payload.ttlMs, REF_TTL_MS),
      output = [];
    for (const source of payload.refs) {
      const refId = randomHandle(10),
        type = ['dir', 'file', 'workspace-add', 'workspace-file'].includes(
          source?.type
        )
          ? source.type
          : 'file',
        workspaceId = String(source?.workspaceId || '');
      if (
        type.startsWith('workspace-') &&
        !/^[A-Za-z0-9_-]{10}$/.test(workspaceId)
      )
        throw new Error('Workspace navigation ref is invalid');
      const record = {
        repoId: source?.repoId,
        path: String(source?.path || ''),
        type,
        sha: String(source?.sha || ''),
        ...(type.startsWith('workspace-') ? { workspaceId } : {}),
        expiresAt
      };
      await this.state.storage.put(`ref:${refId}`, record);
      output.push({ refId });
    }
    await this.#schedule(expiresAt);
    return output;
  }
  async #createWorkspace(payload, now) {
    const id = randomHandle(10),
      expiresAt = Number.isFinite(Number(payload.expiresAt))
        ? Number(payload.expiresAt)
        : now + WORKSPACE_TTL_MS;
    if (expiresAt <= now)
      throw new Error('Workspace expiry must be in the future');
    const first = legacyFile(payload);
    validateFiles([first]);
    const workspace = {
      id,
      schemaVersion: 2,
      repoId: payload.repoId,
      repoFullName: String(payload.repoFullName || ''),
      baseBranch: String(payload.baseBranch || ''),
      baseHeadSha: String(payload.baseHeadSha || ''),
      baseTreeSha: String(payload.baseTreeSha || ''),
      path: first.path,
      blobSha: first.blobSha,
      originalText: first.originalText,
      originalDigest: first.originalDigest,
      draftText: first.draftText,
      draftDigest: first.draftDigest,
      files: [first],
      commitMessage: '',
      commitMessageDigest: '',
      currentIntentId: null,
      state: 'DRAFT',
      createdAt: now,
      updatedAt: now,
      expiresAt
    };
    await this.state.storage.put(`ws:${id}`, workspace);
    await this.#schedule(expiresAt);
    return workspace;
  }
  async #requireWorkspace(id, now, storage = this.state.storage) {
    const ws = migrate(
      await this.#getExpiring(`ws:${String(id || '')}`, now, storage)
    );
    if (!ws) throw new Error('Workspace not found or expired');
    return ws;
  }
  async #requireEditableWorkspace(id, now, storage) {
    const workspace = await this.#requireWorkspace(id, now, storage);
    const intent = workspace.currentIntentId
      ? await storage.get(`intent:${workspace.currentIntentId}`)
      : null;
    if (
      [workspace.state, intent?.state].some((state) =>
        ['COMMITTING', 'COMMITTED'].includes(state)
      )
    ) {
      const error = new Error('Workspace is not editable');
      error.code = 'WORKSPACE_NOT_EDITABLE';
      throw error;
    }
    return workspace;
  }
  async #saveMaterial(ws, files, now, storage, materialChanged = true) {
    validateFiles(files);
    const primary = files[0];
    const updated = {
      ...ws,
      schemaVersion: 2,
      files,
      path: primary.path,
      blobSha: primary.blobSha,
      originalText: primary.originalText,
      originalDigest: primary.originalDigest,
      draftText: primary.draftText,
      draftDigest: primary.draftDigest,
      ...(materialChanged ? { currentIntentId: null, state: 'DRAFT' } : {}),
      updatedAt: now
    };
    await storage.put(`ws:${ws.id}`, updated);
    return updated;
  }
  async #upsertFile(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        source = payload.file || {},
        path = normalizePath(source.path);
      if (ws.files.some((f) => normalizePath(f.path) === path))
        throw new Error('Workspace file path already exists');
      const file = {
        path,
        blobSha: String(source.blobSha || ''),
        originalText: String(source.originalText ?? ''),
        originalDigest: String(source.originalDigest || ''),
        draftText: String(source.draftText ?? source.originalText ?? ''),
        draftDigest: String(source.draftDigest || source.originalDigest || ''),
        revision: fileRevision({ revision: ws.fileRevisionFloor })
      };
      return this.#saveMaterial(ws, [...ws.files, file], now, txn);
    });
  }
  async #updateFileDraft(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        path = normalizePath(payload.path),
        digest = String(payload.digest || '');
      if (!digest) throw new Error('Draft digest is required');
      const file = ws.files.find((f) => normalizePath(f.path) === path);
      if (!file) throw new Error('Workspace file not found');
      assertExpectedRevision(payload, fileRevision(file));
      const changed = file.draftDigest !== digest,
        files = ws.files.map((f) =>
          f === file
            ? {
                ...f,
                ...(changed
                  ? {
                      draftText: String(payload.text ?? ''),
                      draftDigest: digest
                    }
                  : {}),
                revision: nextRevision(fileRevision(f))
              }
            : f
        );
      return this.#saveMaterial(ws, files, now, txn, changed);
    });
  }
  async #removeFile(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        path = normalizePath(payload.path),
        files = ws.files.filter((f) => normalizePath(f.path) !== path);
      if (files.length === ws.files.length)
        throw new Error('Workspace file not found');
      // A scalar floor prevents stale revisions matching a removed/readded path.
      const fileRevisionFloor = nextRevision(
        Math.max(
          fileRevision({ revision: ws.fileRevisionFloor }),
          ...ws.files.map(fileRevision)
        )
      );
      return this.#saveMaterial({ ...ws, fileRevisionFloor }, files, now, txn);
    });
  }
  async #updateDraft(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        digest = String(payload.digest || '');
      if (!digest) throw new Error('Draft digest is required');
      const changed = digest !== ws.draftDigest,
        files = ws.files.map((f, i) =>
          i
            ? f
            : {
                ...f,
                ...(changed
                  ? {
                      draftText: String(payload.text ?? ''),
                      draftDigest: digest
                    }
                  : {}),
                revision: nextRevision(fileRevision(f))
              }
        );
      return this.#saveMaterial(ws, files, now, txn, changed);
    });
  }
  async #setCommitMessage(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        digest = String(payload.digest || '');
      if (!digest) throw new Error('Commit message digest is required');
      const changed = digest !== ws.commitMessageDigest,
        updated = {
          ...ws,
          commitMessage: String(payload.message || ''),
          commitMessageDigest: digest,
          updatedAt: now,
          ...(changed ? { currentIntentId: null, state: 'DRAFT' } : {})
        };
      await txn.put(`ws:${ws.id}`, updated);
      return updated;
    });
  }
  async #setPending(payload, now) {
    const ws = await this.#requireWorkspace(payload.workspaceId, now),
      mode = String(payload.mode || '');
    if (!['draft', 'draft_file', 'commit_message'].includes(mode))
      throw new Error('Pending input mode is invalid');
    const pending = { workspaceId: ws.id, mode, expiresAt: ws.expiresAt };
    await this.state.storage.put('pending', pending);
    await this.#schedule(pending.expiresAt);
    return pending;
  }
  async #getPending(now) {
    const p = await this.state.storage.get('pending');
    if (!p) return null;
    if (expired(p, now)) {
      await this.state.storage.delete('pending');
      return null;
    }
    const ws = await this.#getExpiring(`ws:${p.workspaceId}`, now);
    if (!ws) {
      await this.state.storage.delete('pending');
      return null;
    }
    return { workspaceId: p.workspaceId, mode: p.mode };
  }
  async #consumePending(payload, now) {
    return this.state.storage.transaction(async (txn) => {
      const p = await txn.get('pending');
      if (!p || expired(p, now)) {
        if (p) await txn.delete('pending');
        return false;
      }
      if (
        p.workspaceId !== String(payload.workspaceId || '') ||
        p.mode !== String(payload.mode || '')
      )
        return false;
      await txn.delete('pending');
      return true;
    });
  }
  async #sealIntent(payload, now) {
    const intent = await this.state.storage.transaction(async (txn) => {
      const ws = await this.#requireEditableWorkspace(
          payload.workspaceId,
          now,
          txn
        ),
        proposed =
          payload.intent && typeof payload.intent === 'object'
            ? payload.intent
            : null;
      if (!proposed?.intentDigest)
        throw new Error('Commit intent digest is required');
      assertExpectedReview(payload.expectedReview, ws, proposed);
      if (ws.currentIntentId) {
        const existing = await this.#getExpiring(
          `intent:${ws.currentIntentId}`,
          now,
          txn
        );
        if (existing?.intentDigest === proposed.intentDigest) return existing;
      }
      const id = randomHandle(8),
        created = {
          ...proposed,
          id,
          workspaceId: ws.id,
          state: 'READY',
          candidateCommitSha: null,
          commitSha: null,
          branch: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: ws.expiresAt
        };
      await txn.put(`intent:${id}`, created);
      await txn.put(`ws:${ws.id}`, {
        ...ws,
        currentIntentId: id,
        state: 'READY',
        updatedAt: now
      });
      return created;
    });
    await this.#schedule(intent.expiresAt);
    return intent;
  }
  async #beginCommit(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async (txn) => {
      const intent = await txn.get(key);
      if (!intent || expired(intent, now))
        throw new Error('Commit intent not found or expired');
      if (intent.state === 'COMMITTED')
        return { disposition: 'committed', intent };
      if (intent.state === 'COMMITTING')
        return { disposition: 'resume', intent };
      if (intent.state !== 'READY')
        throw new Error(`Commit intent is ${intent.state || 'invalid'}`);
      const updated = { ...intent, state: 'COMMITTING', updatedAt: now };
      await txn.put(key, updated);
      return { disposition: 'start', intent: updated };
    });
  }
  async #setCandidate(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async (txn) => {
      const intent = await txn.get(key);
      if (!intent || expired(intent, now))
        throw new Error('Commit intent not found or expired');
      if (intent.state === 'COMMITTED') return intent;
      if (intent.state !== 'COMMITTING')
        throw new Error('Commit intent is not committing');
      const updated = {
        ...intent,
        candidateCommitSha: String(payload.commitSha || ''),
        updatedAt: now
      };
      await txn.put(key, updated);
      return updated;
    });
  }
  async #completeCommit(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`,
      retainedUntil = now + COMMITTED_RETENTION_MS;
    const completed = await this.state.storage.transaction(async (txn) => {
      const intent = await txn.get(key);
      if (!intent) throw new Error('Commit intent not found');
      if (intent.state === 'COMMITTED') return intent;
      if (intent.state !== 'COMMITTING')
        throw new Error('Commit intent is not committing');
      const updated = {
        ...intent,
        state: 'COMMITTED',
        commitSha: String(payload.commitSha || ''),
        branch: String(payload.branch || ''),
        updatedAt: now,
        expiresAt: retainedUntil
      };
      await txn.put(key, updated);
      const wk = `ws:${intent.workspaceId}`,
        ws = await txn.get(wk);
      if (ws)
        await txn.put(wk, {
          ...ws,
          state: 'COMMITTED',
          currentIntentId: intent.id,
          commitSha: updated.commitSha,
          branch: updated.branch,
          updatedAt: now,
          expiresAt: retainedUntil
        });
      return updated;
    });
    await this.#schedule(retainedUntil);
    return completed;
  }
  async #markStale(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async (txn) => {
      const intent = await txn.get(key);
      if (!intent) throw new Error('Commit intent not found');
      if (intent.state === 'COMMITTED') return intent;
      const updated = {
        ...intent,
        state: 'STALE',
        staleReason: String(payload.reason || 'stale'),
        updatedAt: now
      };
      await txn.put(key, updated);
      return updated;
    });
  }
  async #cancelWorkspace(payload) {
    const id = String(payload.workspaceId || '');
    if (!id) throw new Error('Workspace ID is required');
    await this.state.storage.transaction(async (txn) => {
      await txn.delete(`ws:${id}`);
      const p = await txn.get('pending');
      if (p?.workspaceId === id) await txn.delete('pending');
    });
    return { cancelled: true };
  }
  async alarm() {
    const now = Date.now(),
      entries = await this.state.storage.list();
    let next = Infinity;
    for (const [key, value] of entries) {
      if (key === '__next_alarm') continue;
      const expiry = Number(value?.expiresAt);
      if (!Number.isFinite(expiry)) continue;
      if (expiry <= now) await this.state.storage.delete(key);
      else next = Math.min(next, expiry);
    }
    await this.state.storage.delete('__next_alarm');
    if (Number.isFinite(next)) {
      await this.state.storage.put('__next_alarm', next);
      await this.state.storage.setAlarm(next);
    }
  }
}
