const fullSha = (value) =>
  /^[a-f0-9]{40}$/i.test(String(value || ''))
    ? String(value).toLowerCase()
    : '';

export function correlateDeliveryState({
  targetSha,
  ci,
  deploy,
  runtime
} = {}) {
  const target = fullSha(targetSha);
  if (!target || !ci || !deploy)
    return { state: 'unknown', reason: 'Delivery evidence is incomplete' };

  const ciSha = fullSha(ci.sha);
  const deploySha = fullSha(deploy.sha);
  if (!ciSha || !deploySha || ciSha !== target || deploySha !== target) {
    return { state: 'mismatch', reason: 'CI/deploy SHA does not match target' };
  }

  const ciState = String(ci.conclusion || ci.status || '');
  const deployState = String(deploy.conclusion || deploy.status || '');
  if (
    ['failure', 'cancelled', 'timed_out', 'action_required'].includes(
      ciState
    ) ||
    ['failure', 'cancelled', 'timed_out', 'action_required'].includes(
      deployState
    )
  ) {
    return { state: 'failed', reason: 'CI or deploy failed' };
  }
  if (ci.status !== 'completed' || deploy.status !== 'completed') {
    return { state: 'pending', reason: 'CI or deploy is still pending' };
  }
  if (ci.conclusion !== 'success' || deploy.conclusion !== 'success') {
    return { state: 'failed', reason: 'CI or deploy did not succeed' };
  }

  const versions = runtime?.deployment?.versions;
  if (
    !Array.isArray(versions) ||
    versions.length !== 1 ||
    Number(versions[0]?.percentage) !== 100 ||
    !versions[0]?.versionId
  ) {
    return {
      state: 'mismatch',
      reason: 'Runtime traffic is not pinned to one verified version'
    };
  }

  return {
    state: 'success',
    reason: 'Exact SHA CI/deploy evidence and runtime traffic agree',
    sha: target,
    deploymentId: String(runtime?.deployment?.id || ''),
    versionId: String(versions[0].versionId)
  };
}
