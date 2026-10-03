# Safe GitHub Operator Design

## Purpose
Turn the production-accepted read-only plugin foundation into a safe write-capable GitHub operator without weakening the existing owner-only, fail-closed security model.

## Scope
This phase delivers two tightly coupled capabilities:
1. A reusable Telegram approval flow for `WRITE` and `DESTRUCTIVE` plugin actions with durable one-time consumption.
2. GitHub Advanced operations for workflow visibility/control and repository operational views.

Out of scope for this phase: AI model execution, browser automation, Supabase, Cloudflare rollback and Mini App UI. A Cloudflare Durable Object namespace with SQLite storage is in scope because it is required for cross-isolate approval replay protection.

## Success criteria
- `READ` actions continue to execute immediately for the authorized owner.
- `WRITE` and `DESTRUCTIVE` actions never execute on the first request.
- Approval tokens are single-use, owner-bound, action-bound, short-lived, and tamper-evident.
- Approval UI exposes explicit Confirm and Cancel choices.
- Replayed, expired, malformed, wrong-owner, or mismatched approvals fail closed and do not execute provider code.
- One-time consumption remains enforced across Worker isolates through a Durable Object replay guard.
- GitHub workflow actions can list runs, inspect jobs/steps, re-run failed jobs, and cancel an in-progress workflow when the configured GitHub token has sufficient scope.
- Missing GitHub permissions produce an explicit operational error; they are not reported as success.
- Every attempted and completed action emits redacted audit events.
- Existing repository/file navigation remains unchanged.
- All existing tests stay green, new tests cover approval, durable replay and GitHub operator behavior, CI passes, production deploy succeeds, and live Telegram READ smoke remains healthy.

## Approval architecture

### Signed approval token
Approval state needed for verification is carried in a signed callback token; no server-side session is required to reconstruct the requested action.

The token payload contains:
- `v`: schema version `1`
- `pluginId`
- `actionId`
- `input`: compact action parameters
- `risk`: `WRITE` or `DESTRUCTIVE`
- `ownerId`
- `issuedAt`
- `expiresAt`
- `nonce`

The token is authenticated with HMAC-SHA-256 using `APPROVAL_SIGNING_SECRET` when configured, otherwise `TELEGRAM_WEBHOOK_SECRET` as the fail-closed fallback signing secret. Raw secrets are never logged or returned.

Telegram callback data has a strict size budget, so approval tokens must not embed verbose objects. GitHub operations use compact numeric identifiers (repository ID and workflow run ID) and the token encoder rejects oversized payloads instead of truncating security-relevant data.

### ApprovalService
`ApprovalService.issue()` creates a signed token. `ApprovalService.verify()` validates signature, schema, owner, expiry, risk, and expected action before returning the decoded payload.

A verified token does not by itself execute an action. `ApprovalService.consume()` must first persist one-time consumption through the replay store. Only then does the router receive explicit `approved: true` context. The action policy then allows the matching `WRITE`/`DESTRUCTIVE` action.

### Durable replay protection
`DurableApprovalReplayStore` maps the `(ownerId, nonce)` pair to a Cloudflare Durable Object identity. `ApprovalReplayGuard` performs an atomic check-and-write in Durable Object storage and schedules cleanup at token expiry.

Security behavior:
- first valid consume before expiry: accepted and persisted;
- repeated consume for the same `(ownerId, nonce)`: rejected;
- expired consume: rejected;
- missing `APPROVAL_REPLAY_GUARD` binding: consume fails closed;
- cleanup occurs after expiry via the Durable Object alarm.

`wrangler.jsonc` declares `APPROVAL_REPLAY_GUARD` bound to exported class `ApprovalReplayGuard` with SQLite storage.

## Policy changes
`ActionPolicy.evaluate()` accepts `approved` in addition to `action` and `isOwner`.
- non-owner: denied
- unknown action/risk: denied
- READ: allowed
- WRITE/DESTRUCTIVE without approval: `requiresApproval`
- WRITE/DESTRUCTIVE with verified and consumed approval: allowed with distinct audit reason

