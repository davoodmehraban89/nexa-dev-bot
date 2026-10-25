# G0 hardening continuation — 2026-10-25

Owner instruction: continue implementation in this execution environment; do not stop at another chat handoff. This report supplements the historical G0 report; it is not gate acceptance.

## Implemented code

| Change | Commit | Evidence |
| --- | --- | --- |
| Bounded exact Diff | `77c7894` | Intercepted the old 800,160,008-byte allocation safely in RED. Ordinary LCS capped at 65,536 cells; large sparse diff uses bounded Myers/banded reconstruction, max distance 64, max band 1,000,000 bytes, max work 2,000,000. Preserves exact insertion-first ties/counts. 540 randomized oracle comparisons and maximum newline/sparse/adversarial cases. |
| Durable automation claims / atomic incidents | `a9a082b` | Claim before real router dispatch, persistent revision/CAS and claim-token completion; concurrent/stale/terminal calls do not repeat effects. Incident body parsed before transactional upsert/resolve. RED reproduced duplicate effects, stale authorization and lost rows/counts. |
| Runtime/SHA evidence | `ace882c` | Actual active version selected from deployment traffic; detail fetched when omitted from latest list or lacking markers. Success requires active ID plus full matching documented `workers/commit_sha` or SHA-valued `workers/tag`. Missing proof stays UNKNOWN, mismatch stays MISMATCH. Workflow pins Wrangler and tags exact verified checkout SHA. Tightened an old false-positive test and fixed the plugin's short-SHA adapter. |
| Source boundary / authenticated reader | `e02e9fb` | Telegram file, workspace Diff, PR patch and raw job-log views no longer forward their source fields. File and Diff content is available in the existing owner-authenticated Mini App via opaque owner-scoped refs and workspace IDs, read-only with Save hidden/disabled. Sensitive files/expired refs/nonowners rejected. Raw provider error strings do not escape the new preview API. Raw job logs remain accessible on GitHub. |

## Verification on code head e02e9fb976f11167aa04a842f881dedb3e11a3ef

- Node **22.23.4**, full `npm test`: **353 passed, zero failed/cancelled/skipped/todo**.
- ESLint: zero errors, 13 existing warnings. Prettier and `git diff --check` pass.
- Wrangler **4.152.0** `deploy --dry-run` passes with the five existing bindings; no upload.
- Actual local workerd/SQLite smoke: exactly one of eight Automation claims wins; exactly one of eight completion attempts succeeds; completed state survives full runtime restart; twelve concurrent identical Incident updates produce one record with count twelve.
- Actual jsdom parsing: authenticated read-only file/Diff views render hostile-shaped content literally, expose no Save action and issue no save/provider request when Save is invoked programmatically.
- Independent focused AI reviews checked source/owner boundaries, durable concurrency, bounded Diff and runtime evidence. No implementation blocker remained. These are not human security or device acceptance.
- One full-run integration fixture lacked the newly required active-version detail response; it was updated to return real-shaped untagged version metadata. No production check was weakened.

The concurrent incoming PR-patch privacy regression was preserved by merge `9cca87e`. The merged candidate was checked again on Node 22: **354 tests passed**, with the same zero lint errors / 13 existing warnings; formatting and the pinned Wrangler dry-run also passed. Final remote checks are recorded on PR #65.

## Cloudflare build blocker: confirmed and addressed for this branch

The earlier failing Workers build `cea884d0-9e1c-477d-b390-264a64722268` on commit `4ddab54f8faf27ad1be571e7ae50e2da4f3b15db` ran `npx wrangler preview` and returned Cloudflare error **10067**: the account reached the Free plan's **100 Durable Object namespaces** limit. This was a preview provisioning quota, not a compilation/test error.

After reading the trigger's live configuration, changed only trigger `30efc160-813b-4c61-b588-532cd74fbbfa`, whose branch filter is exactly `feat/studio-g0-foundation`, from `npx wrangler preview` to **`npm run build:check`**. Read-back confirmed the command and branch filter at `2026-10-25T07:12:14.657Z`. This reversible branch build validates the bundle without deploying previews or creating more namespaces; it also follows D-10's exclusion of Preview Environment from the current product scope. No production trigger, secret, deployment, stored namespace or paid plan was changed.

The account quota itself is not increased and no namespaces were deleted. A future staging deployment may still require an owner-reviewed resource inventory/cleanup decision. Rollback of this trigger-only configuration is restoring its prior command; doing so would resume preview attempts and can reproduce the quota failure.

GitHub and Cloudflare exact-head results are linked in PR #65 after pushing the final candidate; avoid creating another documentation commit merely to record its own CI.

## Limits and unresolved gate work

