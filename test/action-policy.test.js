import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionPolicy } from '../src/core/action-policy.js';

const action = (risk) => ({
  pluginId: 'x',
  actionId: `x.${risk.toLowerCase()}`,
  risk
});

test('ActionPolicy allows owner READ without approval', () => {
  const policy = new ActionPolicy();
  assert.deepEqual(policy.evaluate({ action: action('READ'), isOwner: true }), {
    allowed: true,
    requiresApproval: false,
    risk: 'READ',
    reason: 'owner_read_allowed'
  });
});

test('ActionPolicy requires approval for WRITE and DESTRUCTIVE actions', () => {
  const policy = new ActionPolicy();
  for (const risk of ['WRITE', 'DESTRUCTIVE']) {
    assert.deepEqual(policy.evaluate({ action: action(risk), isOwner: true }), {
      allowed: false,
      requiresApproval: true,
      risk,
      reason:
        risk === 'WRITE'
          ? 'owner_write_requires_approval'
          : 'owner_destructive_requires_approval'
    });
  }
});

test('ActionPolicy allows verified owner approval for WRITE and DESTRUCTIVE actions', () => {
  const policy = new ActionPolicy();
  assert.deepEqual(
    policy.evaluate({ action: action('WRITE'), isOwner: true, approved: true }),
    {
      allowed: true,
      requiresApproval: false,
      risk: 'WRITE',
      reason: 'owner_write_approved'
    }
  );
  assert.deepEqual(
    policy.evaluate({
      action: action('DESTRUCTIVE'),
      isOwner: true,
      approved: true
    }),
    {
      allowed: true,
      requiresApproval: false,
      risk: 'DESTRUCTIVE',
      reason: 'owner_destructive_approved'
    }
  );
});

test('ActionPolicy denies non-owner even when approved flag is present', () => {
  const policy = new ActionPolicy();
  assert.deepEqual(
    policy.evaluate({
      action: action('WRITE'),
      isOwner: false,
      approved: true
    }),
    {
      allowed: false,
      requiresApproval: false,
      risk: 'WRITE',
      reason: 'owner_required'
    }
  );
});

test('ActionPolicy denies non-owner, missing and unknown actions', () => {
  const policy = new ActionPolicy();
  assert.deepEqual(
    policy.evaluate({ action: action('READ'), isOwner: false }),
    {
      allowed: false,
      requiresApproval: false,
      risk: 'READ',
      reason: 'owner_required'
    }
  );
  assert.equal(policy.evaluate({ action: null, isOwner: true }).allowed, false);
  assert.equal(
    policy.evaluate({ action: { risk: 'UNKNOWN' }, isOwner: true }).allowed,
    false
  );
});
