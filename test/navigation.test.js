import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  TELEGRAM_WEBHOOK_SECRET: "right",
  OWNER_TELEGRAM_ID: "123",
  TELEGRAM_BOT_TOKEN: "token",
  GITHUB_TOKEN: "gh-token",
};

function webhook(update) {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "right",
    },
    body: JSON.stringify(update),
  });
}

function telegramOk() {
  return new Response(JSON.stringify({ ok: true, result: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("/repos renders repositories as tappable inline buttons", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes("api.github.com/user/repos")) {
      return new Response(JSON.stringify([
        { id: 101, full_name: "davood/demo", name: "demo", private: true, default_branch: "main" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    calls.push({ url: u, body: options.body ? JSON.parse(options.body) : null });
    return telegramOk();
  };

  const res = await worker.fetch(webhook({
    message: { text: "/repos", from: { id: 123 }, chat: { id: 123 } },
  }), env);

  assert.equal(res.status, 200);
  const sent = calls.find((c) => c.url.includes("sendMessage"));
  assert.ok(sent);
  assert.equal(sent.body.reply_markup.inline_keyboard[0][0].text, "🔒 demo");
  assert.equal(sent.body.reply_markup.inline_keyboard[0][0].callback_data, "repo:101");
});

test("repository callback opens a mobile action menu", async () => {
  const telegramCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u === "https://api.github.com/repositories/101") {
      return new Response(JSON.stringify({
        id: 101,
        full_name: "davood/demo",
        private: true,
        default_branch: "main",
        description: "Demo repo",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    telegramCalls.push({ url: u, body: options.body ? JSON.parse(options.body) : null });
    return telegramOk();
  };

  const res = await worker.fetch(webhook({
    callback_query: {
      id: "cb1",
      from: { id: 123 },
      data: "repo:101",
      message: { chat: { id: 123 }, message_id: 50 },
    },
  }), env);

  assert.equal(res.status, 200);
  assert.ok(telegramCalls.some((c) => c.url.includes("answerCallbackQuery")));
  const sent = telegramCalls.find((c) => c.url.includes("sendMessage"));
  assert.match(sent.body.text, /davood\/demo/);
  const buttons = sent.body.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(buttons, ["files:101", "commits:101", "prs:101", "repos"]);
});

test("files callback lists folders and files using compact SHA callbacks", async () => {
  const telegramCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u === "https://api.github.com/repositories/101") {
      return new Response(JSON.stringify({ id: 101, full_name: "davood/demo", default_branch: "main" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.startsWith("https://api.github.com/repos/davood/demo/contents")) {
      return new Response(JSON.stringify([
        { name: "src", type: "dir", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { name: "README.md", type: "file", sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    telegramCalls.push({ url: u, body: options.body ? JSON.parse(options.body) : null });
    return telegramOk();
  };

  await worker.fetch(webhook({
    callback_query: {
      id: "cb2",
      from: { id: 123 },
      data: "files:101",
      message: { chat: { id: 123 }, message_id: 51 },
    },
  }), env);

  const sent = telegramCalls.find((c) => c.url.includes("sendMessage"));
  const buttons = sent.body.reply_markup.inline_keyboard.flat();
  assert.equal(buttons[0].text, "📁 src");
  assert.equal(buttons[0].callback_data, "tree:101:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(buttons[1].text, "📄 README.md");
  assert.equal(buttons[1].callback_data, "blob:101:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});

test("blob callback shows escaped text content and a back button", async () => {
  const telegramCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u === "https://api.github.com/repositories/101") {
      return new Response(JSON.stringify({ id: 101, full_name: "davood/demo", default_branch: "main" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u === "https://api.github.com/repos/davood/demo/git/blobs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
      const content = Buffer.from("<hello> & goodbye").toString("base64");
      return new Response(JSON.stringify({ encoding: "base64", content, size: 17 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    telegramCalls.push({ url: u, body: options.body ? JSON.parse(options.body) : null });
    return telegramOk();
  };

  await worker.fetch(webhook({
    callback_query: {
      id: "cb3",
      from: { id: 123 },
      data: "blob:101:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      message: { chat: { id: 123 }, message_id: 52 },
    },
  }), env);

  const sent = telegramCalls.find((c) => c.url.includes("sendMessage"));
  assert.match(sent.body.text, /&lt;hello&gt; &amp; goodbye/);
  assert.equal(sent.body.reply_markup.inline_keyboard.at(-1)[0].callback_data, "files:101");
});

test("commits and pull requests callbacks render concise repository activity", async () => {
  const sentTexts = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u === "https://api.github.com/repositories/101") {
      return new Response(JSON.stringify({ id: 101, full_name: "davood/demo", default_branch: "main" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/commits?")) {
      return new Response(JSON.stringify([{ sha: "1234567890", commit: { message: "fix mobile menu" }, author: { login: "davood" } }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/pulls?")) {
      return new Response(JSON.stringify([{ number: 7, title: "Improve bot UI", user: { login: "davood" } }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("sendMessage")) sentTexts.push(JSON.parse(options.body).text);
    return telegramOk();
  };

  for (const data of ["commits:101", "prs:101"]) {
    await worker.fetch(webhook({
      callback_query: { id: data, from: { id: 123 }, data, message: { chat: { id: 123 }, message_id: 53 } },
    }), env);
  }

  assert.ok(sentTexts.some((t) => t.includes("fix mobile menu")));
  assert.ok(sentTexts.some((t) => t.includes("#7") && t.includes("Improve bot UI")));
});

test("callback queries from non-owner users are ignored", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return telegramOk();
  };

  const res = await worker.fetch(webhook({
    callback_query: {
      id: "bad",
      from: { id: 999 },
      data: "repo:101",
      message: { chat: { id: 999 }, message_id: 1 },
    },
  }), env);

  assert.equal(res.status, 200);
  assert.equal(calls, 0);
});