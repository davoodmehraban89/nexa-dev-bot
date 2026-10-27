import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { EditorView } from '@codemirror/view';

let App;
const bundle = `.wrangler/studio-frontend-test-${process.pid}.mjs`;
const limits = {
  maxChars: 20000,
  maxBytes: 65536,
  maxFiles: 8,
  maxAggregateBytes: 131072
};
const repository = {
  id: 17,
  name: 'hello',
  fullName: 'owner/hello',
  defaultBranch: 'main',
  private: false,
  description: 'A real repository'
};
const source = '<img src=x onerror="window.pwned=true">\nconst answer = 1;';
function workspace(text = source, revision = 0) {
  return {
    id: 'Abcdef1234',
    repoId: 17,
    repoFullName: 'owner/hello',
    baseBranch: 'main',
    baseHeadSha: 'a'.repeat(40),
    state: 'DRAFT',
    path: 'index.js',
    files: [{ path: 'index.js', draftText: text, revision }],
    commitMessage: ''
  };
}

before(async () => {
  await mkdir('.wrangler', { recursive: true });
  await build({
    entryPoints: ['web/src/App.tsx'],
    outfile: bundle,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'silent'
  });
  ({ App } = await import(pathToFileURL(`${process.cwd()}/${bundle}`)));
});
after(() => rm(bundle, { force: true }));

