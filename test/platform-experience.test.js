import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UX_CAPABILITIES,
  buildCopilotBrief,
  evaluateBrowserQa,
  buildPluginCatalog,
  buildPortfolio,
  searchCommandCenter
} from '../src/core/platform-experience.js';
import {
  platformHomeView,
  platformCapabilityView
} from '../src/platform-menu.js';
test('rows 8-12 are explicit and bounded', () =>
  assert.deepEqual(
    UX_CAPABILITIES.map((x) => x.id),
    [8, 9, 10, 11, 12]
  ));
test('copilot is evidence grounded and cannot mutate', () => {
  const x = buildCopilotBrief({ goal: 'fix', evidence: ['token=abc failure'] });
  assert.equal(x.canMutate, false);
  assert.doesNotMatch(JSON.stringify(x), /abc/);
});
test('browser QA never invents pass without evidence', () => {
  assert.equal(evaluateBrowserQa([{ label: 'home' }]).status, 'blocked');
  assert.equal(
    evaluateBrowserQa([{ label: 'home', status: 'pass', evidence: 'HTTP 200' }])
      .status,
    'passed'
  );
});
test('plugin catalog preserves declared risks', () =>
  assert.equal(
    buildPluginCatalog([{ id: 'g', actions: [{ id: 'x', risk: 'WRITE' }] }])[0]
      .actions[0].risk,
    'WRITE'
  ));
test('portfolio clamps unknown status', () =>
  assert.equal(
    buildPortfolio([{ id: 1, name: 'a', status: 'magic' }])[0].status,
    'unknown'
  ));
test('command center search is bounded', () =>
  assert.equal(
    searchCommandCenter(
      'repo',
      Array.from({ length: 30 }, (_, i) => ({ title: 'repo ' + i }))
    ).length,
    12
  ));
test('platform UI exposes all five capabilities with safe callbacks', () => {
  const v = platformHomeView();
  assert.equal(v.reply_markup.inline_keyboard.length, 6);
  for (const c of UX_CAPABILITIES)
    assert.match(platformCapabilityView(c.key).text, new RegExp(String(c.id)));
});
