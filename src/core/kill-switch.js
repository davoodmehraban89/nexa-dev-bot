export class KillSwitch {
  constructor({ store } = {}) {
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') throw new Error('Kill switch store is required');
    this.store = store;
  }

  async status() {
    const state = await this.store.get();
    if (!state || !['NORMAL', 'LOCKED'].includes(state.mode)) throw new Error('Kill switch state is unavailable');
    return state;
  }

  async blocks(risk) {
    if (!['WRITE', 'DESTRUCTIVE'].includes(String(risk || ''))) return false;
    try {
      return (await this.status()).mode !== 'NORMAL';
    } catch {
      return true;
    }
  }

  async automationBlocked() {
    try {
      return (await this.status()).mode !== 'NORMAL';
    } catch {
      return true;
    }
  }

  async lock(context = {}) {
    this.#assertControl(context);
    return this.store.set({ mode: 'LOCKED', changedAt: Date.now() });
  }

  async unlock(context = {}) {
    this.#assertControl(context);
    return this.store.set({ mode: 'NORMAL', changedAt: Date.now() });
  }

  #assertControl(context) {
    if (context.isOwner !== true) throw new Error('Kill switch control requires owner');
    if (context.approved !== true) throw new Error('Kill switch control requires approval');
  }
}
