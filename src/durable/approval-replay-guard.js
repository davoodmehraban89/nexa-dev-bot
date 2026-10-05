const json = (payload, status = 200) => Response.json(payload, { status });

export class ApprovalReplayGuard {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/second-factor/put') {
      const payload = await request.json().catch(() => null);
      const token = String(payload?.token || '');
      const expiresAt = Number(payload?.expiresAt);
      const attempts = Number(payload?.attempts || 0);
      if (!token || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !Number.isSafeInteger(attempts) || attempts < 0) {
        return json({ stored: false }, 400);
      }
      await this.state.storage.transaction(async txn => {
        await txn.put('secondFactorPending', { token, expiresAt, attempts });
      });
      await this.state.storage.setAlarm(expiresAt);
      return json({ stored: true });
    }

    if (request.method === 'GET' && url.pathname === '/second-factor/get') {
      const pending = await this.state.storage.transaction(async txn => txn.get('secondFactorPending'));
      if (!pending) return json({ pending: null }, 404);
      if (!Number.isFinite(Number(pending.expiresAt)) || Number(pending.expiresAt) < Date.now()) {
        await this.state.storage.transaction(async txn => txn.delete('secondFactorPending'));
        return json({ pending: null }, 410);
      }
      return json({ pending });
    }

    if (request.method === 'POST' && url.pathname === '/second-factor/clear') {
      await this.state.storage.transaction(async txn => txn.delete('secondFactorPending'));
      return json({ cleared: true });
    }

    if (request.method === 'POST' && url.pathname === '/prepare') {
      const payload = await request.json().catch(() => null); const expiresAt = Number(payload?.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !payload?.payload) return json({ prepared: false }, 400);
      const prepared = await this.state.storage.transaction(async txn => {
        if (await txn.get('used')) return false;
        const existing = await txn.get('payload');
        if (existing) return JSON.stringify(existing) === JSON.stringify(payload.payload);
        await txn.put('payload', payload.payload); await txn.put('expiresAt', expiresAt); return true;
      });
      if (!prepared) return json({ prepared: false }, 409);
      await this.state.storage.setAlarm(expiresAt); return json({ prepared: true });
    }
    if (request.method === 'GET' && url.pathname === '/peek') {
      const expiresAt = Number(await this.state.storage.get('expiresAt'));
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || await this.state.storage.get('used')) return json({ payload: null }, 404);
      return json({ payload: await this.state.storage.get('payload') || null });
    }
    if (request.method !== 'POST' || url.pathname !== '/consume') return new Response('Not Found', { status: 404 });
    const payload = await request.json().catch(() => null); const expiresAt = Number(payload?.expiresAt);
    if (!Number.isFinite(expiresAt)) return json({ accepted: false, reason: 'invalid_expiry' }, 400);
    if (expiresAt < Date.now()) return json({ accepted: false, reason: 'expired' }, 410);
    const accepted = await this.state.storage.transaction(async txn => { const usedUntil = await txn.get('used'); if (usedUntil) return false; await txn.put('used', expiresAt); return true; });
    if (!accepted) return json({ accepted: false, reason: 'already_used' }, 409);
    await this.state.storage.setAlarm(expiresAt); return json({ accepted: true });
  }
  async alarm() { await this.state.storage.deleteAll(); }
}
