export class DurableIncidentStoreClient {
  constructor({ namespace, ownerId }) {
    this.namespace = namespace;
    this.ownerId = String(ownerId || '');
  }
  stub() {
    if (!this.namespace || !this.ownerId)
      throw new Error('Incident store is not configured');
    return this.namespace.get(
      this.namespace.idFromName('owner:' + this.ownerId)
    );
  }
  async request(path, body) {
    const r = await this.stub().fetch(
      'https://incident.local' +
        path +
        '?owner=' +
        encodeURIComponent(this.ownerId),
      {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }
    );
    if (!r.ok) throw new Error('Incident store request failed');
    return r.json();
  }
  list() {
    return this.request('/');
  }
  upsert(e) {
    return this.request('/upsert', e);
  }
  resolve(id) {
    return this.request('/resolve', { id });
  }
}
