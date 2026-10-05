# Nexa Dev Bot — Final Delivery Rows 16–20

Final delivery is evidence-gated and fail-closed. CI success alone is never enough to declare completion.

## 16 — Release integrity
The exact `main` SHA must be known, CI on the delivery change must succeed, and the production deployment workflow must succeed. A branch-only green run is insufficient.

## 17 — Runtime verification
The deployed revision must correspond to the accepted `main` revision and the production runtime must be healthy. Provider/runtime failures remain explicit; no synthetic success is allowed.

## 18 — Rollback readiness
A known-good production version must exist and rollback procedure must be documented. Rollback/redeploy remains subject to the existing Safe Approval policy and must never create a bypass around owner/action/risk/target/expiry binding or durable replay protection.

## 19 — Operations handoff
The repository must contain an operator runbook, security invariants, and a monitoring/incident path. Secret values, source/draft bodies and signed approval tokens must not be copied into handoff evidence.

## 20 — Final acceptance
All tests must be green, no critical blocker may remain open for the delivered scope, and exact delivery evidence must be recorded. Final acceptance is invalidated by any failed prerequisite row.

## Locked invariants
- Owner-only private Telegram operations.
- READ owner-only; WRITE/DESTRUCTIVE behind central policy and Safe Approval.
- One-time durable replay protection.
- Workspace provider writes remain branch-first; no direct `main` mutation.
- Public `/status` stays minimal and contains no owner diagnostics.
- Production and Preview state remain isolated.
- Provider errors are explicit and never converted to success.

## Verification order
PR CI → locked-head merge → post-merge `main` CI → exact-SHA deploy → production runtime verification → rollback readiness check → operations/security handoff review → evidence record.
