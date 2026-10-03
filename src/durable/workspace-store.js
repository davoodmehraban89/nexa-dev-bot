const json = (payload, status = 200) => Response.json(payload, { status });
const HANDLE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const WORKSPACE_TTL_MS = 30 * 60_000;
const REF_TTL_MS = 15 * 60_000;
const COMMITTED_RETENTION_MS = 24 * 60 * 60_000;

function randomHandle(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += HANDLE_ALPHABET[byte & 63];
  return out;
}

function finiteNow(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function positiveTtl(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function expired(record, now) {
  return Boolean(record && Number.isFinite(Number(record.expiresAt)) && Number(record.expiresAt) < now);
}

export class WorkspaceStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return new Response('Not Found', { status: 404 });

    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid workspace payload' }, 400); }
    const now = finiteNow(payload?.now);

    try {
      switch (url.pathname) {
        case '/refs/create': return json({ result: await this.#createRefs(payload, now) });
        case '/refs/get': return json({ result: await this.#getExpiring(`ref:${String(payload.refId || '')}`, now) });
        case '/workspace/create': return json({ result: await this.#createWorkspace(payload, now) });
        case '/workspace/get': return json({ result: await this.#getExpiring(`ws:${String(payload.workspaceId || '')}`, now) });
        case '/workspace/draft': return json({ result: await this.#updateDraft(payload, now) });
        case '/workspace/message': return json({ result: await this.#setCommitMessage(payload, now) });
        case '/workspace/cancel': return json({ result: await this.#cancelWorkspace(payload) });
        case '/pending/set': return json({ result: await this.#setPending(payload, now) });
        case '/pending/get': return json({ result: await this.#getPending(now) });
        case '/pending/consume': return json({ result: await this.#consumePending(payload, now) });
        case '/intent/seal': return json({ result: await this.#sealIntent(payload, now) });
        case '/intent/get': return json({ result: await this.#getExpiring(`intent:${String(payload.intentId || '')}`, now) });
        case '/intent/begin': return json({ result: await this.#beginCommit(payload, now) });
        case '/intent/candidate': return json({ result: await this.#setCandidate(payload, now) });
        case '/intent/complete': return json({ result: await this.#completeCommit(payload, now) });
        case '/intent/stale': return json({ result: await this.#markStale(payload, now) });
        default: return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return json({ error: String(error?.message || 'Workspace store operation failed') }, 400);
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

  async #getExpiring(key, now) {
    if (!key || key.endsWith(':')) return null;
    const record = await this.state.storage.get(key);
    if (!record) return null;
    if (expired(record, now)) {
      await this.state.storage.delete(key);
      return null;
    }
    return record;
  }

  async #createRefs(payload, now) {
    if (!Array.isArray(payload.refs)) throw new Error('Navigation refs are required');
    const ttlMs = positiveTtl(payload.ttlMs, REF_TTL_MS);
    const expiresAt = now + ttlMs;
    const output = [];
    for (const source of payload.refs) {
      const refId = randomHandle(10);
      const record = {
        repoId: source?.repoId,
        path: String(source?.path || ''),
        type: source?.type === 'dir' ? 'dir' : 'file',
        sha: String(source?.sha || ''),
        expiresAt
      };
      await this.state.storage.put(`ref:${refId}`, record);
      output.push({ refId });
    }
    await this.#schedule(expiresAt);
    return output;
  }

  async #createWorkspace(payload, now) {
    const id = randomHandle(10);
    const expiresAt = Number.isFinite(Number(payload.expiresAt)) ? Number(payload.expiresAt) : now + WORKSPACE_TTL_MS;
    if (expiresAt <= now) throw new Error('Workspace expiry must be in the future');
    const workspace = {
      id,
      repoId: payload.repoId,
      repoFullName: String(payload.repoFullName || ''),
      baseBranch: String(payload.baseBranch || ''),
      baseHeadSha: String(payload.baseHeadSha || ''),
      baseTreeSha: String(payload.baseTreeSha || ''),
      path: String(payload.path || ''),
      blobSha: String(payload.blobSha || ''),
      originalText: String(payload.originalText ?? ''),
      originalDigest: String(payload.originalDigest || ''),
      draftText: String(payload.originalText ?? ''),
      draftDigest: String(payload.originalDigest || ''),
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

  async #requireWorkspace(workspaceId, now) {
    const workspace = await this.#getExpiring(`ws:${String(workspaceId || '')}`, now);
    if (!workspace) throw new Error('Workspace not found or expired');
    return workspace;
  }

  async #updateDraft(payload, now) {
    const workspace = await this.#requireWorkspace(payload.workspaceId, now);
    const digest = String(payload.digest || '');
    if (!digest) throw new Error('Draft digest is required');
    const changed = digest !== workspace.draftDigest;
    const updated = {
      ...workspace,
      draftText: String(payload.text ?? ''),
      draftDigest: digest,
      updatedAt: now,
      ...(changed ? { currentIntentId: null, state: 'DRAFT' } : {})
    };
    await this.state.storage.put(`ws:${workspace.id}`, updated);
    return updated;
  }

  async #setCommitMessage(payload, now) {
    const workspace = await this.#requireWorkspace(payload.workspaceId, now);
    const digest = String(payload.digest || '');
    if (!digest) throw new Error('Commit message digest is required');
    const changed = digest !== workspace.commitMessageDigest;
    const updated = {
      ...workspace,
      commitMessage: String(payload.message || ''),
      commitMessageDigest: digest,
      updatedAt: now,
      ...(changed ? { currentIntentId: null, state: 'DRAFT' } : {})
    };
    await this.state.storage.put(`ws:${workspace.id}`, updated);
    return updated;
  }

  async #setPending(payload, now) {
    const workspace = await this.#requireWorkspace(payload.workspaceId, now);
    const mode = String(payload.mode || '');
    if (!['draft', 'commit_message'].includes(mode)) throw new Error('Pending input mode is invalid');
    const pending = { workspaceId: workspace.id, mode, expiresAt: workspace.expiresAt };
    await this.state.storage.put('pending', pending);
    await this.#schedule(pending.expiresAt);
    return pending;
  }

  async #getPending(now) {
    const pending = await this.state.storage.get('pending');
    if (!pending) return null;
    if (expired(pending, now)) {
      await this.state.storage.delete('pending');
      return null;
    }
    const workspace = await this.#getExpiring(`ws:${pending.workspaceId}`, now);
    if (!workspace) {
      await this.state.storage.delete('pending');
      return null;
    }
    return { workspaceId: pending.workspaceId, mode: pending.mode };
  }

  async #consumePending(payload, now) {
    return this.state.storage.transaction(async txn => {
      const pending = await txn.get('pending');
      if (!pending || expired(pending, now)) {
        if (pending) await txn.delete('pending');
        return false;
      }
      if (pending.workspaceId !== String(payload.workspaceId || '') || pending.mode !== String(payload.mode || '')) return false;
      await txn.delete('pending');
      return true;
    });
  }

  async #sealIntent(payload, now) {
    const workspace = await this.#requireWorkspace(payload.workspaceId, now);
    const proposed = payload.intent && typeof payload.intent === 'object' ? payload.intent : null;
    if (!proposed?.intentDigest) throw new Error('Commit intent digest is required');

    if (workspace.currentIntentId) {
      const existing = await this.#getExpiring(`intent:${workspace.currentIntentId}`, now);
      if (existing?.intentDigest === proposed.intentDigest) return existing;
    }

    const id = randomHandle(8);
    const intent = {
      ...proposed,
      id,
      workspaceId: workspace.id,
      state: 'READY',
      candidateCommitSha: null,
      commitSha: null,
      branch: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: workspace.expiresAt
    };
    await this.state.storage.put(`intent:${id}`, intent);
    await this.state.storage.put(`ws:${workspace.id}`, {
      ...workspace,
      currentIntentId: id,
      state: 'READY',
      updatedAt: now
    });
    await this.#schedule(intent.expiresAt);
    return intent;
  }

  async #beginCommit(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async txn => {
      const intent = await txn.get(key);
      if (!intent || expired(intent, now)) throw new Error('Commit intent not found or expired');
      if (intent.state === 'COMMITTED') return { disposition: 'committed', intent };
      if (intent.state === 'COMMITTING') return { disposition: 'resume', intent };
      if (intent.state !== 'READY') throw new Error(`Commit intent is ${intent.state || 'invalid'}`);
      const updated = { ...intent, state: 'COMMITTING', updatedAt: now };
      await txn.put(key, updated);
      return { disposition: 'start', intent: updated };
    });
  }

  async #setCandidate(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async txn => {
      const intent = await txn.get(key);
      if (!intent || expired(intent, now)) throw new Error('Commit intent not found or expired');
      if (intent.state === 'COMMITTED') return intent;
      if (intent.state !== 'COMMITTING') throw new Error('Commit intent is not committing');
      const updated = { ...intent, candidateCommitSha: String(payload.commitSha || ''), updatedAt: now };
      await txn.put(key, updated);
      return updated;
    });
  }

  async #completeCommit(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    const retainedUntil = now + COMMITTED_RETENTION_MS;
    const completed = await this.state.storage.transaction(async txn => {
      const intent = await txn.get(key);
      if (!intent) throw new Error('Commit intent not found');
      if (intent.state === 'COMMITTED') return intent;
      if (intent.state !== 'COMMITTING') throw new Error('Commit intent is not committing');
      const updated = {
        ...intent,
        state: 'COMMITTED',
        commitSha: String(payload.commitSha || ''),
        branch: String(payload.branch || ''),
        updatedAt: now,
        expiresAt: retainedUntil
      };
      await txn.put(key, updated);
      const workspaceKey = `ws:${intent.workspaceId}`;
      const workspace = await txn.get(workspaceKey);
      if (workspace) {
        await txn.put(workspaceKey, {
          ...workspace,
          state: 'COMMITTED',
          currentIntentId: intent.id,
          commitSha: updated.commitSha,
          branch: updated.branch,
          updatedAt: now,
          expiresAt: retainedUntil
        });
      }
      return updated;
    });
    await this.#schedule(retainedUntil);
    return completed;
  }

  async #markStale(payload, now) {
    const key = `intent:${String(payload.intentId || '')}`;
    return this.state.storage.transaction(async txn => {
      const intent = await txn.get(key);
      if (!intent) throw new Error('Commit intent not found');
      if (intent.state === 'COMMITTED') return intent;
      const updated = { ...intent, state: 'STALE', staleReason: String(payload.reason || 'stale'), updatedAt: now };
      await txn.put(key, updated);
      return updated;
    });
  }

  async #cancelWorkspace(payload) {
    const workspaceId = String(payload.workspaceId || '');
    if (!workspaceId) throw new Error('Workspace ID is required');
    await this.state.storage.transaction(async txn => {
      await txn.delete(`ws:${workspaceId}`);
      const pending = await txn.get('pending');
      if (pending?.workspaceId === workspaceId) await txn.delete('pending');
    });
    return { cancelled: true };
  }

  async alarm() {
    const now = Date.now();
    const entries = await this.state.storage.list();
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
