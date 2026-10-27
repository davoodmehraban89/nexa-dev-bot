import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production deploy syncs Cloudflare status credentials before Worker deploy', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /secret put CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secret put CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /Deploy verified commit to Cloudflare Workers/);
  assert.doesNotMatch(workflow, /echo\s+\$CLOUDFLARE_API_TOKEN/);
});
