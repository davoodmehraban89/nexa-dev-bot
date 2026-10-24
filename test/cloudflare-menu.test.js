import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareMenuManager } from '../src/cloudflare-menu.js';

function callbacks(view) {
  return (view.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => button.callback_data)
    .filter(Boolean);
}

test('tools menu includes Cloudflare status', () => {
  const menu = new CloudflareMenuManager(
    {},
    {
      getSnapshot() {
        return {
          runtime: 'Cloudflare Worker',
          githubOwner: 'owner',
          pluginCount: 2
        };
      },
      getPluginSummary() {
        return { pluginCount: 2, actionCount: 2, plugins: [] };
      }
    }
  );
  const values = callbacks(menu.getToolsView());
  assert.ok(values.includes('cf:status'));
  assert.equal(values.filter((value) => value === 'cf:status').length, 1);
  assert.ok(values.includes('ops:github'));
  assert.ok(values.includes('menu:main'));
});
