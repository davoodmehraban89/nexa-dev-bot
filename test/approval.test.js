import test from 'node:test';
import assert from 'node:assert/strict';

const approvalModule = await import('../src/core/approval.js').catch(() => null);

test('ApprovalService module exists', () => {
  assert.ok(approvalModule, 'ApprovalService module must exist');
  assert.equal(typeof approvalModule?.ApprovalService, 'function');
});

test('ApprovalService issues and verifies a signed owner-bound token', async () => {
  assert.ok(approvalModule?.ApprovalService, 'ApprovalService module must exist');
  let now = 1_700_000_000_000;
  const service = new approvalModule.ApprovalService({
    secret: 'test-signing-secret',
    now: () => now,
    ttlMs: 60_000
  });

  const token = await service.issue({
    pluginId: 'github',
    actionId: 'github.workflow.run.rerun_failed',
    risk: 'WRITE',
    ownerId: '42',
    input: { repoId: 7, runId: 9 }
  });

  assert.ok(`approve:${token}`.length <= 64, 'approval callback must fit Telegram callback_data');

  const payload = await service.verify(token, {
    ownerId: '42',
    pluginId: 'github',
    actionId: 'github.workflow.run.rerun_failed',
    risk: 'WRITE'
  });

  assert.equal(payload.v, 1);
  assert.equal(payload.ownerId, '42');
  assert.equal(payload.pluginId, 'github');
  assert.equal(payload.actionId, 'github.workflow.run.rerun_failed');
  assert.deepEqual(payload.input, { repoId: 7, runId: 9 });
  assert.equal(typeof payload.nonce, 'string');
  assert.ok(payload.nonce.length >= 8);
  assert.equal(payload.issuedAt, now);
  assert.equal(payload.expiresAt, now + 60_000);
});

test('ApprovalService rejects tampered, expired and mismatched tokens', async () => {
  assert.ok(approvalModule?.ApprovalService, 'ApprovalService module must exist');
  let now = 1_700_000_000_000;
  const service = new approvalModule.ApprovalService({
    secret: 'test-signing-secret',
    now: () => now,
    ttlMs: 1000
  });
  const token = await service.issue({
    pluginId: 'github',
    actionId: 'github.workflow.run.cancel',
    risk: 'WRITE',
    ownerId: '42',
    input: { repoId: 7, runId: 9 }
  });

  await assert.rejects(() => service.verify(`${token}x`, { ownerId: '42' }), /invalid approval/i);
  await assert.rejects(() => service.verify(token, { ownerId: '99' }), /owner/i);
  await assert.rejects(() => service.verify(token, {
    ownerId: '42',
    actionId: 'github.workflow.run.rerun_failed'
  }), /action/i);
  now += 2000;
  await assert.rejects(() => service.verify(token, { ownerId: '42' }), /expired/i);
});

test('ApprovalService consume is one-time and rejects replay', async () => {
  assert.ok(approvalModule?.ApprovalService, 'ApprovalService module must exist');
  const service = new approvalModule.ApprovalService({
    secret: 'test-signing-secret',
    now: () => 1_700_000_000_000
  });
  const token = await service.issue({
    pluginId: 'github',
    actionId: 'github.workflow.run.cancel',
    risk: 'WRITE',
    ownerId: '42',
    input: { repoId: 7, runId: 9 }
  });

  const first = await service.consume(token, { ownerId: '42' });
  assert.equal(first.actionId, 'github.workflow.run.cancel');
  await assert.rejects(() => service.consume(token, { ownerId: '42' }), /already used/i);
});

test('ApprovalService fails closed for missing secret and oversized callback token', async () => {
  assert.ok(approvalModule?.ApprovalService, 'ApprovalService module must exist');
  const missing = new approvalModule.ApprovalService({ secret: '' });
  await assert.rejects(() => missing.issue({ pluginId: 'github' }), /secret/i);

  const service = new approvalModule.ApprovalService({
    secret: 'test-signing-secret',
    maxTokenLength: 64,
    now: () => 1_700_000_000_000
  });
  await assert.rejects(() => service.issue({
    pluginId: 'github',
    actionId: 'github.workflow.run.cancel',
    risk: 'WRITE',
    ownerId: '42',
    input: { text: 'x'.repeat(200) }
  }), /too large/i);
});
