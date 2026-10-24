import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogger } from '../src/core/audit.js';

test('AuditLogger redacts configured secrets recursively', () => {
  const events = [];
  const logger = new AuditLogger({
    secrets: ['bot-secret', 'github-secret'],
    sink: (event) => events.push(event)
  });

  logger.log({
    event: 'action_error',
    message: 'token bot-secret failed',
    nested: {
      detail: 'github-secret present',
      values: ['safe', 'bot-secret']
    }
  });

  assert.deepEqual(events, [
    {
      event: 'action_error',
      message: 'token [REDACTED] failed',
      nested: {
        detail: '[REDACTED] present',
        values: ['safe', '[REDACTED]']
      }
    }
  ]);
});

test('AuditLogger sink failures never escape to the caller', () => {
  const logger = new AuditLogger({
    sink: () => {
      throw new Error('log sink failed');
    }
  });

  assert.doesNotThrow(() => logger.log({ event: 'action_attempt' }));
});
