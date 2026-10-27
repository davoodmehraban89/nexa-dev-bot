const unavailable = () =>
  new Response('Nexa Studio موقتاً در دسترس نیست؛ دوباره تلاش کنید.', {
    status: 503,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

export async function handleStudioAssetsRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/studio' && !url.pathname.startsWith('/studio/'))
    return null;
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: 'GET, HEAD' }
    });
  if (url.pathname === '/studio')
    return new Response(null, {
      status: 308,
      headers: { location: '/studio/', 'cache-control': 'no-store' }
    });
  if (!env.ASSETS?.fetch) return unavailable();
  try {
    const response = await env.ASSETS.fetch(
      request.method === 'HEAD'
        ? new Request(request, { method: 'GET' })
        : request
    );
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    if (url.pathname === '/studio/' || url.pathname === '/studio/index.html') {
      if (!response.ok) return unavailable();
      const html = await response.text();
      if (!html.includes('__NEXA_NONCE__')) return unavailable();
      const nonce = crypto.randomUUID().replaceAll('-', '');
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store');
      headers.delete('etag');
      headers.delete('content-length');
      headers.set(
        'content-security-policy',
        `default-src 'none'; script-src 'self' https://telegram.org; style-src 'self' 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`
      );
      return new Response(
        request.method === 'HEAD'
          ? null
          : html.replaceAll('__NEXA_NONCE__', nonce),
        { status: 200, headers }
      );
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      headers
    });
  } catch {
    return unavailable();
  }
}
