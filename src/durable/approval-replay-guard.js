const json = (payload, status = 200) => Response.json(payload, { status });

export class ApprovalReplayGuard {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/consume') {
      return new Response('Not Found', { status: 404 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ accepted: false, reason: 'invalid_payload' }, 400);
    }

    const expiresAt = Number(payload?.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return json({ accepted: false, reason: 'invalid_expiry' }, 400);
    }
    if (expiresAt < Date.now()) {
      return json({ accepted: false, reason: 'expired' }, 410);
    }

    const accepted = await this.state.storage.transaction(async txn => {
      const usedUntil = await txn.get('used');
      if (usedUntil) return false;
      await txn.put('used', expiresAt);
      return true;
    });

    if (!accepted) {
      return json({ accepted: false, reason: 'already_used' }, 409);
    }

    await this.state.storage.setAlarm(expiresAt);
    return json({ accepted: true });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}
