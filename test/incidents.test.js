import test from 'node:test';
import assert from 'node:assert/strict';
import {
  incidentFingerprint,
  redactIncidentText,
  normalizeIncident
} from '../src/core/incidents.js';
test('CP6 fingerprint separates provider repo sha and kind', () => {
  assert.notEqual(
    incidentFingerprint({
      provider: 'github',
      repo: 'a',
      sha: '1',
      kind: 'ci'
    }),
    incidentFingerprint({ provider: 'github', repo: 'a', sha: '2', kind: 'ci' })
  );
});
test('CP6 redacts token/query material', () => {
  const s = redactIncidentText('token=abc https://x.test/a?secret=bad');
  assert.doesNotMatch(s, /abc|bad/);
});
test('CP6 normalized incidents are open and source backed', () => {
  const i = normalizeIncident({
    provider: 'github',
    repo: 'r',
    sha: 'a'.repeat(40),
    kind: 'ci',
    ciFailure: true,
    summary: 'failed'
  });
  assert.equal(i.status, 'open');
  assert.equal(i.severity, 'high');
  assert.match(i.fingerprint, /github/);
});
