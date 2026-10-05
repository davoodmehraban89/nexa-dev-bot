# Nexa Dev Bot — Control Plane Completion Design (Roadmap 2–7)

## Intent
Complete the next six roadmap capabilities without weakening the existing owner-only, Safe Approval, durable replay, branch-only Workspace, public `/status`, or Production/Preview isolation boundaries.

## Delivery decomposition
This architectural program is delivered as six independently reviewable subprojects in dependency order. Each subproject must ship working, tested software before the next relies on it.

### CP2 — Multi-file Repository Workspace
Extend the existing durable Workspace from one editable file to a bounded set of text files. A Workspace records repository/base SHA plus per-file base SHA, path and draft material. Diff and Ready intent cover the complete immutable file set. Commit remains a single atomic Git tree/commit on a `nexa/edit-*` branch; `main` is never directly mutated. Any base/material change invalidates Ready intent. Sensitive/binary/LFS/oversize policies apply per file and to an aggregate bounded payload.

Acceptance: add/remove/replace draft files, aggregate diff, immutable Ready intent, stale-base rejection, one Safe Approval, one atomic branch commit, idempotent retry/reconciliation, recovery UI, and regression coverage proving no direct-main write.

### CP3 — GitHub Advanced WRITE completion
Keep GitHub mutation behind the central action policy. Add only high-value Actions controls not already present: workflow dispatch and job rerun where the provider supports them. Existing rerun-failed, cancel and exact-head PR merge remain unchanged. Approval targets bind repository + immutable operation target; provider permission failures are explicit and never reported as success.

Acceptance: source-backed eligibility, DESTRUCTIVE/WRITE classification as appropriate, compact approval callback under Telegram limits, durable replay rejection, provider mutation only after approval, and exact provider-error feedback.

### CP4 — Cloudflare Ops Plugin completion
Extend the existing Cloudflare READ foundation into a first-class plugin. READ surfaces current Worker deployments/versions, traffic, bindings by name/type only, observability state and recent safe runtime error summaries. Mutations are intentionally limited to redeploy/rollback to a known version; they require Safe Approval, exact target version/deployment binding and post-action runtime verification. Secret values are never returned or audited.

Acceptance: Production/Preview distinction, source-backed READ, fail-closed mutation, rollback/redeploy approval, exact target verification, and independent post-action version/traffic/binding verification.

### CP5 — CI/CD Control Plane
Compose GitHub Actions and Cloudflare deployment state into one owner-only view. The view correlates repository, exact commit SHA, CI run/jobs, deploy workflow and active Cloudflare version. It diagnoses mismatches rather than declaring success from a single green run. Actions delegate to CP3/CP4 policy-protected operations rather than bypassing them.

Acceptance: exact-SHA correlation, clear pending/failed/success/mismatch states, drill-down and recovery, no invented SLA/latency, and deploy acceptance only when GitHub and Cloudflare evidence agree.

### CP6 — Monitoring & Incident Manager
Create durable incident records only from source-backed failures: failed CI/deploy, Cloudflare runtime/provider failure, or explicit health degradation. Incidents have deterministic fingerprints for deduplication, severity, evidence references, status and investigation notes. Sensitive logs/source are redacted before persistence. Owner notifications are informative; remediation actions route through existing policy/approval paths.

Acceptance: create/dedupe/update/resolve incidents, evidence redaction, provider-outage handling, recovery navigation and tests for repeated events and false-success prevention.

### CP7 — Automation Engine
Add a durable, resumable orchestration layer for bounded developer workflows. An automation is a versioned state machine with idempotency key, step status, attempts and durable checkpoints. READ steps may run automatically; WRITE/DESTRUCTIVE steps pause for Safe Approval and resume only with a matching one-time approval. Retries never duplicate provider mutation; terminal failure is explicit. Initial recipes are deliberately limited to existing capabilities (for example diagnose failed CI, prepare recovery action, wait for approval, execute, verify).

Acceptance: durable resume after Worker restart, idempotent retry, approval pause/resume, cancellation, terminal failure, audit-safe event trail, and no direct Production bypass.

## Shared architecture
- Telegram remains the owner control surface; Mini App is used only where richer Workspace editing is needed.
- Plugin manifests declare actions and risk; central policy remains authoritative.
- `ApprovalReplayGuard` remains the one-time approval boundary and fails closed for mutations.
- `WorkspaceStore` may be extended with versioned multi-file schema; migration must preserve existing single-file drafts or fail explicitly without data corruption.
- Automation/incident durable state uses dedicated Durable Object classes/bindings rather than mixing unrelated state into approval replay.
- Provider adapters contain API mechanics; orchestration never embeds secrets or bypasses adapters.
- Public `GET /status` stays minimal health-only. Operational diagnostics remain owner-only in Telegram.
- Production and Preview Durable Object namespaces remain isolated.

## Security and risk
All provider mutations must be target-bound, expiry-bound, owner-bound and replay-safe. Cloudflare rollback/redeploy and any operation changing deployed code are DESTRUCTIVE. GitHub workflow dispatch/rerun are WRITE unless the concrete action is later shown to have destructive semantics. Logs, source code bodies, drafts, tokens, signed approvals and secret values are excluded from incident/audit persistence.

## Verification strategy
Every subproject follows RED → GREEN → relevant tests → full `npm test` → diff/security review → PR CI → Preview where applicable → locked-head merge → post-merge main CI → exact-SHA deploy → independent Cloudflare runtime verification. A subproject is not complete on documentation or mocks alone.

## Non-goals for this program
AI Copilot, Browser QA as a new subsystem, broad third-party plugin marketplace and general multi-project tenancy remain later roadmap items. CP2–CP7 must leave extension points but must not implement those later phases opportunistically.
