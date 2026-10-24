# Nexa Studio v3 — G0 implementation checkpoint, 2026-10-24

**Status: implementation foundation delivered for review; G0 NOT ACCEPTED; no G1 advancement, merge or deployment.**

## Revision and source
- Main baseline: `5d1c083d326db327cc3973a9d3adecc1d8092c91`.
- Delivery branch: `feat/studio-g0-foundation`; obtain its latest exact SHA from GitHub before resuming.
- Delivery PR: [#65](https://github.com/davoodmehraban89/nexa-dev-bot/pull/65), draft/unmerged.
- Behavior implementation verified locally: `abf760e5d2631c8c4ef48a7738b33a9eae34ab4d`.
- Original owner booklet is preserved in `docs/contract/NEXA_STUDIO_V3.original.docx`; its SHA-256 is `299459be0e364175d0d8afa96f924b5e5cab49f9015e21ce6047a5f1a98bbf13`. Filename originally said v2; internal title and owner's direction identify v3. Independent comparison found no missing nonblank source paragraphs in the readable transcription.
- PR #62's proposed/softened roadmap is historical context, not the authoritative contract. PR #63 and #64 safety changes were integrated locally; their inclusion is not a production merge.

## Requirement evidence

| ID | Implemented / evidence | Outstanding acceptance |
| --- | --- | --- |
| R-10 | Formatting-only commit `40e14f7`; 116 executable JS ASTs and template literal values unchanged. Pinned Prettier 3.6.2, ESLint 10.13.0 and lockfile. Baseline 282 tests pass before/after. | Exact-head GitHub CI and final acceptance; 13 legacy lint warnings remain explicitly visible. |
| R-11 | `WORKSPACE_EDITOR_LIMITS` supplies editor default, API, upload default and guide messages. Existing byte/code-point boundaries plus two default-upload regressions pass. Current ceilings remain 20,000 / 65,536, 8 files / 131,072 aggregate bytes. | Device evidence and CI. Old 3,000/12,000 claims belong to historical Phase 1 plans. |
| R-12 | `/health` returns plain `ok` with no-store; `/` and `/status` version comes from package.json via `src/version.js`. New health/version tests and actual workerd route smoke pass. | Exact-SHA deployment and independent runtime check; no deployment done here. |
| R-13 | Durable 24h update-ID claim in isolated bot/update domain using existing Replay Guard; atomic expiry+alarm; malformed update 400, guard outage 503 before effects, duplicate 200. Claimed handled/thrown errors acknowledge 200 with fixed metadata logs. Unit/concurrency/expiry/error tests plus actual SQLite runtime restart smoke pass. | CI and device/runtime smoke. At-most-once crash gap below is explicit. |
| R-27 | Full-read required inventory of 86 baseline files in `G0_READ_INVENTORY.md`; additional core/DO modules reviewed; confirmed defects and remaining risks recorded. | Findings require their own fixes/reviews; reading is not full security acceptance. |
| R-26 | Existing historical Phase 1 evidence at `docs/FINAL_ACCEPTANCE_V2_1.md`: branch `nexa/edit-b4Od3BIMYd`, commit `0b7c796efb3d77ac2c225d5fe6d1cacaaf4eabe2`. Phase 2 evidence is separate. | **Blocked by fresh authorized owner-device Approval/Telegram/Cloudflare/GitHub evidence on the candidate.** No new real provider commit was made for this report. |

## Other confirmed defects corrected
- Sensitive-path file preview withholds contents instead of sending them into Telegram; PR draft state is retained so merge guards reject drafts.
- `/status` and `📊 وضعیت` await the asynchronous status view; malformed Cloudflare HTML closing tag removed.
- Historical unlock/confirm-unlock callbacks could select lock and had no signed Approval/TOTP. They now fail closed without any state mutation; locked view offers safe navigation, not an unavailable unlock button. A complete signed/TOTP unlock protocol remains outstanding, not implemented by this patch.
- CI installs with `npm ci` and checks lint, formatting, full tests and pinned Worker bundle dry-run.

## Local verification

Environment: Node **22.23.4**, Wrangler **4.152.0**, existing Cloudflare compatibility date **2026-10-02**.

- Full suite: **311 passed; 0 failed, cancelled, skipped or todo**.
- ESLint: **0 errors, 13 legacy warnings**; no warnings were concealed as clean lint.
- Prettier check and `git diff --check`: pass.
- Worker `deploy --dry-run`: pass, all five existing DO bindings, no upload.
- Actual workerd + SQLite DO smoke: `/health`, `/status`, editor route; 8 concurrent claims → exactly 1 success + 7 duplicates; duplicate remains after complete local runtime restart. The smoke's initial persistence setup was corrected to the current Miniflare `resourcePersistencePath`; no application fix was required.
- RED/GREEN: health 1 expected failure → green; default upload 2 failures → green; bot status/HTML 5 failures → green; sensitive preview/draft state 2 failures → green; unsafe unlock 3 failures → green; webhook tests exposed missing claims, repeated effects and raw error handling before correction.
- Three focused independent AI-agent reviews examined changes outside each reviewer's own implementation; no implementation blockers found. They are not the independent human security review required before G3.

## Live provider observations
- GitHub initially still reported private and the retried old CI job `120950845582` had zero steps and the account billing annotation. Later the API confirmed **public**, with visibility update `2026-10-24T18:32:22Z`. Old billing failures must not be treated as current proof of blockage; read the latest candidate CI.
- Cloudflare read-only observation: current deployment `0f5655b0-4ea8-4b46-8332-d8a21cdbfba9`, version `94d93413-e25e-4e27-8e83-7926125ce98f`, 100% traffic, created `2026-10-07T18:16:12.156144Z`. Version metadata did not expose a commit SHA, so this is not proof of the candidate's production revision.
- No repository visibility, account budget, production code, secrets, deployment or provider state was changed by this implementation work.
- Candidate CI details and final PR link are recorded in the PR/handoff once the latest run is available.
- **Fresh GitHub CI succeeded** on behavior head `abf760e5d2631c8c4ef48a7738b33a9eae34ab4d`: [run 40121709579](https://github.com/davoodmehraban89/nexa-dev-bot/actions/runs/40121709579). The former billing block no longer prevented that run. Check the PR's latest head again after documentation-only updates; do not confuse old failed runs with current CI.

## Open blockers and assumptions
- **R-07 remains incomplete:** ordinary source/diff/PR patch content still reaches Telegram through legacy views. Sensitive-path suppression does not satisfy the full prohibition. Blocked on authenticated Mini App display migration and focused security review; never call it done.
- **G0 acceptance remains blocked** on required fresh owner/device evidence, unresolved applicable safety findings and written owner gate approval; CI on the behavior head is now green. Keep requiring exact-head CI for subsequent commits. Do not start G1 merely because tests pass.
- Claim-before-effects is **at-most-once**, not exactly-once or a queue. A crash after durable claim and before handler completion can lose an update; retry is suppressed for 24h. No raw update is persisted for replay. Approval-level idempotent reconciliation remains separate.
- Three-level Kill Switch, secure TOTP unlock, per-user encryption/replay, sessions/grants/D1, If-Match, PAT wizard, CodeMirror, longer Workspace TTL and complete repository pagination are not delivered here.
- Bounded diff memory, automation duplicate-effect races, incident concurrency and unverifiable runtime/SHA correlation remain in `G0_READ_INVENTORY.md`; these are review triggers, not hidden completed work.
- No Android/iOS recordings, Iran network tests, 2-week owner trial, human security review or public-launch evidence was fabricated. Their contract gates remain outstanding.

## Next execution
Use `docs/handoff/START_HERE.md` and `docs/handoff/NEXT_CHAT_PROMPT_FA.md`. First read live CI on the delivery branch, then complete G0 evidence and acceptance; take only one small reviewed task at a time.
