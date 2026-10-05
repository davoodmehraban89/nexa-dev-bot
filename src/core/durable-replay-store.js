export class DurableApprovalReplayStore {
  constructor({ namespace } = {}) { this.namespace = namespace || null; }
  isConfigured() { return Boolean(this.namespace && typeof this.namespace.idFromName === 'function' && typeof this.namespace.get === 'function'); }
  #stub(ownerId, nonce) {
    if (!this.isConfigured()) throw new Error('Durable approval replay protection is not configured');
    const owner = String(ownerId ?? ''); const nonceValue = String(nonce ?? '');
    if (!owner || !nonceValue) throw new Error('Invalid durable approval replay input');
    return this.namespace.get(this.namespace.idFromName(`${owner}:${nonceValue}`));
  }
  #secondFactorStub(ownerId) {
    return this.#stub(ownerId, 'second-factor');
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
  async setSecondFactorPending({ ownerId, token, expiresAt, attempts = 0 } = {}) {
    const expiry = Number(expiresAt);
    const attemptCount = Number(attempts);
    if (!String(ownerId ?? '') || !String(token || '') || !Number.isFinite(expiry) || expiry < Date.now() || !Number.isSafeInteger(attemptCount) || attemptCount < 0) {
      throw new Error('Invalid second-factor pending state');
    }
    const response = await this.#secondFactorStub(ownerId).fetch(new Request('https://approval-replay/second-factor/put', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: String(token), expiresAt: expiry, attempts: attemptCount })
    }));
    if (!response.ok) throw new Error(`Durable second-factor state failed (${response.status})`);
    return true;
  }
  async getSecondFactorPending({ ownerId } = {}) {
    if (!String(ownerId ?? '')) throw new Error('Invalid second-factor owner');
    const response = await this.#secondFactorStub(ownerId).fetch(new Request('https://approval-replay/second-factor/get'));
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new Error(`Durable second-factor state failed (${response.status})`);
    const body = await response.json().catch(() => null);
    return body?.pending || null;
  }
  async clearSecondFactorPending({ ownerId } = {}) {
    if (!String(ownerId ?? '')) throw new Error('Invalid second-factor owner');
    const response = await this.#secondFactorStub(ownerId).fetch(new Request('https://approval-replay/second-factor/clear', { method: 'POST' }));
    if (!response.ok) throw new Error(`Durable second-factor clear failed (${response.status})`);
    return true;
  }
}
