const jsonRequest = (url, body) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

export class DurableWorkspaceStoreClient {
  constructor({ namespace = null, now = () => Date.now() } = {}) {
    this.namespace = namespace;
    this.now = now;
  }

  isConfigured() {
    return Boolean(
      this.namespace &&
        typeof this.namespace.idFromName === 'function' &&
        typeof this.namespace.get === 'function'
    );
  }

  async #call(ownerId, operation, payload = {}) {
    if (!this.isConfigured())
      throw new Error('Durable workspace store is not configured');
    const owner = String(ownerId ?? '');
    if (!owner) throw new Error('Workspace owner is required');
    const id = this.namespace.idFromName(owner);
    const stub = this.namespace.get(id);
    const response = await stub.fetch(
      jsonRequest(`https://workspace-store/${operation}`, {
        ...payload,
        now: Number(this.now())
      })
    );
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = new Error(
        body?.error || `Durable workspace store failed (${response.status})`
      );
      error.status = response.status;
      if (typeof body?.code === 'string') error.code = body.code;
      throw error;
    }
    return body?.result ?? null;
  }

  createNavigationRefs({ ownerId, refs, ttlMs = 900_000 } = {}) {
    return this.#call(ownerId, 'refs/create', { refs, ttlMs });
  }
  resolveNavigationRef({ ownerId, refId } = {}) {
    return this.#call(ownerId, 'refs/get', { refId });
  }
  createWorkspace({ ownerId, ...workspace } = {}) {
    return this.#call(ownerId, 'workspace/create', workspace);
  }
  getWorkspace({ ownerId, workspaceId } = {}) {
    return this.#call(ownerId, 'workspace/get', { workspaceId });
  }
  updateDraft({ ownerId, workspaceId, text, digest } = {}) {
    return this.#call(ownerId, 'workspace/draft', {
      workspaceId,
      text,
      digest
    });
  }
  upsertWorkspaceFile({ ownerId, workspaceId, file } = {}) {
    return this.#call(ownerId, 'workspace/file/upsert', { workspaceId, file });
  }
  updateWorkspaceFileDraft({
    ownerId,
    workspaceId,
    path,
    text,
    digest,
    expectedRevision
  } = {}) {
    return this.#call(ownerId, 'workspace/file/draft', {
      workspaceId,
      path,
      text,
      digest,
      expectedRevision
    });
  }
  removeWorkspaceFile({ ownerId, workspaceId, path } = {}) {
    return this.#call(ownerId, 'workspace/file/remove', { workspaceId, path });
  }
  setPendingInput({ ownerId, workspaceId, mode } = {}) {
    return this.#call(ownerId, 'pending/set', { workspaceId, mode });
  }
  getPendingInput({ ownerId } = {}) {
    return this.#call(ownerId, 'pending/get');
  }
  consumePendingInput({ ownerId, workspaceId, mode } = {}) {
    return this.#call(ownerId, 'pending/consume', { workspaceId, mode });
  }
  setCommitMessage({ ownerId, workspaceId, message, digest } = {}) {
    return this.#call(ownerId, 'workspace/message', {
      workspaceId,
      message,
      digest
    });
  }
  sealIntent({ ownerId, workspaceId, intent, expectedReview } = {}) {
    return this.#call(ownerId, 'intent/seal', {
      workspaceId,
      intent,
      expectedReview
    });
  }
  getIntent({ ownerId, intentId } = {}) {
    return this.#call(ownerId, 'intent/get', { intentId });
  }
  beginCommit({ ownerId, intentId } = {}) {
    return this.#call(ownerId, 'intent/begin', { intentId });
  }
  setCandidateCommit({ ownerId, intentId, commitSha } = {}) {
    return this.#call(ownerId, 'intent/candidate', { intentId, commitSha });
  }
  completeCommit({ ownerId, intentId, commitSha, branch } = {}) {
    return this.#call(ownerId, 'intent/complete', {
      intentId,
      commitSha,
      branch
    });
  }
  markStale({ ownerId, intentId, reason } = {}) {
    return this.#call(ownerId, 'intent/stale', { intentId, reason });
  }
  cancelWorkspace({ ownerId, workspaceId } = {}) {
    return this.#call(ownerId, 'workspace/cancel', { workspaceId });
  }
}