- These changes harden existing G0 paths. They do not constitute G1, multi-user access, CodeMirror, D1, encrypted PAT onboarding, sessions/grants or secure signed/TOTP unlock.
- Very complex valid edits can be refused with `DIFF_COMPLEXITY_LIMIT` (Mini App HTTP 422 with a Persian next step). No approximate diff/counts or silent success is returned. Splitting changes may be necessary; editor content ceilings are unchanged.
- An interrupted automation effect leaves **step_unresolved** indefinitely. No expiring automatic claim/retry is allowed because a provider effect may already have happened. Cancellation/reset PUTs while unresolved return conflict instead of pretending the effect was revoked. Manual reconciliation is still needed; exactly-once external execution is not claimed.
- Runtime commit markers are authenticated Cloudflare metadata, not cryptographic source attestations. Untagged or ambiguous deployments remain unverified. A latest-list entry carrying only a non-SHA human tag may cause a conservative UNKNOWN until metadata is enriched.
- The known outbound source-bearing fields are covered by sentinel regression tests. The follow-up below also disables Telegram Paste/upload input and implements C-30 interception. Arbitrary user-entered metadata and the later-gate credential/session lifecycle still prevent a claim of full R-07 compliance.
- R-26 still needs fresh owner-produced device/Approval/GitHub/Cloudflare evidence. No recording, owner click, human review or provider test commit was fabricated. Existing main/production revision has not been merged or deployed by this continuation.
- G0 acceptance and permission to cross into G1 remain pending the contract's evidence and written owner decision.

## Next-step implementation on code head 515333d224a5cd9133023a479512fa0a458f9f25

- `a4329e5`: fixed reuse of a TOTP across distinct destructive Approvals. The verifier returns its matching counter and the end of its full acceptance window; the bot validates the signed Approval, durably claims owner/counter, then consumes the action Approval. Concurrent requests, bot/DO recreation and storage outages are covered. No raw OTP/secret is stored, no namespace added and no unlock enabled. Five new expected failures were reproduced before correction.
- `515333d`: token-prefixed owner text/captions, including edited messages, are intercepted before bot processing. Telegram deletion precedes a fixed Persian GitHub-revocation warning. Failures expose only deleted/warned metadata; deletion is best effort and a failed delete is explicitly disclosed. Existing durable webhook claims still precede all effects, so guard outage/crash limitations remain. Fourteen token-regression failures were observed before correction.
- `515333d`: retired Paste/upload controls and handlers. Stale source callbacks do not arm input; existing source-input modes send pending metadata only and redirect to the authenticated Mini App without reading/downloading/storing the submitted body. Existing commit-message input remains. Nine migration regressions and three bot regressions were reproduced before correction; old upload-success tests now require rejection/redirection rather than silently retaining the removed feature.
- `515333d`: corrected the hard-coded production editor link that prevented isolated acceptance. Webhooks default to their own Worker origin; `WORKSPACE_EDITOR_URL` explicitly overrides it after HTTPS/exact-path/no-credentials/query/fragment validation. Invalid explicit values disable links, and Ops configuration shows the validated URL. Three initial wiring failures plus the Ops display regression were reproduced before correction.

Final integrated Node **22.23.4** verification: **390 tests passed; zero failed/cancelled/skipped/todo**. ESLint zero errors / 13 existing warnings; Prettier and Wrangler 4.152.0 dry-run pass. Two focused independent AI reviews found no blockers in ingress/source boundaries or TOTP/environment wiring.

Actual local workerd/SQLite acceptance-path smoke passed on bundle SHA-256 `c5feb68ff196aba1dfb45568f18fa38b2fed9962055ac22d43ec50252b550493`: owner-authenticated Mini App GET/PUT → Diff → message → Ready → signed Approval → real GitHubService against local outbound stubs. Zero stub writes before approval; exactly four requests create one local branch-only commit. Local default branch unchanged. Duplicate updates and signed Approval replay were rejected before and after full runtime restart. Source sentinel absent from Telegram. **No real provider commit, deployment or owner-device evidence** was produced by this smoke.

Independent review also identified an unchanged **P2** follow-up: wrong-TOTP attempt counts use read/increment/write and Approval callbacks reset attempts. Concurrent invalid submissions can lose increments. This does not bypass the owner boundary or new one-time-step claims; a separate owner/challenge-bound atomic attempt/rate-limit change is still needed. Do not describe the existing attempt counter as a complete brute-force defense.

Read-only Cloudflare observation after these changes still showed deployment `0f5655b0-4ea8-4b46-8332-d8a21cdbfba9`, version `94d93413-e25e-4e27-8e83-7926125ce98f`, 100% traffic, created 2026-10-07. Main still `5d1c083d326db327cc3973a9d3adecc1d8092c91`. Fresh final-head CI/build links belong in PR65 without another self-recording commit.

The remaining R-26 action is concrete: authorize an acceptance runtime for the candidate, perform one owner-confirmed Telegram Approval creating a harmless `nexa/edit-*` test commit, record Android/iOS evidence, reconcile GitHub/Cloudflare/Telegram identifiers, and supply written G0 acceptance. The current no-deploy-before-acceptance instruction in AGENTS.md requires an explicit narrow exception for that acceptance deployment; passing local/CI tests cannot supply it. Do not mislabel the G3 human security review as a G0 prerequisite.
