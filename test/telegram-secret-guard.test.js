import test from 'node:test';
import assert from 'node:assert/strict';
import { KillSwitchGuidedNexaDevBot } from '../src/kill-switch-bot.js';

const OWNER = '42';
const syntheticToken = (prefix) => `${prefix}synthetic_noncredential_fixture`;
const ownerMessage = (text, extra = {}) => ({
  message_id: 17,
  from: { id: Number(OWNER) },
  chat: { id: Number(OWNER), type: 'private' },
  text,
  ...extra
});

function guardedBot({ ownerId = OWNER, failures = {} } = {}) {
  const bot = new KillSwitchGuidedNexaDevBot({
    OWNER_TELEGRAM_ID: ownerId,
    TELEGRAM_BOT_TOKEN: 'synthetic-bot-credential'
  });
  const effects = [];
  bot.telegram.fetchFn = async (url, options) => {
    const method = new URL(url).pathname.split('/').at(-1);
    const payload = JSON.parse(options.body);
    effects.push({ method, payload });
    if (failures[method]) throw new Error(failures[method]);
    return Response.json({
      ok: true,
      result: method === 'sendMessage' ? { message_id: 18 } : true
    });
  };
  return { bot, effects };
}

test('all GitHub token prefixes delete the message before a Persian revocation warning', async (t) => {
  for (const prefix of [
    'github_pat_',
    'ghp_',
    'gho_',
    'ghu_',
    'ghs_',
    'ghr_'
  ]) {
    await t.test(prefix, async () => {
      const { bot, effects } = guardedBot();
      const text = syntheticToken(prefix);
      const result = await bot.handleUpdate({ message: ownerMessage(text) });

      assert.equal(result.secretRejected, true);
      assert.deepEqual(
        effects.map(({ method }) => method),
        ['deleteMessage', 'sendMessage']
      );
      assert.deepEqual(effects[0].payload, { chat_id: 42, message_id: 17 });
      assert.match(effects[1].payload.text, /توکن در چت قرار گرفت/);
      assert.match(effects[1].payload.text, /باید در GitHub باطل شود/);
      assert.match(
        effects[1].payload.text,
        /https:\/\/github\.com\/settings\//
      );
      assert.equal(JSON.stringify({ effects, result }).includes(text), false);
      assert.equal(result.deleted, true);
      assert.equal(result.warned, true);
    });
  }
});

test('token interception precedes pending workspace reads, file download, routing and audit', async () => {
  const { bot, effects } = guardedBot();
  const reached = [];
  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput() {
      reached.push('pending');
      return { workspaceId: 'W000000001', mode: 'draft_file' };
    }
  };
  bot.telegram.downloadTextFile = async () => {
    reached.push('download');
    return { text: 'safe fixture', byteLength: 12 };
  };
  bot.router.dispatchMessage = async () => {
    reached.push('dispatch');
    return { text: 'generic response' };
  };
  bot.audit.log = () => reached.push('audit');

  const result = await bot.handleUpdate({
    message: ownerMessage(`  \n${syntheticToken('github_pat_')}`, {
      document: { file_id: 'synthetic-file', file_size: 12 }
    })
  });

  assert.deepEqual(reached, []);
  assert.equal(result.secretRejected, true);
  assert.equal(effects.length, 2);
});

test('direct message handling also rejects tokens before pending input', async () => {
  const { bot } = guardedBot();
  let pendingReads = 0;
  bot.workspaceStore = {
    isConfigured: () => true,
    async getPendingInput() {
      pendingReads++;
      return null;
    }
  };

  const result = await bot.handleMessage(ownerMessage(syntheticToken('ghp_')));

  assert.equal(pendingReads, 0);
  assert.equal(result.secretRejected, true);
});

test('edited token messages are intercepted before the generic message dispatcher', async () => {
  const { bot, effects } = guardedBot();
  let dispatched = false;
  bot.handleMessage = async () => {
    dispatched = true;
    return { ok: true, generic: true };
  };

  const result = await bot.handleUpdate({
    edited_message: ownerMessage(syntheticToken('gho_'))
  });

  assert.equal(result.secretRejected, true);
  assert.equal(dispatched, false);
  assert.deepEqual(
    effects.map(({ method }) => method),
    ['deleteMessage', 'sendMessage']
  );
});

test('document captions beginning with a token are rejected before upload processing', async () => {
  const { bot, effects } = guardedBot();
  const result = await bot.handleUpdate({
    message: ownerMessage(undefined, {
      caption: syntheticToken('ghs_'),
      document: { file_id: 'synthetic-file', file_size: 12 }
    })
  });

  assert.equal(result.secretRejected, true);
  assert.equal(effects[0].method, 'deleteMessage');
});

test('a failed delete still warns without claiming deletion or echoing a raw provider error', async () => {
  const text = syntheticToken('github_pat_');
  const { bot, effects } = guardedBot({
    failures: { deleteMessage: `provider included ${text}` }
  });
  const result = await bot.handleUpdate({ message: ownerMessage(text) });

  assert.equal(result.secretRejected, true);
  assert.equal(result.deleted, false);
  assert.equal(result.warned, true);
  assert.equal(effects[1].method, 'sendMessage');
  assert.match(effects[1].payload.text, /حذف.*تأیید نشد/);
  assert.equal(JSON.stringify({ effects, result }).includes(text), false);
});

test('warning failures return only metadata and never fall back to a generic handler', async () => {
  const text = syntheticToken('ghu_');
  const { bot, effects } = guardedBot({
    failures: { sendMessage: `provider included ${text}` }
  });
  let dispatched = false;
  bot.handleMessage = async () => {
    dispatched = true;
    return { ok: true };
  };
  const result = await bot.handleUpdate({ message: ownerMessage(text) });

  assert.equal(result.secretRejected, true);
  assert.equal(result.warned, false);
  assert.equal(result.deleted, true);
  assert.equal(dispatched, false);
  assert.equal(JSON.stringify({ effects, result }).includes(text), false);
});

test('secret messages cannot cross the configured owner boundary or run without an owner', async () => {
  for (const ownerId of [OWNER, '']) {
    const { bot, effects } = guardedBot({ ownerId });
    const result = await bot.handleUpdate({
      message: ownerMessage(syntheticToken('ghr_'), { from: { id: 99 } })
    });
    assert.equal(result.ignored, true);
    assert.deepEqual(effects, []);
  }
});

test('ordinary messages keep their existing dispatch and ordinary edits remain ignored', async () => {
  const { bot, effects } = guardedBot();
  const ordinary = await bot.handleUpdate({ message: ownerMessage('/help') });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.secretRejected, undefined);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].method, 'sendMessage');

  const edited = await bot.handleUpdate({
    edited_message: ownerMessage('/help')
  });
  assert.deepEqual(edited, { ok: true, ignored: true });
  assert.equal(effects.length, 1);
});
