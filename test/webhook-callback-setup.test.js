import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("temporary setup registers callback_query updates with Telegram", async () => {
  const req = new Request("https://nexa-dev-bot.example.workers.dev/telegram/setup", {
    method: "GET",
  });

  let captured;
  globalThis.fetch = async (url, init) => {
    captured = {
      url: String(url),
      body: JSON.parse(init.body),
    };
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const res = await worker.fetch(req, {
    TELEGRAM_WEBHOOK_SECRET: "secret",
    TELEGRAM_BOT_TOKEN: "token",
  });

  assert.equal(res.status, 200);
  assert.equal(captured.url, "https://api.telegram.org/bottoken/setWebhook");
  assert.deepEqual(captured.body, {
    url: "https://nexa-dev-bot.example.workers.dev/telegram/webhook",
    secret_token: "secret",
    allowed_updates: ["message", "callback_query"],
  });
});
