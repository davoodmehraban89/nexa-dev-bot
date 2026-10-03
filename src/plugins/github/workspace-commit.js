const INTENT_ID_PATTERN = /^[A-Za-z0-9_-]{8}$/;
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function assertOwner(ownerId) {
  const owner = String(ownerId ?? '');
  if (!owner) throw new Error('Workspace owner is required');
  return owner;
}

function assertRepoId(repoId) {
  const value = Number(repoId);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Workspace repository ID is invalid');
  return value;
}

function assertIntentId(intentId) {
  const value = String(intentId || '');
  if (!INTENT_ID_PATTERN.test(value)) throw new Error('Workspace intent ID is invalid');
  return value;
}

function assertSha(value, label) {
  const sha = String(value || '');
  if (!FULL_SHA_PATTERN.test(sha)) throw new Error(`${label} SHA is invalid`);
  return sha;
}

function committedResult(intent, idempotent = true) {
  return {
    commitSha: assertSha(intent?.commitSha, 'Committed'),
    branch: String(intent?.branch || intent?.targetBranch || ''),
    idempotent
  };
}

function materialMismatch(intent, workspace, repoId, intentId) {
  return (
    Number(intent?.repoId) !== repoId ||
    Number(workspace?.repoId) !== repoId ||
    String(workspace?.id || '') !== String(intent?.workspaceId || '') ||
    String(workspace?.currentIntentId || '') !== intentId ||
    String(workspace?.baseBranch || '') !== String(intent?.baseBranch || '') ||
    String(workspace?.baseHeadSha || '') !== String(intent?.baseHeadSha || '') ||
    String(workspace?.baseTreeSha || '') !== String(intent?.baseTreeSha || '') ||
    String(workspace?.path || '') !== String(intent?.path || '') ||
    String(workspace?.blobSha || '') !== String(intent?.sourceBlobSha || '') ||
    String(workspace?.draftDigest || '') !== String(intent?.contentDigest || '') ||
    String(workspace?.commitMessageDigest || '') !== String(intent?.commitMessageDigest || '')
  );
}

async function markStaleThenThrow(workspaces, ownerId, intentId, reason) {
  try {
    await workspaces.markStale({ ownerId, intentId, reason });
  } catch {
    // The original safety failure remains authoritative.
  }
  throw new Error(reason);
}

async function reconcileCandidate({ github, workspaces, ownerId, repoId, intent, intentId }) {
  const candidate = assertSha(intent.candidateCommitSha, 'Candidate commit');
  const branch = String(intent.targetBranch || '');
  const existing = await github.getGitRef(repoId, branch, { allowMissing: true });
  if (existing?.sha === candidate) {
    await workspaces.completeCommit({ ownerId, intentId, commitSha: candidate, branch });
    return { commitSha: candidate, branch, idempotent: true };
  }
  if (existing) {
    throw new Error('Target branch exists at an unexpected commit');
  }

  const snapshot = await github.getBranchSnapshot(repoId, intent.baseBranch);
  if (snapshot.headSha !== intent.baseHeadSha) {
    return markStaleThenThrow(workspaces, ownerId, intentId, 'Base branch changed; commit intent is stale');
  }

  try {
    await github.createGitBranchRef(repoId, { branch, sha: candidate });
  } catch (error) {
    const observed = await github.getGitRef(repoId, branch, { allowMissing: true });
    if (observed?.sha !== candidate) {
      throw new Error(`Unable to reconcile candidate branch after provider error: ${error?.message || 'unknown error'}`);
    }
  }
  await workspaces.completeCommit({ ownerId, intentId, commitSha: candidate, branch });
  return { commitSha: candidate, branch, idempotent: true };
}

export async function commitWorkspaceIntent({ github, workspaces, ownerId, repoId, intentId } = {}) {
  if (!github) throw new Error('Workspace commit requires GitHub service');
  if (!workspaces) throw new Error('Workspace commit requires durable workspace store');
  const owner = assertOwner(ownerId);
  const repositoryId = assertRepoId(repoId);
  const id = assertIntentId(intentId);

  let intent = await workspaces.getIntent({ ownerId: owner, intentId: id });
  if (!intent) throw new Error('Commit intent not found or expired');
  if (Number(intent.repoId) !== repositoryId) throw new Error('Commit intent repository mismatch');
  if (intent.state === 'COMMITTED') return committedResult(intent, true);

  const workspace = await workspaces.getWorkspace({ ownerId: owner, workspaceId: intent.workspaceId });
  if (!workspace || materialMismatch(intent, workspace, repositoryId, id)) {
    return markStaleThenThrow(workspaces, owner, id, 'Workspace material changed; commit intent is stale');
  }

  const begun = await workspaces.beginCommit({ ownerId: owner, intentId: id });
  intent = begun?.intent;
  if (!intent) throw new Error('Commit intent could not begin');
  if (begun.disposition === 'committed' || intent.state === 'COMMITTED') return committedResult(intent, true);

  if (intent.candidateCommitSha) {
    return reconcileCandidate({ github, workspaces, ownerId: owner, repoId: repositoryId, intent, intentId: id });
  }

  const snapshot = await github.getBranchSnapshot(repositoryId, intent.baseBranch);
  if (snapshot.headSha !== intent.baseHeadSha) {
    return markStaleThenThrow(workspaces, owner, id, 'Base branch changed; commit intent is stale');
  }

  const existing = await github.getGitRef(repositoryId, intent.targetBranch, { allowMissing: true });
  if (existing) throw new Error('Target branch already exists unexpectedly');

  const blob = await github.createGitBlob(repositoryId, workspace.draftText);
  const tree = await github.createGitTree(repositoryId, {
    baseTreeSha: intent.baseTreeSha,
    entries: [{ path: intent.path, mode: '100644', type: 'blob', sha: blob.sha }]
  });
  const commit = await github.createGitCommit(repositoryId, {
    message: workspace.commitMessage,
    treeSha: tree.sha,
    parentSha: intent.baseHeadSha,
    timestamp: intent.commitTimestamp
  });
  const commitSha = assertSha(commit.sha, 'Candidate commit');
  await workspaces.setCandidateCommit({ ownerId: owner, intentId: id, commitSha });

  let idempotent = false;
  try {
    await github.createGitBranchRef(repositoryId, { branch: intent.targetBranch, sha: commitSha });
  } catch (error) {
    const observed = await github.getGitRef(repositoryId, intent.targetBranch, { allowMissing: true });
    if (observed?.sha !== commitSha) {
      throw new Error(`Unable to reconcile target branch after provider error: ${error?.message || 'unknown error'}`);
    }
    idempotent = true;
  }

  await workspaces.completeCommit({
    ownerId: owner,
    intentId: id,
    commitSha,
    branch: intent.targetBranch
  });
  return { commitSha, branch: intent.targetBranch, idempotent };
}
