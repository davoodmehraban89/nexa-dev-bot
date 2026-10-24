import { normalizeIncident } from '../core/incidents.js';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
export class IncidentStore {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const owner = url.searchParams.get('owner') || '';
    if (!owner) return json({ error: 'owner required' }, 400);
    const key = 'incidents:' + owner;
    const items = (await this.storage.get(key)) || [];
    if (request.method === 'GET') return json({ version: 1, items });
    const body = await request.json().catch(() => ({}));
    if (request.method === 'POST' && url.pathname.endsWith('/upsert')) {
      const next = normalizeIncident(body);
      const i = items.findIndex((x) => x.fingerprint === next.fingerprint);
      const now = Date.now();
      if (i >= 0) {
        items[i] = {
          ...items[i],
          ...next,
          status: 'open',
          count: (items[i].count || 1) + 1,
          updatedAt: now
        };
      } else
        items.unshift({
          ...next,
          id: crypto.randomUUID(),
          count: 1,
          createdAt: now,
          updatedAt: now
        });
      await this.storage.put(key, items.slice(0, 100));
      return json(i >= 0 ? items[i] : items[0]);
    }
    if (request.method === 'POST' && url.pathname.endsWith('/resolve')) {
      const i = items.findIndex((x) => x.id === body.id);
      if (i < 0) return json({ error: 'not found' }, 404);
      items[i] = {
        ...items[i],
        status: 'resolved',
        resolvedAt: Date.now(),
        updatedAt: Date.now()
      };
      await this.storage.put(key, items);
      return json(items[i]);
    }
    return json({ error: 'not found' }, 404);
  }
}
