const json = (payload, status = 200) => Response.json(payload, { status });
export class KillSwitchStore {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/state')
      return new Response('Not Found', { status: 404 });
    if (request.method === 'GET') {
      const state = await this.state.storage.get('state');
      return json(state || { mode: 'NORMAL', changedAt: 0 });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body || !['NORMAL', 'LOCKED'].includes(body.mode))
        return json({ ok: false }, 400);
      const next = {
        mode: body.mode,
        changedAt: Number(body.changedAt) || Date.now()
      };
      await this.state.storage.put('state', next);
      return json(next);
    }
    return new Response('Method Not Allowed', { status: 405 });
  }
}