async function setup({
  telegram = true,
  respond,
  stored = {},
  storageUnavailable = false
} = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><head><meta name="csp-nonce" content="test-nonce"></head><body><div id="root"></div></body></html>',
    { url: 'https://studio.example/studio/', pretendToBeVisual: true }
  );
  for (const [key, value] of Object.entries(stored))
    dom.window.localStorage.setItem(key, value);
  if (storageUnavailable)
    Object.defineProperty(dom.window, 'localStorage', {
      get() {
        throw new Error('Storage unavailable');
      }
    });
  const previous = new Map();
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'MutationObserver',
    'Node',
    'NodeFilter',
    'DOMRect',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value:
        typeof dom.window[key] === 'function' &&
        [
          'getComputedStyle',
          'requestAnimationFrame',
          'cancelAnimationFrame'
        ].includes(key)
          ? dom.window[key].bind(dom.window)
          : dom.window[key]
    });
  }
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () =>
    new dom.window.DOMRect();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  let closed = false;
  if (telegram) {
    dom.window.Telegram = {
      WebApp: {
        initData: 'opaque-signed-init-data',
        ready() {},
        expand() {},
        enableClosingConfirmation() {},
        disableClosingConfirmation() {},
        close() {
          closed = true;
        }
      }
    };
  }
  const fetcher = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method || 'GET',
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(init.body) : undefined
    };
    calls.push(call);
    const custom = await respond?.(call, calls);
    if (custom)
      return Response.json(custom.body, { status: custom.status || 200 });
    if (call.url === '/api/v1/studio') {
      return Response.json({
        ok: true,
        user: { name: 'داوود' },
        limits,
        version: '1'
      });
    }
    if (call.url === '/api/v1/studio/repos') {
      return Response.json({ ok: true, repositories: [repository] });
    }
    if (call.url.startsWith('/api/v1/studio/tree?')) {
      return Response.json({
        ok: true,
        repository,
        path: '',
        items: [
          {
            refId: 'FileRef123',
            name: 'index.js',
            path: 'index.js',
            type: 'file',
            size: source.length
          }
        ]
      });
    }
    if (call.url === '/api/v1/studio/workspaces' && call.method === 'POST') {
      return Response.json({ ok: true, workspace: workspace(), limits });
    }
    if (call.url.endsWith('/files') && call.method === 'PUT') {
      return Response.json({
        ok: true,
        workspace: workspace(call.body.text, 1),
        limits
      });
    }
    if (call.url.endsWith('/diff')) {
      return Response.json({
        ok: true,
        review: {
          baseHeadSha: 'a'.repeat(40),
          files: [{ path: 'index.js', revision: 1 }]
        },
        diff: {
          text: '--- a/index.js\n+++ b/index.js\n-const answer = 1;\n+const answer = 2;',
          additions: 1,
          deletions: 1,
          truncated: false
        }
      });
    }
    if (call.url.endsWith('/message')) {
      return Response.json({
        ok: true,
        workspace: {
          ...workspace('const answer = 2;', 1),
          commitMessage: call.body.message
        },
        limits
      });
    }
    if (call.url.endsWith('/approval')) {
      return Response.json({
        ok: true,
        approvalRequested: true,
        workspaceId: 'Abcdef1234',
        targetBranch: 'nexa/edit-Abcdef1234',
        baseHeadSha: 'a'.repeat(40),
        expiresAt: Date.now() + 600000
      });
    }
    if (call.url === '/api/v1/studio/workspaces/Abcdef1234') {
      return Response.json({
        ok: true,
        workspace: workspace('const remote = true;', 4),
        limits
      });
    }
    throw new Error(`Unexpected API route: ${call.method} ${call.url}`);
  };
  const { createRoot } = await import('react-dom/client');
  let root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => root.render(React.createElement(App, { fetcher })));
  async function remount() {
    await act(async () => root.unmount());
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => root.render(React.createElement(App, { fetcher })));
  }
  const buttons = () => [...dom.window.document.querySelectorAll('button')];
  async function click(label) {
    const button = buttons().find((entry) => entry.textContent.includes(label));
    assert.ok(button, `Button exists: ${label}`);
    assert.equal(button.disabled, false, `Button enabled: ${label}`);
    await act(async () => button.click());
  }
  async function edit(text) {
    const view = EditorView.findFromDOM(
      dom.window.document.querySelector('.cm-editor')
    );
    assert.ok(view, 'Real CodeMirror editor mounted');
    await act(async () =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      })
    );
  }
  async function input(label, value) {
    const element = dom.window.document.querySelector(
      `[aria-label="${label}"]`
    );
    assert.ok(element, `Input exists: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  }
  async function cleanup() {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
  return {
    dom,
    calls,
    click,
    edit,
    input,
    remount,
    cleanup,
    get closed() {
      return closed;
    }
  };
}

async function openEditor(ui) {
  await ui.click('hello');
  await ui.click('index.js');
}

test('refuses browser access outside Telegram without issuing authenticated requests', async () => {
  const ui = await setup({ telegram: false });
  try {
    assert.match(ui.dom.window.document.body.textContent, /تلگرام/);
    assert.equal(ui.calls.length, 0);
  } finally {
    await ui.cleanup();
  }
});

test('real repository → literal CodeMirror edits → diff → Telegram approval, never invented success', async () => {
  const ui = await setup();
  try {
    await openEditor(ui);
    assert.equal(ui.dom.window.document.querySelector('img'), null);
    assert.equal(ui.dom.window.pwned, undefined);
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /<img/
    );
    await ui.edit('const answer = 2;');
    await ui.click('ذخیره تغییرات');
    const save = ui.calls.find(
      (entry) => entry.method === 'PUT' && entry.url.endsWith('/files')
    );
    assert.deepEqual(save.body, {
      path: 'index.js',
      text: 'const answer = 2;'
    });
    assert.equal(save.headers.get('if-match'), '0');
    assert.ok(
      ui.calls.every(
        (entry) =>
          entry.headers.get('x-telegram-init-data') ===
          'opaque-signed-init-data'
      )
    );
    assert.deepEqual(Object.entries(ui.dom.window.localStorage), [
      ['nexa.studio.workspace', 'Abcdef1234']
    ]);
    assert.equal(ui.dom.window.location.search, '');
    await ui.click('بازبینی تغییرات');
    assert.match(
      ui.dom.window.document.querySelector('.diff-view').textContent,
      /const answer = 2/
    );
    assert.match(
      ui.dom.window.document.body.textContent,
      /nexa\/edit-Abcdef1234/
    );
    await ui.input('پیام Commit', 'Update answer');
    await ui.click('درخواست تأیید امن');
    assert.match(ui.dom.window.document.body.textContent, /تلگرام/);
    assert.equal(
      ui.calls.filter((entry) => entry.url.endsWith('/approval')).length,
      1
    );
    assert.equal(
      ui.calls.filter((entry) => entry.url.endsWith('/message'))[0].body
        .message,
      'Update answer'
    );
    assert.equal(ui.closed, false);
    assert.doesNotMatch(
      ui.dom.window.document.body.textContent,
      /Commit با موفقیت ثبت شد/
    );
    assert.equal(ui.dom.window.document.querySelector('img'), null);
    await ui.click('بستن و رفتن به تلگرام');
    assert.equal(ui.closed, true);
  } finally {
    await ui.cleanup();
  }
});

test('409 requires an explicit conflict choice and another Save before retrying with the latest revision', async () => {
  let writes = 0;
  const ui = await setup({
    respond(call) {
      if (
        call.method === 'PUT' &&
        call.url.endsWith('/files') &&
        ++writes === 1
      ) {
        return {
          status: 409,
          body: { ok: false, error: 'نسخه تغییر کرده است.' }
        };
      }
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('my unsaved source');
    await ui.click('ذخیره تغییرات');
    assert.match(ui.dom.window.document.body.textContent, /بارگیری نسخه جدید/);
    await ui.click('نگه‌داشتن نسخه من');
    assert.equal(writes, 1);
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /my unsaved source/
    );
    await ui.click('ذخیره تغییرات');
    assert.equal(writes, 2);
    const last = ui.calls
      .filter((entry) => entry.method === 'PUT' && entry.url.endsWith('/files'))
      .at(-1);
    assert.equal(last.headers.get('if-match'), '4');
    assert.equal(last.body.text, 'my unsaved source');
  } finally {
    await ui.cleanup();
  }
});

test('unsaved navigation needs an explicit discard and server UTF-8 limits disable saving', async () => {
  const ui = await setup({
    respond(call) {
      if (call.url === '/api/v1/studio/workspaces' && call.method === 'POST') {
        return {
          body: {
            ok: true,
            workspace: workspace('a'),
            limits: { ...limits, maxBytes: 5 }
          }
        };
      }
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('سلام');
    const save = [...ui.dom.window.document.querySelectorAll('button')].find(
      (entry) => entry.textContent.includes('ذخیره تغییرات')
    );
    assert.equal(save.disabled, true);
    assert.match(ui.dom.window.document.body.textContent, /سقف/);
    await ui.click('بازگشت به فایل‌ها');
    assert.ok(ui.dom.window.document.querySelector('[role="dialog"]'));
    await ui.click('ادامه ویرایش');
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /سلام/
    );
    assert.equal(ui.calls.filter((entry) => entry.method === 'PUT').length, 0);
  } finally {
    await ui.cleanup();
  }
});

test('adding a file keeps unsaved tabs and uses the pinned workspace tree', async () => {
  const ui = await setup({
    respond(call) {
      if (call.url.includes('/tree?') && call.url.includes('workspaceId=')) {
        return {
          body: {
            ok: true,
            repository,
            path: '',
            items: [
              {
                refId: 'FileRef123',
                name: 'index.js',
                path: 'index.js',
                type: 'file',
                size: 3
              },
              {
                refId: 'OtherRef12',
                name: 'other.ts',
                path: 'other.ts',
                type: 'file',
                size: 4
              }
            ]
          }
        };
      }
      if (call.url.endsWith('/files') && call.method === 'POST') {
        return {
          body: {
            ok: true,
            workspace: {
              ...workspace(),
              files: [
                ...workspace().files,
                {
                  path: 'other.ts',
                  draftText: 'export const next = 1;',
                  revision: 0
                }
              ]
            },
            limits
          }
        };
      }
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('const localOnly = true;');
    await ui.click('افزودن فایل');
    const tree = ui.calls.find((entry) => entry.url.includes('workspaceId='));
    assert.equal(
      new URL(tree.url, 'https://studio.example').searchParams.get(
        'workspaceId'
      ),
      'Abcdef1234'
    );
    await ui.click('other.ts');
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /export const next/
    );
    await ui.click('index.js');
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /const localOnly = true/
    );
    assert.equal(
      ui.dom.window.document.querySelectorAll('[role="tab"]').length,
      2
    );
    assert.equal(ui.calls.filter((entry) => entry.method === 'PUT').length, 0);
    assert.deepEqual(
      ui.calls.find(
        (entry) => entry.method === 'POST' && entry.url.endsWith('/files')
      ).body,
      { refId: 'OtherRef12' }
    );
  } finally {
    await ui.cleanup();
  }
});

test('initial provider failure offers a real retry and empty repositories can reload', async () => {
  let reads = 0;
  const ui = await setup({
    respond(call) {
      if (call.url === '/api/v1/studio/repos') {
        reads += 1;
        if (reads === 1)
          return {
            status: 503,
            body: {
              ok: false,
              error: 'دریافت مخازن انجام نشد. دوباره تلاش کن.'
            }
          };
        if (reads === 2) return { body: { ok: true, repositories: [] } };
      }
    }
  });
  try {
    assert.match(
      ui.dom.window.document.querySelector('[role="alert"]').textContent,
      /دریافت مخازن/
    );
    await ui.click('تلاش دوباره');
    assert.match(
      ui.dom.window.document.body.textContent,
      /مخزنی برای نمایش نیست/
    );
    await ui.click('دریافت دوباره مخازن');
    await ui.click('hello');
    assert.equal(reads, 3);
    assert.match(ui.dom.window.document.body.textContent, /index.js/);
  } finally {
    await ui.cleanup();
  }
});

test('loading the latest conflict version discards only by explicit choice without a write', async () => {
  const ui = await setup({
    respond(call) {
      if (call.method === 'PUT' && call.url.endsWith('/files'))
        return {
          status: 409,
          body: { ok: false, error: 'نسخه تغییر کرده است.' }
        };
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('local change');
    await ui.click('ذخیره تغییرات');
    await ui.click('بارگیری نسخه جدید');
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /const remote = true/
    );
    assert.equal(ui.calls.filter((entry) => entry.method === 'PUT').length, 1);
    const save = [...ui.dom.window.document.querySelectorAll('button')].find(
      (entry) => entry.textContent.includes('ذخیره تغییرات')
    );
    assert.equal(save.disabled, true);
  } finally {
    await ui.cleanup();
  }
});

test('a committed result appears only after an actual workspace refresh confirms it', async () => {
  const ui = await setup({
    respond(call) {
      if (
        call.url === '/api/v1/studio/workspaces/Abcdef1234' &&
        call.method === 'GET'
      ) {
        return {
          body: {
            ok: true,
            workspace: {
              ...workspace('const answer = 2;', 1),
              state: 'COMMITTED',
              result: {
                commitSha: 'b'.repeat(40),
                branch: 'nexa/edit-Abcdef1234'
              }
            },
            limits
          }
        };
      }
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('const answer = 2;');
    await ui.click('ذخیره تغییرات');
    await ui.click('بازبینی تغییرات');
    await ui.input('پیام Commit', 'Update answer');
    await ui.click('درخواست تأیید امن');
    assert.equal(ui.dom.window.document.querySelector('.result-link'), null);
    await ui.click('بررسی نتیجه');
    const result = ui.dom.window.document.querySelector('.result-link');
    assert.equal(
      result.href,
      `https://github.com/owner/hello/commit/${'b'.repeat(40)}`
    );
    assert.match(ui.dom.window.document.body.textContent, /Commit ثبت شد/);
  } finally {
    await ui.cleanup();
  }
});

