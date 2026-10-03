export class DurableApprovalReplayStore {
  constructor({ namespace } = {}) {
    this.namespace = namespace || null;
  }

  isConfigured() {
    return Boolean(
      this.namespace &&
      typeof this.namespace.idFromName === 'function' &&
      typeof this.namespace.get === 'function'
    );
  }

  async consume({ ownerId, nonce, expiresAt } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Durable approval replay protection is not configured');
    }

    const owner = String(ownerId ?? '');
    const nonceValue = String(nonce ?? '');
    const expiry = Number(expiresAt);
    if (!owner || !nonceValue || !Number.isFinite(expiry)) {
      throw new Error('Invalid durable approval replay input');
    }

    const id = this.namespace.idFromName(`${owner}:${nonceValue}`);
    const stub = this.namespace.get(id);
    const response = await stub.fetch(new Request('https://approval-replay/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresAt: expiry })
    }));

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.status === 409 || response.status === 410) return false;
    if (!response.ok || body?.accepted !== true) {
      throw new Error(`Durable approval replay protection failed (${response.status})`);
    }
    return true;
  }
}
