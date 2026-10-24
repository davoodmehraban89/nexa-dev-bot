# Nexa Studio working instructions

- Start with `docs/handoff/START_HERE.md` and the authoritative `docs/contract/NEXA_STUDIO_V3.md`. The original DOCX next to it wins over transcription differences. The proposed roadmap in PR #62 does not replace or weaken that contract.
- Respect G0 → G4 and owner acceptance at each gate. Do not claim completion from mock tests, a draft PR, or a local build. Never invent device recordings, human review, CI or runtime evidence.
- Continue this Worker/DO codebase. No rewrite or unapproved infrastructure. Keep owner checks, Safe Approval, durable replay, TOTP and Kill Switch. No direct default-branch writes or force pushes.
- The owner wants economical handoffs: inspect changed/assigned files and relevant tests, use the recorded audit inventory, avoid repeating full audits or broad test runs without a code change or failure. Routine work may go to another chat; a chat without tools must return patches/checklists, not pretend it executed them.
- Before behavior changes, demonstrate a failing regression, implement narrowly, then run relevant tests. Run full verification once on the final tree. Use Node 22, `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build:check`.
- Keep logic changes separate from formatting. The initial formatting-only commit is `40e14f7`; do not redo that sweep.
- Escalate sensitive changes for focused review: auth/session/grants, credentials/encryption/rotation, approval/replay/TOTP/kill-switch, write orchestration, webhook claims, concurrency, schema migration, deployment/rollback. Never include tokens, source/draft bodies or raw provider errors in logs, URLs, callbacks, handoffs or commits.
- Do not re-enable old unlock callbacks: they lack signed Approval + TOTP. Do not infer production revision from any unrelated runtime version at 100% traffic.
- Preserve current repository visibility. Check live GitHub state instead of assuming a billing restriction or its removal. User's latest stated intent was that they changed it to public; observed API state must be recorded separately.
- Use a feature branch and draft PR for unaccepted work. No main merge or deployment while required CI, owner/device evidence or gate approval is missing. Record exact SHA, test counts, outstanding requirements, and the next smallest task in the handoff.
