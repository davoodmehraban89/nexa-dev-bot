import { transitionAutomation } from '../core/automation.js';

const json = (x, s = 200) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { 'content-type': 'application/json' }
  });
export class AutomationStore {
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(req) {
    const u = new URL(req.url),
      owner = u.searchParams.get('owner') || '',
      id = u.searchParams.get('id') || '';
    if (!owner || !id) return json({ error: 'owner/id required' }, 400);
    const key = `automation:${owner}:${id}`;
    if (req.method === 'GET') {
      const v = await this.storage.get(key);
      return v ? json(v) : json({ error: 'not found' }, 404);
    }
    if (req.method === 'PUT') {
      const body = await req.json();
      if (
        String(body.ownerId) !== owner ||
        body.id !== id ||
        body.version !== 1
      )
        return json({ error: 'invalid state' }, 400);
      return this.storage.transaction(async (txn) => {
        const current = await txn.get(key);
        // A claimed mutation cannot be safely revoked or reset by a snapshot PUT.
        if (
          body.stepClaim ||
          (current &&
            (current.stepClaim ||
              ['completed', 'cancelled', 'failed'].includes(current.status) ||
              (body.revision || 0) !== (current.revision || 0)))
        )
          return json({ error: 'automation state conflict' }, 409);
        const next = { ...body, revision: (current?.revision || 0) + 1 };
        await txn.put(key, next);
        return json(next);
      });
    }
    if (req.method === 'POST' && u.pathname === '/claim') {
      const body = await req.json();
      return this.storage.transaction(async (txn) => {
        const current = await txn.get(key);
        if (!current) return json({ error: 'not found' }, 404);
        const step = current.steps?.[current.cursor];
        if (
          !['ready', 'paused_kill_switch'].includes(current.status) ||
          current.stepClaim ||
          !step?.key ||
          current.completedKeys?.includes(step.key) ||
          body.cursor !== current.cursor ||
          body.key !== step.key ||
          (body.revision || 0) !== (current.revision || 0)
        )
          return json({ claimed: false, state: current });
        const token = crypto.randomUUID();
        // No expiry/reclaim: a crash can leave an ambiguous external mutation.
        const next = {
          ...current,
          status: 'step_unresolved',
          stepClaim: { token, key: step.key, cursor: current.cursor },
          revision: (current.revision || 0) + 1,
          updatedAt: Date.now()
        };
        await txn.put(key, next);
        return json({ claimed: true, token, state: next });
      });
    }
    if (req.method === 'POST' && u.pathname === '/complete') {
      const body = await req.json();
      if (
        !['complete', 'pause_approval', 'pause_kill_switch', 'fail'].includes(
          body.outcome
        )
      )
        return json({ error: 'invalid outcome' }, 400);
      return this.storage.transaction(async (txn) => {
        const current = await txn.get(key);
        if (!current) return json({ error: 'not found' }, 404);
        const claim = current.stepClaim;
        if (
          current.status !== 'step_unresolved' ||
          !claim?.token ||
          claim.token !== body.token ||
          claim.cursor !== current.cursor ||
          claim.key !== current.steps?.[current.cursor]?.key
        )
          return json({ completed: false, state: current });
        let next;
        if (body.outcome === 'complete')
          next = transitionAutomation(current, {
            type: 'complete_step',
            key: claim.key
          });
        else if (body.outcome === 'pause_approval')
          next = transitionAutomation(current, {
            type: 'pause',
            intent: { ...body.intent, key: claim.key }
          });
        else if (body.outcome === 'fail')
          next = transitionAutomation(current, {
            type: 'fail',
            error: 'Automation action denied'
          });
        else
          next = {
            ...current,
            status: 'paused_kill_switch',
            updatedAt: Date.now()
          };
        delete next.stepClaim;
        next.revision = (current.revision || 0) + 1;
        await txn.put(key, next);
        return json({ completed: true, state: next });
      });
    }
    return json({ error: 'not found' }, 404);
  }
}
