# Nexa Dev

Personal Telegram developer console for GitHub.

## Current MVP

- Private owner-only Telegram bot
- `/start` and `/status`
- `/repos` lists accessible GitHub repositories
- Cloudflare Worker deployment
- Secrets are read from environment variables, never committed

## Required Cloudflare secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`

## Webhook endpoint

`POST /telegram/webhook`

Configure Telegram's webhook with the same `TELEGRAM_WEBHOOK_SECRET` using the `secret_token` parameter.
