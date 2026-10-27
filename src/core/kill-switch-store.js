export class DurableKillSwitchStoreClient {
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
  #stub() {
    if (!this.isConfigured())
      throw new Error('Kill switch durable store is not configured');
    return this.namespace.get(
      this.namespace.idFromName('global-emergency-kill-switch')
    );
  }
  async get() {
    const response = await this.#stub().fetch(
      'https://kill-switch.local/state'
    );
    if (!response.ok)
      throw new Error(`Kill switch read failed (${response.status})`);
    return response.json();
  }
  async set(state) {
    const response = await this.#stub().fetch(
      'https://kill-switch.local/state',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state)
      }
    );
    if (!response.ok)
      throw new Error(`Kill switch write failed (${response.status})`);
    return response.json();
  }
}
