import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFinalDelivery, getFinalDeliveryRows, renderFinalDeliverySummary } from '../src/core/final-delivery.js';

const accepted = {
  mainSha: '3fdcbe613b02768a24a3bbfbf66fb247a0897092',
  ciSuccess: true,
  deploySuccess: true,
  deployedShaMatchesMain: true,
  runtimeHealthy: true,
  knownGoodVersion: 'known-good',
  rollbackDocumented: true,
  runbookPresent: true,
  securityInvariantsPresent: true,
  monitoringPathPresent: true,
  allTestsGreen: true,
  noOpenCriticalBlocker: true,
  evidenceRecorded: true
};

test('rows 16-20 are explicit and stable', () => {
  assert.deepEqual(getFinalDeliveryRows().map(row => row.id), [16, 17, 18, 19, 20]);
});

test('final acceptance is fail closed when evidence is absent', () => {
  const report = evaluateFinalDelivery({});
  assert.equal(report.complete, false);
  assert.equal(report.rows.every(row => row.complete === false), true);
});

test('final acceptance passes only with all required evidence', () => {
  const report = evaluateFinalDelivery(accepted);
  assert.equal(report.complete, true);
  assert.equal(report.rows.every(row => row.complete), true);
  assert.match(renderFinalDeliverySummary(accepted), /Final delivery: ACCEPTED/);
});

test('one failed runtime gate blocks the whole delivery', () => {
  const report = evaluateFinalDelivery({ ...accepted, runtimeHealthy: false });
  assert.equal(report.complete, false);
  assert.deepEqual(report.rows.find(row => row.id === 17).missing, ['runtimeHealthy']);
});