test('Escape dismisses the unsaved navigation dialog and keeps the local draft', async () => {
  const ui = await setup();
  try {
    await openEditor(ui);
    await ui.edit('keep this draft');
    await ui.click('بازگشت به فایل‌ها');
    await act(async () =>
      ui.dom.window.document.dispatchEvent(
        new ui.dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true
        })
      )
    );
    assert.equal(
      !!ui.dom.window.document.querySelector('[role="dialog"]'),
      false
    );
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /keep this draft/
    );
  } finally {
    await ui.cleanup();
  }
});

test('approval binds the displayed diff even when message response contains a newer unseen file', async () => {
  const ui = await setup({
    respond(call) {
      if (call.url.endsWith('/message')) {
        return {
          body: {
            ok: true,
            workspace: {
              ...workspace('UNREVIEWED REMOTE CHANGE', 4),
              commitMessage: call.body.message
            },
            limits
          }
        };
      }
      if (call.url.endsWith('/approval')) {
        return {
          status: 409,
          body: {
            ok: false,
            error: 'نسخه فایل تغییر کرده است. آخرین نسخه را باز کنید.'
          }
        };
      }
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('const answer = 2;');
    await ui.click('ذخیره تغییرات');
    await ui.click('بازبینی تغییرات');
    await ui.input('پیام Commit', 'Update answer');
    await ui.click('درخواست تأیید امن');
    const requested = ui.calls.find((entry) => entry.url.endsWith('/approval'));
    assert.deepEqual(requested.body, {
      message: 'Update answer',
      review: {
        baseHeadSha: 'a'.repeat(40),
        files: [{ path: 'index.js', revision: 1 }]
      }
    });
    assert.doesNotMatch(
      ui.dom.window.document.body.textContent,
      /درخواست تأیید به تلگرام فرستاده شد/
    );
    const approvalButton = [
      ...ui.dom.window.document.querySelectorAll('button')
    ].find((entry) => entry.textContent.includes('درخواست تأیید امن'));
    assert.equal(approvalButton.disabled, true);
    assert.match(
      ui.dom.window.document.body.textContent,
      /بارگیری و بازبینی تازه/
    );
    await ui.click('بارگیری و بازبینی تازه');
    assert.equal(
      ui.calls.filter((entry) => entry.url.endsWith('/approval')).length,
      1
    );
    assert.equal(
      ui.calls.filter((entry) => entry.url.endsWith('/diff')).length,
      2
    );
    assert.ok(
      ui.calls.some(
        (entry) =>
          entry.url === '/api/v1/studio/workspaces/Abcdef1234' &&
          entry.method === 'GET'
      )
    );
  } finally {
    await ui.cleanup();
  }
});

function twoFiles(
  a = 'original A',
  aRevision = 0,
  b = 'original B',
  bRevision = 0
) {
  return {
    ...workspace(a, aRevision),
    files: [
      { path: 'index.js', draftText: a, revision: aRevision },
      { path: 'other.ts', draftText: b, revision: bRevision }
    ]
  };
}

for (const operation of ['save', 'add', 'resolve']) {
  test(`${operation} keeps the unseen file baseline and requires its original revision on the next save`, async () => {
    let writes = 0;
    const ui = await setup({
      respond(call) {
        if (call.url === '/api/v1/studio/workspaces' && call.method === 'POST')
          return { body: { ok: true, workspace: twoFiles(), limits } };
        if (call.url.includes('/tree?') && call.url.includes('workspaceId='))
          return {
            body: {
              ok: true,
              path: '',
              items: [
                {
                  refId: 'ThirdRef12',
                  name: 'third.js',
                  path: 'third.js',
                  type: 'file',
                  size: 1
                }
              ]
            }
          };
        if (call.url.endsWith('/files') && call.method === 'POST')
          return {
            body: {
              ok: true,
              workspace: {
                ...twoFiles('original A', 0, 'unseen remote B', 7),
                files: [
                  ...twoFiles('original A', 0, 'unseen remote B', 7).files,
                  { path: 'third.js', draftText: 'third', revision: 0 }
                ]
              },
              limits
            }
          };
        if (call.url.endsWith('/files') && call.method === 'PUT') {
          writes += 1;
          if (operation === 'resolve' && writes === 1)
            return {
              status: 409,
              body: { ok: false, error: 'نسخه تغییر کرده است.' }
            };
          if (call.body.path === 'other.ts')
            return {
              status: 409,
              body: { ok: false, error: 'نسخه تغییر کرده است.' }
            };
          return {
            body: {
              ok: true,
              workspace: twoFiles(call.body.text, 1, 'unseen remote B', 7),
              limits
            }
          };
        }
        if (call.url === '/api/v1/studio/workspaces/Abcdef1234')
          return {
            body: {
              ok: true,
              workspace: twoFiles('remote A', 3, 'unseen remote B', 7),
              limits
            }
          };
      }
    });
    try {
      await openEditor(ui);
      if (operation === 'add') {
        await ui.click('افزودن فایل');
        await ui.click('third.js');
      } else {
        await ui.edit('local A');
        await ui.click('ذخیره تغییرات');
        if (operation === 'resolve') await ui.click('نگه‌داشتن نسخه من');
      }
      await ui.click('other.ts');
      assert.match(
        ui.dom.window.document.querySelector('.cm-editor').textContent,
        /original B/
      );
      await ui.edit('my B change');
      await ui.click('ذخیره تغییرات');
      const saveB = ui.calls.find(
        (call) => call.method === 'PUT' && call.body.path === 'other.ts'
      );
      assert.equal(
        saveB.headers.get('if-match'),
        '0',
        'Never silently adopt an unseen remote revision'
      );
      assert.match(
        ui.dom.window.document.body.textContent,
        /بارگیری نسخه جدید/
      );
    } finally {
      await ui.cleanup();
    }
  });
}

test('approval compares the exact displayed message when another session changes only the message', async () => {
  const ui = await setup({
    respond(call) {
      if (call.url.endsWith('/message'))
        return {
          body: {
            ok: true,
            workspace: {
              ...workspace('const answer = 2;', 1),
              commitMessage: 'unseen remote message'
            },
            limits
          }
        };
      if (call.url.endsWith('/approval'))
        return {
          status: 409,
          body: {
            ok: false,
            error: 'پیام تغییر کرده است. دوباره بازبینی کنید.'
          }
        };
    }
  });
  try {
    await openEditor(ui);
    await ui.edit('const answer = 2;');
    await ui.click('ذخیره تغییرات');
    await ui.click('بازبینی تغییرات');
    await ui.input('پیام Commit', '  My reviewed message  ');
    await ui.click('درخواست تأیید امن');
    const request = ui.calls.find((call) => call.url.endsWith('/approval'));
    assert.equal(request.body.message, 'My reviewed message');
    assert.deepEqual(request.body.review.files, [
      { path: 'index.js', revision: 1 }
    ]);
    assert.equal(
      ui.dom.window.document.querySelector('[aria-label="پیام Commit"]').value,
      '  My reviewed message  '
    );
    assert.doesNotMatch(
      ui.dom.window.document.body.textContent,
      /درخواست تأیید به تلگرام فرستاده شد/
    );
    assert.match(
      ui.dom.window.document.body.textContent,
      /بارگیری و بازبینی تازه/
    );
  } finally {
    await ui.cleanup();
  }
});

test('remount restores only the opaque handle and continues with fresh server draft content', async () => {
  const ui = await setup();
  try {
    await openEditor(ui);
    await ui.edit('unsaved source must disappear');
    assert.deepEqual(Object.entries(ui.dom.window.localStorage), [
      ['nexa.studio.workspace', 'Abcdef1234']
    ]);
    await ui.remount();
    assert.equal(ui.dom.window.document.querySelector('.cm-editor'), null);
    assert.ok(
      ui.calls.some(
        (call) =>
          call.url.endsWith('/workspaces/Abcdef1234') && call.method === 'GET'
      )
    );
    await ui.click('ادامه فضای کاری');
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /const remote = true/
    );
    assert.doesNotMatch(
      ui.dom.window.document.body.textContent,
      /unsaved source must disappear/
    );
  } finally {
    await ui.cleanup();
  }
});

for (const state of ['READY', 'COMMITTED']) {
  test(`remounted ${state} workspace uses fresh evidence before review or a committed result`, async () => {
    let resumed = false;
    const ui = await setup({
      respond(call) {
        if (resumed && call.url === '/api/v1/studio/workspaces/Abcdef1234')
          return {
            body: {
              ok: true,
              workspace: {
                ...workspace('const answer = 2;', 1),
                state,
                commitMessage: 'Saved message',
                ...(state === 'COMMITTED'
                  ? {
                      result: {
                        commitSha: 'b'.repeat(40),
                        branch: 'nexa/edit-Abcdef1234'
                      }
                    }
                  : {})
              },
              limits
            }
          };
      }
    });
    try {
      await openEditor(ui);
      await ui.edit('const answer = 2;');
      await ui.click('ذخیره تغییرات');
      await ui.click('بازبینی تغییرات');
      await ui.input('پیام Commit', 'Saved message');
      await ui.click('درخواست تأیید امن');
      await ui.click('بستن و رفتن به تلگرام');
      resumed = true;
      await ui.remount();
      assert.equal(ui.dom.window.document.querySelector('.result-link'), null);
      assert.doesNotMatch(
        ui.dom.window.document.body.textContent,
        /درخواست تأیید به تلگرام فرستاده شد/
      );
      const approvals = ui.calls.filter((call) =>
        call.url.endsWith('/approval')
      ).length;
      const diffs = ui.calls.filter((call) =>
        call.url.endsWith('/diff')
      ).length;
      await ui.click('ادامه فضای کاری');
      assert.equal(
        ui.calls.filter((call) => call.url.endsWith('/approval')).length,
        approvals
      );
      if (state === 'COMMITTED') {
        assert.equal(
          ui.dom.window.document.querySelector('.result-link').href,
          `https://github.com/owner/hello/commit/${'b'.repeat(40)}`
        );
      } else {
        assert.equal(
          ui.calls.filter((call) => call.url.endsWith('/diff')).length,
          diffs + 1
        );
        assert.equal(
          ui.dom.window.document.querySelector('[aria-label="پیام Commit"]')
            .value,
          'Saved message'
        );
        assert.doesNotMatch(
          ui.dom.window.document.body.textContent,
          /درخواست تأیید به تلگرام فرستاده شد/
        );
        await ui.click('بازگشت به ویرایشگر');
        await ui.click('بازبینی تغییرات');
        await ui.click('درخواست تأیید امن');
        assert.equal(
          ui.calls.filter((call) => call.url.endsWith('/approval')).length,
          approvals + 1
        );
      }
    } finally {
      await ui.cleanup();
    }
  });
}

for (const mode of ['invalid', 'expired', 'forbidden', 'nonowner', 'outside']) {
  test(`stored workspace recovery handles ${mode} without retaining an invalid session`, async () => {
    const ui = await setup({
      telegram: mode !== 'outside',
      stored: {
        'nexa.studio.workspace':
          mode === 'invalid' ? 'not/a/handle' : 'Abcdef1234'
      },
      respond(call) {
        if (mode === 'nonowner' && call.url === '/api/v1/studio')
          return {
            status: 403,
            body: { ok: false, error: 'دسترسی مجاز نیست.' }
          };
        if (
          ['expired', 'forbidden'].includes(mode) &&
          call.url.endsWith('/workspaces/Abcdef1234')
        )
          return {
            status: mode === 'expired' ? 404 : 403,
            body: { ok: false, error: 'فضای کار منقضی شده است.' }
          };
      }
    });
    try {
      if (mode === 'outside') assert.equal(ui.calls.length, 0);
      else
        assert.equal(
          ui.dom.window.localStorage.getItem('nexa.studio.workspace'),
          null
        );
      if (mode === 'nonowner' || mode === 'invalid')
        assert.equal(
          ui.calls.some((call) => call.url.includes('/workspaces/')),
          false
        );
      assert.doesNotMatch(
        ui.dom.window.document.body.textContent,
        /ادامه فضای کاری/
      );
    } finally {
      await ui.cleanup();
    }
  });
}

test('cancel clears the saved handle and unavailable local storage never breaks editing', async () => {
  for (const storageUnavailable of [false, true]) {
    const ui = await setup({
      storageUnavailable,
      respond(call) {
        if (call.method === 'DELETE')
          return { body: { ok: true, cancelled: true } };
      }
    });
    try {
      await openEditor(ui);
      await ui.edit('a real edit');
      await ui.click('ذخیره تغییرات');
      await ui.click('لغو فضای کاری');
      await ui.click('کنار گذاشتن و ادامه');
      assert.equal(
        ui.calls.filter((call) => call.method === 'DELETE').length,
        1
      );
      assert.doesNotMatch(
        ui.dom.window.document.body.textContent,
        /ادامه فضای کاری/
      );
      if (!storageUnavailable)
        assert.equal(
          ui.dom.window.localStorage.getItem('nexa.studio.workspace'),
          null
        );
    } finally {
      await ui.cleanup();
    }
  }
});

test('a temporary recovery failure keeps the handle and retries against the server', async () => {
  let reads = 0;
  const ui = await setup({
    stored: { 'nexa.studio.workspace': 'Abcdef1234' },
    respond(call) {
      if (call.url.endsWith('/workspaces/Abcdef1234') && ++reads === 1)
        return {
          status: 503,
          body: { ok: false, error: 'سرویس موقتاً در دسترس نیست.' }
        };
    }
  });
  try {
    assert.equal(
      ui.dom.window.localStorage.getItem('nexa.studio.workspace'),
      'Abcdef1234'
    );
    assert.match(
      ui.dom.window.document.querySelector('[role="alert"]').textContent,
      /موقتاً/
    );
    await ui.click('تلاش دوباره');
    await ui.click('ادامه فضای کاری');
    assert.equal(reads, 3);
    assert.match(
      ui.dom.window.document.querySelector('.cm-editor').textContent,
      /const remote = true/
    );
  } finally {
    await ui.cleanup();
  }
});
