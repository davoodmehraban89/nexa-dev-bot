import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NexaDevBot } from '../src/bot.js';

const fakeGitHub = {
  owner: 'davoodmehraban89',
  async listRepositories() {
    return [{ id: 'Factor-easy', name: 'Factor-easy', private: true }];
  },
  async getRepository(repo) {
    return {
      id: repo,
      name: repo,
      fullName: `davoodmehraban89/${repo}`,
      private: true,
      description: 'Factor-easy project',
      defaultBranch: 'main',
      archived: false
    };
  },
  async listPullRequests() {
    return [{
      number: 43,
      title: 'Ops: strengthen long-running execution heartbeat rule',
      author: 'davoodmehraban89',
      state: 'open',
      merged: false
    }];
  },
  async listCommits() {
    return [];
  },
  async listFiles() {
    return [];
  },
  async getRepoStatus() {
    return { defaultBranch: 'main', lastRuns: [] };
  }
};

function makeBot() {
  const bot = new NexaDevBot();
  bot.menu.github = fakeGitHub;
  return bot;
}

describe('Nexa Dev Bot - Webhook Dispatcher & In-Place Editing', () => {
  it('/start sends one new message with Main Menu', async () => {
    const sentMessages = [];
    const bot = makeBot();
    bot.telegram.sendMessage = async (chatId, text, replyMarkup) => {
      sentMessages.push({ chatId, text, replyMarkup });
      return { ok: true, result: { message_id: 501 } };
    };

    const res = await bot.handleUpdate({
      message: { message_id: 100, chat: { id: 123456 }, text: '/start' }
    });

    assert.equal(res.ok, true);
    assert.equal(res.command, 'start');
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].chatId, 123456);
    assert.match(sentMessages[0].text, /Nexa Dev Bot/);
    assert.ok(sentMessages[0].replyMarkup.inline_keyboard);
  });

  it('callback answers Telegram and edits the existing message in place', async () => {
    const answeredCallbacks = [];
    const editedMessages = [];
    const sentMessages = [];
    const bot = makeBot();

    bot.telegram.answerCallbackQuery = async (id) => {
      answeredCallbacks.push(id);
      return { ok: true };
    };
    bot.telegram.editMessageText = async (chatId, messageId, text, replyMarkup) => {
      editedMessages.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    };
    bot.telegram.sendMessage = async () => {
      sentMessages.push(true);
      return { ok: true };
    };

    const res = await bot.handleUpdate({
      callback_query: {
        id: 'cb_999',
        data: 'menu:repos',
        message: { message_id: 501, chat: { id: 123456 } }
      }
    });

    assert.equal(res.ok, true);
    assert.equal(res.edited, true);
    assert.deepEqual(answeredCallbacks, ['cb_999']);
    assert.equal(editedMessages.length, 1);
    assert.equal(sentMessages.length, 0);
    assert.equal(editedMessages[0].messageId, 501);
    assert.match(editedMessages[0].text, /فهرست مخزن‌ها/);
  });

  it('multi-tier back navigation stays on the same Telegram message', async () => {
    const edits = [];
    const bot = makeBot();
    bot.telegram.answerCallbackQuery = async () => ({ ok: true });
    bot.telegram.editMessageText = async (chatId, messageId, text, replyMarkup) => {
      edits.push({ chatId, messageId, text, replyMarkup });
      return { ok: true };
    };

    const message = { message_id: 501, chat: { id: 123456 } };
    for (const data of ['repo:Factor-easy', 'pr:Factor-easy', 'repo:Factor-easy', 'menu:repos', 'menu:main']) {
      const result = await bot.handleUpdate({
        callback_query: { id: data, data, message }
      });
      assert.equal(result.ok, true);
    }

    assert.equal(edits.length, 5);
    assert.ok(edits.every(edit => edit.messageId === 501));
    assert.match(edits[0].text, /پروژه: Factor-easy/);
    assert.match(edits[1].text, /#43/);
    assert.match(edits[3].text, /فهرست مخزن‌ها/);
    assert.match(edits[4].text, /Nexa Dev Bot/);
  });
});
