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

async function answerCallback(env, callbackQueryId) {
  return telegramApi(env, "answerCallbackQuery", { callback_query_id: callbackQueryId });
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

async function githubJson(env, url, label) {
  const response = await fetch(url, { headers: githubHeaders(env) });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`${label} failed: ${response.status} ${body}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchRepos(env) {
  return githubJson(
    env,
    "https://api.github.com/user/repos?sort=updated&per_page=20&affiliation=owner,collaborator,organization_member",
    "GitHub repos"
  );
}

async function fetchRepoById(env, repoId) {
  return githubJson(env, `https://api.github.com/repositories/${repoId}`, "GitHub repository");
}

function repoPath(fullName) {
  return fullName.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function startMessage() {
  return [
    "<b>Nexa Dev</b>",
    "دستیار شخصی توسعه و مدیریت GitHub از داخل تلگرام.",
    "",
    "فرمان‌ها:",
    "/repos — مرور مخزن‌ها با دکمه‌های لمسی",
    "/status — وضعیت سرویس",
  ].join("\n");
}

function repoButtons(repos) {
  return repos.slice(0, 20).map((repo) => [{
    text: `${repo.private ? "🔒" : "🌐"} ${repo.name}`,
    callback_data: `repo:${repo.id}`,
  }]);
}

async function showRepos(env, chatId) {
  if (!env.GITHUB_TOKEN) {
    await sendMessage(env, chatId, "⚠️ اتصال GitHub هنوز با Secret نهایی نشده است.");
    return;
  }

  const repos = await fetchRepos(env);
  if (!repos.length) {
    await sendMessage(env, chatId, "هیچ مخزنی پیدا نشد.");
    return;
  }

  await sendMessage(env, chatId, "<b>Repositories</b>\nیک مخزن را انتخاب کن:", {
    reply_markup: { inline_keyboard: repoButtons(repos) },
  });
}

function repoMenu(repo) {
  return {
    inline_keyboard: [
      [{ text: "📁 فایل‌ها", callback_data: `files:${repo.id}` }],
      [
        { text: "🧾 کامیت‌ها", callback_data: `commits:${repo.id}` },
        { text: "🔀 Pull Requestها", callback_data: `prs:${repo.id}` },
      ],
      [{ text: "⬅️ مخزن‌ها", callback_data: "repos" }],
    ],
  };
}

async function showRepo(env, chatId, repoId) {
  const repo = await fetchRepoById(env, repoId);
  const visibility = repo.private ? "🔒 خصوصی" : "🌐 عمومی";
  const description = repo.description ? `\n${escapeHtml(repo.description)}` : "";
  await sendMessage(
    env,
    chatId,
    `<b>${escapeHtml(repo.full_name)}</b>\n${visibility}\nbranch: <code>${escapeHtml(repo.default_branch)}</code>${description}`,
    { reply_markup: repoMenu(repo) }
  );
}

function fileButtons(repoId, items, back = `repo:${repoId}`) {
  const rows = items.slice(0, 30).map((item) => {
    const isDir = item.type === "dir" || item.type === "tree";
    const isFile = item.type === "file" || item.type === "blob";
    const callback = isDir
      ? `tree:${repoId}:${item.sha}`
      : isFile
        ? `blob:${repoId}:${item.sha}`
        : null;
    return callback ? [{ text: `${isDir ? "📁" : "📄"} ${item.name || item.path}`, callback_data: callback }] : [];
  }).filter((row) => row.length);
  rows.push([{ text: "⬅️ برگشت", callback_data: back }]);
  return { inline_keyboard: rows };
}

async function showRootFiles(env, chatId, repoId) {
  const repo = await fetchRepoById(env, repoId);
  const full = repoPath(repo.full_name);
  const branch = encodeURIComponent(repo.default_branch);
  const items = await githubJson(
    env,
    `https://api.github.com/repos/${full}/contents?ref=${branch}`,
    "GitHub contents"
  );

  await sendMessage(env, chatId, `📁 <b>${escapeHtml(repo.full_name)}</b> /`, {
    reply_markup: fileButtons(repoId, Array.isArray(items) ? items : [], `repo:${repoId}`),
  });
}

async function showTree(env, chatId, repoId, sha) {
  const repo = await fetchRepoById(env, repoId);
  const full = repoPath(repo.full_name);
  const tree = await githubJson(
    env,
    `https://api.github.com/repos/${full}/git/trees/${encodeURIComponent(sha)}`,
    "GitHub tree"
  );

  await sendMessage(env, chatId, `📁 <b>${escapeHtml(repo.full_name)}</b>`, {
    reply_markup: fileButtons(repoId, tree.tree || [], `files:${repoId}`),
  });
}

async function showBlob(env, chatId, repoId, sha) {
  const repo = await fetchRepoById(env, repoId);
  const full = repoPath(repo.full_name);
  const blob = await githubJson(
    env,
    `https://api.github.com/repos/${full}/git/blobs/${encodeURIComponent(sha)}`,
    "GitHub blob"
  );

  if (blob.encoding !== "base64" || blob.size > 100000) {
    await sendMessage(env, chatId, "این فایل برای نمایش مستقیم در تلگرام مناسب نیست.", {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ فایل‌ها", callback_data: `files:${repoId}` }]] },
    });
    return;
  }

  const decoded = decodeBase64Utf8(blob.content);
  const preview = decoded.length > 3000 ? `${decoded.slice(0, 3000)}\n…` : decoded;
  await sendMessage(env, chatId, `<pre>${escapeHtml(preview)}</pre>`, {
    reply_markup: { inline_keyboard: [[{ text: "⬅️ فایل‌ها", callback_data: `files:${repoId}` }]] },
  });
}

async function showCommits(env, chatId, repoId) {
  const repo = await fetchRepoById(env, repoId);
  const full = repoPath(repo.full_name);
  const commits = await githubJson(
    env,
    `https://api.github.com/repos/${full}/commits?per_page=5&sha=${encodeURIComponent(repo.default_branch)}`,
    "GitHub commits"
  );
  const lines = commits.map((commit) => {
    const title = String(commit.commit?.message || "").split("\n")[0];
    const author = commit.author?.login || commit.commit?.author?.name || "unknown";
    return `• <code>${escapeHtml(String(commit.sha).slice(0, 7))}</code> ${escapeHtml(title)} — ${escapeHtml(author)}`;
  });
  await sendMessage(env, chatId, `<b>آخرین کامیت‌ها</b>\n\n${lines.join("\n") || "کامیتی پیدا نشد."}`, {
    reply_markup: { inline_keyboard: [[{ text: "⬅️ مخزن", callback_data: `repo:${repoId}` }]] },
  });
}

async function showPullRequests(env, chatId, repoId) {
  const repo = await fetchRepoById(env, repoId);
  const full = repoPath(repo.full_name);
  const prs = await githubJson(
    env,
    `https://api.github.com/repos/${full}/pulls?state=open&per_page=5`,
    "GitHub pull requests"
  );
  const lines = prs.map((pr) => `• <b>#${pr.number}</b> ${escapeHtml(pr.title)} — ${escapeHtml(pr.user?.login || "unknown")}`);
  await sendMessage(env, chatId, `<b>Pull Requestهای باز</b>\n\n${lines.join("\n") || "PR بازی وجود ندارد."}`, {
    reply_markup: { inline_keyboard: [[{ text: "⬅️ مخزن", callback_data: `repo:${repoId}` }]] },
  });
}

async function handleCommand(env, message) {
  const chatId = message.chat?.id;
  const command = (message.text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();

  if (!isOwner(env, message.from)) return;

  if (command === "/start") {
    await sendMessage(env, chatId, startMessage());
    return;
  }

  if (command === "/status") {
    await sendMessage(env, chatId, "✅ Nexa Dev آنلاین است.\nGitHub integration: آماده");
    return;
  }

  if (command === "/repos") {
    await showRepos(env, chatId);
    return;
  }

  await sendMessage(env, chatId, "فرمان شناخته نشد. /start را بزن.");
}

async function handleCallbackQuery(env, query) {
  if (!isOwner(env, query.from)) return;

  const chatId = query.message?.chat?.id;
  const data = String(query.data || "");
  await answerCallback(env, query.id);

  if (data === "repos") {
    await showRepos(env, chatId);
    return;
  }

  const [action, repoId, sha] = data.split(":");
  if (!/^\d+$/.test(repoId || "")) return;

  if (action === "repo") return showRepo(env, chatId, repoId);
  if (action === "files") return showRootFiles(env, chatId, repoId);
  if (action === "tree" && /^[a-f0-9]{40}$/i.test(sha || "")) return showTree(env, chatId, repoId, sha);
  if (action === "blob" && /^[a-f0-9]{40}$/i.test(sha || "")) return showBlob(env, chatId, repoId, sha);
  if (action === "commits") return showCommits(env, chatId, repoId);
  if (action === "prs") return showPullRequests(env, chatId, repoId);
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
    allowed_updates: ["message", "callback_query"],
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
  } else if (update.callback_query) {
    try {
      await handleCallbackQuery(env, update.callback_query);
    } catch (error) {
      console.error(error);
      if (isOwner(env, update.callback_query.from) && update.callback_query.message?.chat?.id) {
        const hint = error?.status === 403
          ? "⚠️ توکن GitHub مجوز Read لازم برای این بخش را ندارد."
          : "⚠️ دریافت اطلاعات GitHub ناموفق بود.";
        await sendMessage(env, update.callback_query.message.chat.id, hint);
      }
    }
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
        version: "0.2.0",
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
