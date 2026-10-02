import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("/diag replies with sender id and authorization state before owner gate", async () => {
  const req = new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "right",
    },
    body: JSON.stringify({
      message: { text: "/diag", from: { id: 999 }, chat: { id: 999 } },
    }),
  });

  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const res = await worker.fetch(req, {
    TELEGRAM_WEBHOOK_SECRET: "right",
    OWNER_TELEGRAM_ID: "123",
    TELEGRAM_BOT_TOKEN: "token",
  });

  assert.equal(res.status, 200);
  assert.equal(sent.url, "https://api.telegram.org/bottoken/sendMessage");
  assert.match(sent.body.text, /999/);
  assert.match(sent.body.text, /unauthorized/i);
});
