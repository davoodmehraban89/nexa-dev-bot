const clean = (v) =>
  String(v ?? '').replace(
    /(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+/gi,
    '$1=[REDACTED]'
  );
export const UX_CAPABILITIES = Object.freeze([
  { id: 8, key: 'copilot', title: 'Developer Copilot', mode: 'READ_ASSIST' },
  { id: 9, key: 'browser_qa', title: 'Browser QA', mode: 'EVIDENCE_ONLY' },
  {
    id: 10,
    key: 'plugin_catalog',
    title: 'Plugin Catalog',
    mode: 'POLICY_BOUND'
  },
  {
    id: 11,
    key: 'portfolio',
    title: 'Multi-project Portfolio',
    mode: 'OWNER_SCOPED'
  },
  {
    id: 12,
    key: 'command_center',
    title: 'Unified Command Center',
    mode: 'NAVIGATION'
  }
]);
export function buildCopilotBrief({ goal = '', evidence = [] } = {}) {
  const safe = evidence
    .slice(0, 12)
    .map((x) => clean(x))
    .filter(Boolean);
  return {
    goal: clean(goal).slice(0, 500),
    evidence: safe,
    recommendations: safe.length
      ? [
          'Review source-backed evidence',
          'Choose a policy-declared action',
          'Use Safe Approval for mutation'
        ]
      : ['Collect source-backed evidence before recommending mutation'],
    canMutate: false
  };
}
export function evaluateBrowserQa(checks = []) {
  const normalized = checks.slice(0, 50).map((c, i) => ({
    id: String(c.id ?? i),
    label: clean(c.label || `check ${i + 1}`),
    status: ['pass', 'fail', 'blocked'].includes(c.status)
      ? c.status
      : 'blocked',
    evidence: clean(c.evidence || '').slice(0, 500)
  }));
  return {
    status: normalized.some((x) => x.status === 'fail')
      ? 'failed'
      : normalized.some((x) => x.status === 'blocked')
        ? 'blocked'
        : 'passed',
    checks: normalized,
    sourceBacked: normalized.every(
      (x) => x.status === 'blocked' || Boolean(x.evidence)
    )
  };
}
export function buildPluginCatalog(manifests = []) {
  return manifests
    .map((m) => ({
      id: String(m.id),
      name: clean(m.name || m.id),
      actions: (m.actions || []).map((a) => ({
        id: String(a.id),
        risk: String(a.risk || 'READ')
      }))
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function buildPortfolio(projects = []) {
  return projects.slice(0, 50).map((p) => ({
    id: String(p.id),
    name: clean(p.name),
    provider: clean(p.provider || 'github'),
    status: ['healthy', 'attention', 'unknown'].includes(p.status)
      ? p.status
      : 'unknown'
  }));
}
export function searchCommandCenter(query, items = []) {
  const q = String(query || '')
    .trim()
    .toLocaleLowerCase();
  if (!q) return items.slice(0, 12);
  return items
    .filter((x) =>
      `${x.title || ''} ${x.keywords || ''}`.toLocaleLowerCase().includes(q)
    )
    .slice(0, 12);
}
