const json = (x, s = 200) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { 'content-type': 'application/json' }
  });
export class AutomationStore {
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(req) {
    const u = new URL(req.url),
      owner = u.searchParams.get('owner') || '',
      id = u.searchParams.get('id') || '';
    if (!owner || !id) return json({ error: 'owner/id required' }, 400);
    const key = `automation:${owner}:${id}`;
    if (req.method === 'GET') {
      const v = await this.storage.get(key);
      return v ? json(v) : json({ error: 'not found' }, 404);
    }
    if (req.method === 'PUT') {
      const body = await req.json();
      if (
        String(body.ownerId) !== owner ||
        body.id !== id ||
        body.version !== 1
      )
        return json({ error: 'invalid state' }, 400);
      await this.storage.put(key, body);
      return json(body);
    }
    return json({ error: 'not found' }, 404);
  }
}
