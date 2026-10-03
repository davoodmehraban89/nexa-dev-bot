# Safe GitHub Operator Design

## Purpose
Turn the production-accepted read-only plugin foundation into a safe write-capable GitHub operator without weakening the existing owner-only, fail-closed security model.

## Scope
This phase delivers two tightly coupled capabilities:
1. A reusable Telegram approval flow for `WRITE` and `DESTRUCTIVE` plugin actions.
2. GitHub Advanced operations for workflow visibility/control and repository operational views.

Out of scope for this phase: AI model execution, paid browser automation, Supabase, Cloudflare rollback, Mini App UI, and any new paid resource. Those remain later phases.

## Success criteria
- `READ` actions continue to execute immediately for the authorized owner.
- `WRITE` and `DESTRUCTIVE` actions never execute on the first request.
- Approval tokens are single-use, owner-bound, action-bound, short-lived, and tamper-evident.
- Approval UI exposes explicit Confirm and Cancel choices.
- Replayed, expired, malformed, wrong-owner, or mismatched approvals fail closed and do not execute provider code.
- GitHub workflow actions can list runs, inspect jobs/steps, re-run failed jobs, and cancel an in-progress workflow when the configured GitHub token has sufficient scope.
- Missing GitHub permissions produce an explicit operational error; they are not reported as success.
- Every attempted and completed action emits redacted audit events.
- Existing repository/file navigation remains unchanged.
- All existing tests stay green, new tests cover approval and GitHub operator behavior, CI passes, production deploy succeeds, and live Telegram READ smoke remains healthy.

## Approval architecture

### ApprovalStore
Use an in-memory request-scoped approval registry only for encoding/decoding signed approval payloads; persistence is not required because the approval state itself is carried in a signed callback token.

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

The token is authenticated with HMAC-SHA-256 using `TELEGRAM_WEBHOOK_SECRET` as the signing secret. The raw secret is never logged or returned.

Telegram callback data has a strict size budget, so approval tokens must not embed verbose objects. GitHub operations use compact numeric/string identifiers (repository ID, workflow run ID, job ID) and the token encoder rejects oversized payloads instead of truncating security-relevant data.

### ApprovalService
`ApprovalService.issue()` creates a signed token. `ApprovalService.verify()` validates signature, schema, owner, expiry, risk, and expected action before returning the decoded payload.

A verified token does not by itself execute an action. The router receives an explicit `approved: true` context only after verification. The action policy then allows the matching `WRITE`/`DESTRUCTIVE` action.

### One-time semantics
Telegram duplicate callbacks are possible. A process-local nonce cache prevents duplicate execution within one Worker isolate. Provider operations chosen for this phase are also idempotent or safe to retry at the API level: re-running failed jobs may create a new attempt only once per accepted callback in the active isolate; cancel on an already completed run is surfaced as a provider error. No destructive repository mutation is introduced in this phase.

## Policy changes
`ActionPolicy.evaluate()` accepts `approved` in addition to `action` and `isOwner`.
- non-owner: denied
- unknown action/risk: denied
- READ: allowed
- WRITE/DESTRUCTIVE without approval: `requiresApproval`
- WRITE/DESTRUCTIVE with verified approval: allowed with distinct audit reason

The router remains `resolve -> policy -> execute`; approval verification occurs before the second dispatch that carries `approved: true`.

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

Malformed/expired callbacks return a concise Persian error and a Back button.

## GitHub Advanced plugin
The existing GitHub plugin is extended instead of creating a second overlapping GitHub plugin.

### New READ actions
- `github.workflow.runs.list`
- `github.workflow.run.detail`
- `github.workflow.jobs.list`
- `github.workflow.job.detail`

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
- maximum 10 runs per page in v1
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
- Signature mismatch/expiry/owner mismatch/action mismatch: reject before provider call.
- GitHub 401/403: explicit permission/authentication error.
- GitHub 404: explicit not-found error.
- GitHub 409/422: explicit current-state conflict; do not fabricate success.
- Telegram edit failure follows existing error propagation behavior.

## Testing
Add unit coverage for:
- policy approved/unapproved semantics
- approval issue/verify/tamper/expiry/owner mismatch/oversize/replay behavior
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
4. Owner-device smoke: `/start -> Repositories -> project -> CI / Actions`.
5. Live write-action smoke is only attempted if GitHub token permissions already support it; otherwise the capability is marked implemented but provider-permission smoke is `NOT VERIFIED` and no secret/token rotation is performed automatically.
6. Cloudflare telemetry shows current-version webhook HTTP 200 and redacted audit events with no new webhook error.
