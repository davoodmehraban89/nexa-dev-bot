# Nexa Dev Bot — Plugin Foundation v1 Design

Date: 2026-10-03
Status: Design approved in chat; implementation pending written-spec review
Repository: `davoodmehraban89/nexa-dev-bot`
Target branch: `main`

## 1. Purpose

Nexa Dev Bot is currently a stable owner-only Telegram interface over GitHub, deployed as a Cloudflare Worker. The next step is to turn it into an extensible DevOps control plane without coupling every new integration directly into `bot.js` and `menu.js`.

Foundation v1 introduces a small plugin kernel that supports future GitHub, Cloudflare, CI/CD, AI, Browser QA, monitoring, automation and other adapters while preserving the current production behavior.

Success means:

1. Existing `/start`, repository browsing, file browsing, PR/commit/status views and owner-only behavior remain unchanged from the user perspective.
2. Plugins can register commands, callback handlers, menu entries and actions through one registry.
3. Every action has an explicit risk level and is checked by one policy engine before execution.
4. Action attempts produce redacted audit events without storing secrets.
5. GitHub becomes the first plugin using the new contract, proving the architecture against real existing functionality.
6. CI and production deployment remain green, and Telegram runtime smoke remains the final acceptance gate.

## 2. Scope

### In scope

- Plugin registry and manifest contract.
- Action risk model: `READ`, `WRITE`, `DESTRUCTIVE`.
- Central permission/policy evaluation.
- Redacted audit events for action attempts and results.
- Plugin routing for Telegram commands/callbacks.
- Core menu entry registration.
- GitHub plugin adapter around the existing `GitHubService` and menu flows.
- Backward-compatible migration from the current direct `NexaDevBot -> MenuManager/GitHubService` wiring.
- Unit/regression tests for the kernel and GitHub adapter.
- Cloudflare-safe runtime behavior.

### Explicitly out of scope for Foundation v1

- AI provider integration.
- Browser automation.
- Supabase integration.
- Sentry/Linear/Notion integrations.
- Persistent user sessions or database storage.
- Multi-user authorization.
- Automatic destructive actions.
- Telegram Mini App.
- Full Cloudflare operator plugin.

These are later plugins built on top of this foundation.

## 3. Constraints and invariants

- The bot stays owner-only.
- No secret, token or private key may be persisted in repository files, audit entries or Telegram output.
- Existing production navigation must continue to edit the same Telegram message for callbacks.
- Telegram callback payloads must remain within the 64-byte limit.
- Missing credentials fail closed.
- A plugin must not bypass policy evaluation for declared actions.
- `WRITE` and `DESTRUCTIVE` actions are not automatically executed in this phase; the kernel only establishes the policy contract for later approval workflows.
- The Worker remains stateless in Foundation v1.

## 4. Architecture

### 4.1 Core modules

Proposed structure:

```text
src/
  core/
    plugin-registry.js
    action-policy.js
    audit.js
    router.js
  plugins/
    github/
      plugin.js
      manifest.js
      views.js
  bot.js
  index.js
  telegram.js
  github.js
  menu.js
```

Foundation v1 deliberately reuses `github.js` and existing view behavior instead of rewriting the GitHub API layer.

### 4.2 Plugin manifest

Each plugin exports a manifest with a stable identifier and declared capabilities.

Conceptual contract:

```js
{
  id: 'github',
  name: 'GitHub',
  version: 1,
  commands: ['/repos'],
  menuEntries: [...],
  actions: {
    'github.repos.list': { risk: 'READ' },
    'github.repo.open': { risk: 'READ' }
  }
}
```

The registry rejects duplicate plugin IDs, duplicate action IDs and invalid risk levels at construction time.

### 4.3 Plugin interface

A plugin may expose:

- `manifest`
- `handleCommand(context)`
- `handleCallback(context)`
- `getMenuEntries(context)`
- optional `health(context)`

A plugin returns either `null` when it does not own the route or a normalized response/view object. Core routing decides which plugin receives a command/callback; transport remains centralized in `NexaDevBot`.

### 4.4 Action policy

Every action execution goes through `ActionPolicy.evaluate()`.

Policy result:

```js
{
  allowed: true,
  requiresApproval: false,
  risk: 'READ',
  reason: 'owner_read_allowed'
}
```

Initial rules:

- `READ`: allowed for the authenticated owner.
- `WRITE`: not auto-executed; returns `requiresApproval: true`.
- `DESTRUCTIVE`: not auto-executed; returns `requiresApproval: true` and marks the operation as high risk.
- Unknown action/risk: denied.

No confirmation UX is implemented yet; Foundation v1 only makes the contract enforceable so later write-capable plugins cannot skip it.

### 4.5 Audit trail

`AuditLogger` receives structured events such as:

```js
{
  event: 'action_attempt',
  pluginId: 'github',
  actionId: 'github.repos.list',
  risk: 'READ',
  outcome: 'allowed'
}
```

Foundation v1 uses Cloudflare `console` output only. It does not add storage.

Redaction rules:

