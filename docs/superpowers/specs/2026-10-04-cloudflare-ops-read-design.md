# Cloudflare Ops READ Design

## Goal
Add a source-backed, owner-only Cloudflare operational plugin to Nexa Dev Bot so the Telegram control plane can inspect the deployed Worker without exposing secrets or creating mutation paths.

## Scope
Phase 1 is READ-only. It reports the configured Worker's deployment/version, binding names and types, observability state, and provider health/error state. It does not deploy, redeploy, rollback, edit settings, or expose credential values.

## Architecture
Create `src/plugins/cloudflare/` as a provider/plugin boundary parallel to GitHub. `CloudflareService` owns authenticated Cloudflare API reads and normalization. The plugin exposes READ actions and Telegram views; it is registered in the central `PluginRegistry`, so policy/audit behavior remains centralized.

The Worker receives non-secret `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKER_NAME` configuration plus a sensitive `CLOUDFLARE_API_TOKEN`. Missing provider configuration is represented explicitly as unavailable; it must never be presented as healthy. API failures are redacted into useful provider errors without returning token material.

## Telegram UX
Add a Cloudflare entry under operational tools/status rather than a separate misleading top-level product area. The overview shows active deployment/version, traffic allocation when supplied by the API, observability state, and binding metadata. Refresh remains in context and every view has a recovery/back route.

## Security boundaries
- Owner-only routing remains mandatory.
- All Phase 1 actions are `READ`.
- No Cloudflare mutation endpoint is implemented in this phase.
- Secret values are never rendered, audited, or persisted.
- Public `/status` remains minimal health-only and receives no Cloudflare operational detail.
- Provider failures use explicit failure rather than synthetic success.

## Testing and acceptance
Use TDD. Tests cover manifest risk classes, missing configuration, normalized provider responses, redacted failures, Telegram callback length/message limits, operational navigation, and preservation of the public `/status` boundary. Full `npm test`, PR CI, preview, merge, post-merge CI/deploy, and independent Cloudflare runtime verification are required before completion.
