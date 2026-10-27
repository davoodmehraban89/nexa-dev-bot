import test from 'node:test';
import assert from 'node:assert/strict';

let module = {};
try {
  module = await import('../src/studio-assets.js');
} catch {}
const serve = (...args) => {
  assert.equal(
    typeof module.handleStudioAssetsRequest,
    'function',
    'Studio assets handler must exist'
  );
  return module.handleStudioAssetsRequest(...args);
};
const html =
  '<!doctype html><html lang="fa" dir="rtl"><meta name="csp-nonce" content="__NEXA_NONCE__"><script type="module" src="/studio/assets/app.js"></script></html>';

test('Studio entry serves a real asset shell with fresh nonce and no unsafe-inline', async () => {
  const calls = [];
  const env = {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }
    }
  };
  const first = await serve(new Request('https://app.test/studio/'), env);
  const second = await serve(new Request('https://app.test/studio/'), env);
  assert.equal(first.status, 200);
  const body = await first.text();
  const nonce = body.match(/content="([a-f0-9]{32})"/)[1];
  assert.match(
    first.headers.get('content-security-policy'),
    new RegExp("style-src 'self' 'nonce-" + nonce + "'")
  );
  assert.doesNotMatch(
    first.headers.get('content-security-policy'),
    /unsafe-inline/
  );
  assert.match(
    first.headers.get('content-security-policy'),
    /script-src 'self' https:\/\/telegram\.org/
  );
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
  assert.doesNotMatch(body, /__NEXA_NONCE__/);
  assert.notEqual(
    first.headers.get('content-security-policy'),
    second.headers.get('content-security-policy')
  );
  assert.deepEqual(calls, ['/studio/', '/studio/']);
});

test('Studio normalizes its public entry, serves static files and leaves other routes to Worker', async () => {
  const redirect = await serve(new Request('https://app.test/studio'), {});
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/studio/');
  const response = await serve(
    new Request('https://app.test/studio/assets/app.js'),
    {
      ASSETS: {
        fetch: async () =>
          new Response('export {}', {
            headers: { 'content-type': 'text/javascript' }
          })
      }
    }
  );
  assert.equal(await response.text(), 'export {}');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await serve(new Request('https://app.test/status'), {}), null);
});

test('missing or failing assets return a fixed error without leaking provider text', async () => {
  for (const env of [
    {},
    {
      ASSETS: {
        fetch: async () => {
          throw new Error('PRIVATE_ASSET_PROVIDER_SENTINEL');
        }
      }
    }
  ]) {
    const response = await serve(new Request('https://app.test/studio/'), env);
    assert.equal(response.status, 503);
    assert.doesNotMatch(
      await response.text(),
      /PRIVATE_ASSET_PROVIDER_SENTINEL/
    );
  }
});

test('invalid HTML without its nonce placeholder fails closed', async () => {
  const response = await serve(new Request('https://app.test/studio/'), {
    ASSETS: { fetch: async () => new Response('<html>broken</html>') }
  });
  assert.equal(response.status, 503);
});