- Never include Telegram bot token.
- Never include webhook secret.
- Never include GitHub token.
- Never include raw authorization headers.
- Errors pass through the existing safe redaction helper or an equivalent shared sanitizer.

## 5. Data and control flow

### `/start`

```text
Telegram webhook
  -> index security gates
  -> NexaDevBot
  -> core router
  -> core/main menu + plugin menu entries
  -> TelegramClient.sendMessage
```

### GitHub callback

```text
callback query
  -> callback acknowledgement (best effort)
  -> core router resolves github plugin
  -> policy evaluates declared READ action
  -> audit action attempt
  -> github plugin delegates to existing GitHubService/view logic
  -> TelegramClient.editMessageText
  -> audit result
```

### Future write action

```text
callback/command
  -> plugin declares WRITE action
  -> policy returns requiresApproval
  -> core does not execute action
  -> later approval subsystem renders confirmation UX
```

This guarantees the safety boundary exists before write-capable plugins are added.

## 6. Migration strategy

Foundation v1 is incremental, not a rewrite.

1. Add core modules with tests while production code still uses the current direct flow.
2. Introduce GitHub plugin adapter around the existing `GitHubService` and current views.
3. Route only GitHub-related commands/callbacks through the registry.
4. Keep existing top-level status/tools/settings/security views working through compatibility paths during this phase.
5. Remove direct GitHub routing from `bot.js` only after regression tests prove behavioral parity.

No production behavior is intentionally changed in this migration.

## 7. Error handling

- Registry construction errors fail fast in tests/startup.
- Unknown command/callback falls back to the current main-menu behavior.
- Plugin exceptions are caught at the bot boundary, redacted and surfaced as safe operational failures.
- Telegram transport failures keep existing explicit propagation behavior.
- Policy denial never calls the plugin action implementation.
- Audit logging failure must not break a read-only user action; audit logging is best-effort in Foundation v1, but failures are themselves safely logged when possible.

## 8. Testing strategy

### New unit tests

- Registry accepts valid plugin.
- Registry rejects duplicate plugin ID.
- Registry rejects duplicate action IDs.
- Registry rejects unknown risk level.
- Router dispatches command to exactly one plugin.
- Router dispatches callback to exactly one plugin.
- Unknown route returns no plugin match.
- Policy allows owner `READ`.
- Policy requires approval for `WRITE`.
- Policy requires approval for `DESTRUCTIVE`.
- Policy denies undeclared/unknown action.
- Audit logger redacts known secrets.

### Migration regression tests

- `/start` renders the same main menu behavior.
- `/repos` still uses live GitHub data.
- `menu:repos`, `repo:*`, `files:*`, `tree:*`, `blob:*`, `pr:*`, `commits:*`, `status:*` continue to work.
- Callback navigation still edits the same Telegram message.
- Callback acknowledgement failure still cannot block rendering.
- Missing GitHub token still fails closed.
- Non-owner update still produces no private response.
- Cloudflare-specific default `fetch` receiver regression remains green.

### Acceptance gates

- All existing tests pass.
- New kernel/plugin tests pass.
- CI on the feature branch passes.
- PR diff contains no secret material.
- Post-merge `main` CI passes.
- Cloudflare deploy workflow passes.
- Production Telegram `/start` and GitHub navigation smoke pass before Foundation v1 is marked complete.

## 9. Security model

The kernel is designed so future integrations cannot treat Telegram button presses as implicit authorization for arbitrary writes.

Security boundaries:

1. `index.js`: webhook secret + owner identity.
2. `router`: route ownership.
3. `ActionPolicy`: action authorization/risk decision.
4. plugin: implementation only after allowed policy result.
5. `AuditLogger`: traceable, redacted action record.

This does not replace provider-side least privilege. GitHub/Cloudflare/Supabase credentials should still be scoped to the minimum permissions required by each future plugin.

## 10. Files expected to change in implementation

New:

- `src/core/plugin-registry.js`
- `src/core/action-policy.js`
- `src/core/audit.js`
- `src/core/router.js`
- `src/plugins/github/manifest.js`
- `src/plugins/github/plugin.js`
- kernel/plugin test files

Likely modified:

- `src/bot.js`
- `src/menu.js` or a compatibility extraction used by the GitHub plugin
- `test/bot.test.js`
- `test/navigation.test.js`
- `PROJECT_MEMORY.md`

`src/github.js`, `src/telegram.js` and `src/index.js` should change only if required by an explicit integration boundary or shared redaction extraction; unrelated refactors are excluded.

## 11. Definition of done

Foundation v1 is complete only when all of the following are true:

- Plugin registry exists and validates manifests.
- GitHub functionality is routed through the plugin contract.
- Action policy is enforced before plugin actions.
- Read actions are audited with secrets redacted.
- Existing Telegram UX is behaviorally compatible.
- Automated tests and CI are green.
- Exact verified commit is deployed by the Cloudflare workflow.
- Real Telegram smoke confirms `/start` and GitHub navigation on the deployed Worker.
- `PROJECT_MEMORY.md` records the final evidence and any remaining NOT VERIFIED items.
