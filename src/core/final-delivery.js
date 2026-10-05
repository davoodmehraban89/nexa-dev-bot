const DELIVERY_ROWS = Object.freeze([
  { id: 16, key: 'release', title: 'Release integrity', required: ['mainSha', 'ciSuccess', 'deploySuccess'] },
  { id: 17, key: 'runtime', title: 'Runtime verification', required: ['deployedShaMatchesMain', 'runtimeHealthy'] },
  { id: 18, key: 'rollback', title: 'Rollback readiness', required: ['knownGoodVersion', 'rollbackDocumented'] },
  { id: 19, key: 'operations', title: 'Operations handoff', required: ['runbookPresent', 'securityInvariantsPresent', 'monitoringPathPresent'] },
  { id: 20, key: 'acceptance', title: 'Final acceptance', required: ['allTestsGreen', 'noOpenCriticalBlocker', 'evidenceRecorded'] }
]);

export function getFinalDeliveryRows() {
  return DELIVERY_ROWS.map(row => ({ ...row, required: [...row.required] }));
}

export function evaluateFinalDelivery(evidence = {}) {
  const rows = DELIVERY_ROWS.map(row => {
    const missing = row.required.filter(key => evidence[key] !== true && !(key === 'mainSha' && typeof evidence[key] === 'string' && evidence[key].length >= 7) && !(key === 'knownGoodVersion' && typeof evidence[key] === 'string' && evidence[key].length > 0));
    return { id: row.id, key: row.key, title: row.title, complete: missing.length === 0, missing };
  });
  return { complete: rows.every(row => row.complete), rows };
}

export function renderFinalDeliverySummary(evidence = {}) {
  const report = evaluateFinalDelivery(evidence);
  const lines = report.rows.map(row => `${row.complete ? '✅' : '⛔'} ${row.id}. ${row.title}${row.complete ? '' : ` — missing: ${row.missing.join(', ')}`}`);
  return [`Final delivery: ${report.complete ? 'ACCEPTED' : 'BLOCKED'}`, ...lines].join('\n');
}