The router remains `resolve -> policy -> execute`; approval verification and durable consume occur before the second dispatch that carries `approved: true`.

## Telegram UX
When a plugin route returns `requiresApproval`, the bot edits the same message to a confirmation view:

- operation label
- repository/workflow target
- risk badge
- `✅ تأیید` callback
- `❌ لغو` callback

Cancel returns to a safe operational view without provider execution.

Confirmation callbacks use reserved prefixes:
- `approve:<token>`
- `cancel:<token>`

Malformed/expired/replayed callbacks return a concise Persian error and never reach provider mutation.

## GitHub Advanced plugin
The existing GitHub plugin is extended instead of creating a second overlapping GitHub plugin.

### New READ actions
- `github.workflow.runs.list`
- `github.workflow.run.detail`
- `github.workflow.jobs.list`

### New WRITE actions
- `github.workflow.run.rerun_failed`
- `github.workflow.run.cancel`

No branch deletion, merge, release publication, secret mutation, or repository settings mutation is added in this phase.

## GitHub service interfaces
Add focused methods to `GitHubService`:
- `listWorkflowRuns(repoId, { perPage = 10 } = {})`
- `getWorkflowRun(repoId, runId)`
- `listWorkflowJobs(repoId, runId)`
- `rerunFailedWorkflowRun(repoId, runId)`
- `cancelWorkflowRun(repoId, runId)`

All methods resolve numeric repository IDs through the existing trusted repository resolver and use the configured bearer token. Non-2xx responses throw errors containing status and a bounded provider message.

## Menu changes
Repository detail adds an `🧪 CI / Actions` entry. Workflow views remain bounded for Telegram:
- maximum 10 runs in the current view
- concise status/conclusion/branch/SHA summary
- job details show step status/conclusion without full raw logs

Raw job logs and AI analysis belong to later phases.

## Audit
Approval lifecycle emits:
- `approval_issued`
- `approval_verified`
- `approval_rejected`
- existing `action_attempt`
- existing `action_result`

Audit payloads may include IDs and status but never secrets or signed approval tokens.

## Error handling
- Missing signing secret: fail closed for write approval; READ remains available.
- Missing Durable Object replay binding: approval consume fails closed before provider call.
- Signature mismatch/expiry/owner mismatch/action mismatch/replay: reject before provider call.
- GitHub 401/403: explicit permission/authentication error.
- GitHub 404: explicit not-found error.
- GitHub 409/422: explicit current-state conflict; do not fabricate success.
- Telegram edit failure follows existing error propagation behavior.

## Testing
Add unit coverage for:
- policy approved/unapproved semantics
- approval issue/verify/tamper/expiry/owner mismatch/oversize behavior
- durable replay consume, expiry, missing binding and Wrangler export/binding contract
- router execute gating with approved context
- GitHub REST method/path/body behavior and non-2xx failures
- plugin route ownership and risk mapping
- bot confirmation/cancel/approved callback flows
- no secret/token leakage in audit events

Regression suite must retain all existing Foundation tests.

## Deployment acceptance
1. PR CI green with non-zero test discovery.
2. Merge to `main` and post-merge CI green.
3. Cloudflare deployment succeeds for exact verified commit.
4. Active deployment exposes `APPROVAL_REPLAY_GUARD` and exported SQLite `ApprovalReplayGuard`.
5. Owner-device smoke: `/start -> Repositories -> project -> CI / Actions`.
6. Live write-action smoke is only attempted after the owner confirms the action in Telegram; if the configured GitHub token lacks Actions write permission, provider-permission smoke is recorded as `NOT VERIFIED` and no secret/token rotation is performed automatically.
7. Cloudflare telemetry shows current-version webhook HTTP 200 and redacted audit events with no new webhook error.
