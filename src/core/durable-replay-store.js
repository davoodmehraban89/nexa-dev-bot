export class DurableApprovalReplayStore {
  constructor({ namespace } = {}) { this.namespace = namespace || null; }
  isConfigured() { return Boolean(this.namespace && typeof this.namespace.idFromName === 'function' && typeof this.namespace.get === 'function'); }
  #stub(ownerId, nonce) {
    if (!this.isConfigured()) throw new Error('Durable approval replay protection is not configured');
    const owner = String(ownerId ?? ''); const nonceValue = String(nonce ?? '');
    if (!owner || !nonceValue) throw new Error('Invalid durable approval replay input');
    return this.namespace.get(this.namespace.idFromName(`${owner}:${nonceValue}`));
  }
  async put({ ownerId, nonce, expiresAt, payload } = {}) {
    const expiry = Number(expiresAt); if (!Number.isFinite(expiry) || !payload) throw new Error('Invalid durable approval replay input');
    const response = await this.#stub(ownerId, nonce).fetch(new Request('https://approval-replay/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresAt: expiry, payload }) }));
    if (!response.ok) throw new Error(`Durable approval preparation failed (${response.status})`);
    return true;
  }
  async peek({ ownerId, nonce } = {}) {
    const response = await this.#stub(ownerId, nonce).fetch(new Request('https://approval-replay/peek'));
    if (!response.ok) return null;
    const body = await response.json().catch(() => null); return body?.payload || null;
  }
  async consume({ ownerId, nonce, expiresAt } = {}) {
    const expiry = Number(expiresAt); if (!Number.isFinite(expiry)) throw new Error('Invalid durable approval replay input');
    const response = await this.#stub(ownerId, nonce).fetch(new Request('https://approval-replay/consume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresAt: expiry }) }));
    const body = await response.json().catch(() => null);
    if (response.status === 409 || response.status === 410) return false;
    if (!response.ok || body?.accepted !== true) throw new Error(`Durable approval replay protection failed (${response.status})`);
    return true;
  }
}
