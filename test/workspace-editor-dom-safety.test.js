import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderWorkspaceEditorPage } from '../src/workspace-editor.js';

// These doubles exercise the rendered script's DOM/API boundaries, not HTML parsing.
function element(tagName) {
  const listeners = new Map();
  let value;
  return {
    children: [],
    textContent: '',
    className: '',
    disabled: true,
    get value() {
      if (tagName === 'select')
        return (
          this.children.find((option) => option.value === value)?.value || ''
        );
      return value ?? (tagName === 'option' ? this.textContent : '');
    },
    set value(next) {
      value = String(next);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type) {
      assert.ok(listeners.has(type), `missing ${type} listener`);
      await listeners.get(type)();
    }
  };
}

async function bootEditor(workspace, search = '?workspaceId=W000000001') {
  const elements = Object.fromEntries(
    ['editor', 'status', 'path', 'files', 'counter', 'save', 'close'].map(
      (id) => [id, element(id === 'files' ? 'select' : id)]
    )
  );
  const requests = [];
  const location = { search };
  // Both load success and failure display status. Await that observable completion,
  // rather than sleeping or guessing how many promise microtasks need draining.
  let displayStatus;
  const loaded = new Promise((resolve) => {
    displayStatus = resolve;
  });
  let statusClassName = '';
  Object.defineProperty(elements.status, 'className', {
    get: () => statusClassName,
    set(value) {
      statusClassName = value;
      displayStatus();
    }
  });
  const script = renderWorkspaceEditorPage().match(
    /<script>\s*([\s\S]*?)<\/script>/
  )[1];
  vm.runInNewContext(script, {
    document: { getElementById: (id) => elements[id], createElement: element },
    window: {
      Telegram: {
        WebApp: { initData: 'signed telegram data', ready() {}, expand() {} }
      }
    },
    location,
    URLSearchParams,
    TextEncoder,
    async fetch(url, options) {
      requests.push({ url, ...JSON.parse(JSON.stringify(options)) });
      return {
        ok: true,
        status: 200,
        async json() {
          return options.method === 'PUT'
            ? {
                ok: true,
                workspace: {
                  id: 'W000000001',
                  path: workspace.path,
                  state: 'DRAFT'
                }
              }
            : { workspace, limits: { maxChars: 20000, maxBytes: 65536 } };
        }
      };
    }
  });
  await loaded;
  assert.equal(elements.editor.disabled, false, elements.status.textContent);
  assert.equal(elements.save.disabled, false, elements.status.textContent);
  return { elements, requests, location };
}

const quoted = 'src/owner\'s "draft" & notes.md';
const entity = 'docs/&quot;&amp;&#39;&#x3C;.md';
const markup = 'docs/<img src=x onerror=alert(1)>.md';
const unicode = 'docs/راهنما-日本語-🧪.md';
const filenames = [quoted, entity, markup, unicode];
const workspace = {
  id: 'W000000001',
  path: entity,
  files: filenames.map((path) => ({ path })),
  state: 'DRAFT',
  baseHeadSha: 'abcdef1234',
  draftText: '# existing draft\n'
};

test('editor preserves exact option labels and values for repository-controlled filenames', async () => {
  const { elements, requests } = await bootEditor(
    workspace,
    '?workspaceId=W000000001&path=docs%2F%26quot%3B%26amp%3B%26%2339%3B%26%23x3C%3B.md'
  );
  assert.equal(elements.files.children.length, 4);
  assert.deepEqual(
    elements.files.children.map((option) => option.textContent),
    filenames
  );
  assert.deepEqual(
    elements.files.children.map((option) => option.value),
    filenames
  );
  assert.equal(elements.files.value, entity);
  assert.equal(elements.path.textContent, entity);
  assert.equal(elements.editor.value, '# existing draft\n');
  assert.deepEqual(requests, [
    {
      url: '/workspace/api/editor?workspaceId=W000000001&path=docs%2F%26quot%3B%26amp%3B%26%2339%3B%26%23x3C%3B.md',
      headers: { 'x-telegram-init-data': 'signed telegram data' }
    }
  ]);
});

test('saving sends the selected literal filename and draft with Telegram authentication', async () => {
  const { elements, requests } = await bootEditor(workspace);
  elements.editor.value = '# edited & <literal> 🧪\n';
  await elements.save.dispatch('click');
  assert.equal(requests.length, 2);
  const saved = requests[1];
  assert.equal(saved.url, '/workspace/api/editor');
  assert.equal(saved.method, 'PUT');
  assert.deepEqual(saved.headers, {
    'content-type': 'application/json',
    'x-telegram-init-data': 'signed telegram data'
  });
  assert.deepEqual(JSON.parse(saved.body), {
    workspaceId: 'W000000001',
    path: 'docs/&quot;&amp;&#39;&#x3C;.md',
    text: '# edited & <literal> 🧪\n'
  });
  assert.equal(elements.status.className, 'status ok');
  assert.equal(elements.save.disabled, false);
});

test('legacy workspace without a files array exposes its one literal filename', async () => {
  const { elements } = await bootEditor({
    id: 'W000000001',
    path: 'legacy/&quot; & "draft".md',
    state: 'DRAFT',
    baseHeadSha: 'abcdef1234',
    draftText: 'legacy draft'
  });
  assert.equal(elements.files.children.length, 1);
  assert.equal(
    elements.files.children[0].textContent,
    'legacy/&quot; & "draft".md'
  );
  assert.equal(elements.files.children[0].value, 'legacy/&quot; & "draft".md');
  assert.equal(elements.files.value, 'legacy/&quot; & "draft".md');
  assert.equal(elements.editor.value, 'legacy draft');
});

test('changing files preserves special filenames through navigation and the next load', async () => {
  const first = await bootEditor(
    workspace,
    '?workspaceId=W000000001&source=telegram'
  );
  for (const filename of filenames) {
    first.elements.files.value = filename;
    await first.elements.files.dispatch('change');
    const params = new URLSearchParams(first.location.search);
    assert.equal(params.get('path'), filename);
    assert.equal(params.get('workspaceId'), 'W000000001');
    assert.equal(params.get('source'), 'telegram');
    const next = await bootEditor(
      { ...workspace, path: filename },
      first.location.search
    );
    assert.equal(
      new URL(next.requests[0].url, 'https://example.test').searchParams.get(
        'path'
      ),
      filename
    );
    assert.equal(next.elements.files.value, filename);
    assert.equal(next.elements.path.textContent, filename);
  }
});

test('editor option construction avoids parser-dependent HTML interpolation', () => {
  const page = renderWorkspaceEditorPage();
  assert.doesNotMatch(page, /files\.innerHTML\s*=/);
  assert.doesNotMatch(page, /<option value=['\"][^\n]*file\.path/);
});
