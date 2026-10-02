const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const text = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

async function telegramApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function sendMessage(env, chatId, message, extra = {}) {
  return telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

function isOwner(env, from) {
  if (!from || !env.OWNER_TELEGRAM_ID) return false;
  return String(from.id) === String(env.OWNER_TELEGRAM_ID);
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nexa-dev-bot",
  };
}

async function fetchRepos(env) {
  const response = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=20&affiliation=owner,collaborator,organization_member",
    { headers: githubHeaders(env) }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub repos failed: ${response.status} ${body}`);
  }

  return response.json();
}

function startMessage() {
  return [
    "<b>Nexa Dev</b>",
    "دستیار شخصی توسعه و مدیریت GitHub از داخل تلگرام.",
    "",
    "فرمان‌های نسخه اول:",
    "/repos — نمایش مخزن‌های قابل دسترس",
    "/status — وضعیت سرویس",
  ].join("\n");
}

async function handleCommand(env, message) {
  const chatId = message.chat?.id;
  const command = (message.text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();

  // Personal bot: fail silently for every Telegram user except the owner.
  if (!isOwner(env, message.from)) return;

  if (command === "/start") {
    await sendMessage(env, chatId, startMessage());
    return;
  }

  if (command === "/status") {
    await sendMessage(env, chatId, "✅ Nexa Dev آنلاین است.\nGitHub integration: آماده بررسی");
    return;
  }

  if (command === "/repos") {
    if (!env.GITHUB_TOKEN) {
      await sendMessage(env, chatId, "⚠️ اتصال GitHub هنوز با Secret نهایی نشده است.");
      return;
    }

    const repos = await fetchRepos(env);
    if (!repos.length) {
      await sendMessage(env, chatId, "هیچ مخزنی پیدا نشد.");
      return;
    }

    const lines = repos.slice(0, 20).map((repo, i) => {
      const visibility = repo.private ? "🔒" : "🌐";
      return `${i + 1}. ${visibility} <b>${repo.full_name}</b>\n   branch: <code>${repo.default_branch}</code>`;
    });

    await sendMessage(env, chatId, `<b>Repositories</b>\n\n${lines.join("\n\n")}`);
    return;
  }

  await sendMessage(env, chatId, "فرمان شناخته نشد. /start را بزن.");
}

async function setupTelegramWebhook(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return text("Telegram secrets not configured", 503);
  }

  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/telegram/webhook`;

  const result = await telegramApi(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
  });

  return json({
    ok: true,
    webhook: webhookUrl,
    telegram_ok: Boolean(result?.ok),
  });
}

async function handleTelegramWebhook(request, env) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return text("Webhook secret not configured", 503);

  const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (actual !== expected) return text("Forbidden", 403);

  const update = await request.json();
  if (update.message?.text) {
    await handleCommand(env, update.message);
  }

  return text("OK");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        name: "Nexa Dev",
        status: "ok",
        version: "0.1.0",
      });
    }

    if (request.method === "GET" && url.pathname === "/telegram/setup") {
      try {
        return await setupTelegramWebhook(request, env);
      } catch (error) {
        console.error(error);
        return text("Telegram webhook setup failed", 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      try {
        return await handleTelegramWebhook(request, env);
      } catch (error) {
        console.error(error);
        return text("Internal Server Error", 500);
      }
    }

    return text("Not Found", 404);
  },
};
