export class DurableAutomationStoreClient {
  constructor({ namespace, ownerId }) {
    this.namespace = namespace;
    this.ownerId = String(ownerId || '');
  }
  stub(id) {
    if (!this.namespace || !this.ownerId)
      throw new Error('Automation store is not configured');
    return this.namespace.get(
      this.namespace.idFromName(`owner:${this.ownerId}:automation:${id}`)
    );
  }
  async get(id) {
    const r = await this.stub(id).fetch(
      `https://automation.local/?owner=${encodeURIComponent(this.ownerId)}&id=${encodeURIComponent(id)}`
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Automation read failed');
    return r.json();
  }
  async put(state) {
    const r = await this.stub(state.id).fetch(
      `https://automation.local/?owner=${encodeURIComponent(this.ownerId)}&id=${encodeURIComponent(state.id)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state)
      }
    );
    if (!r.ok) throw new Error('Automation write failed');
    return r.json();
  }
  async claimStep(state) {
    if (String(state.ownerId) !== this.ownerId)
      throw new Error('Automation claim owner mismatch');
    return this.stepRequest(state.id, 'claim', {
      cursor: state.cursor,
      key: state.steps?.[state.cursor]?.key,
      revision: state.revision || 0
    });
  }
  completeStep(id, { token, outcome, intent }) {
    return this.stepRequest(id, 'complete', { token, outcome, intent });
  }
  async stepRequest(id, operation, body) {
    const r = await this.stub(id).fetch(
      `https://automation.local/${operation}?owner=${encodeURIComponent(this.ownerId)}&id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    if (!r.ok) throw new Error(`Automation ${operation} failed`);
    return r.json();
  }
}
