# Cloudflare Ops READ Plugin — Design

Date: 2026-10-04
Status: Design approved in chat; implementation pending written-spec review
Base: `main` at `11dc458890bfe0e1dc0e5374f405d5e8965cc355`

## 1. Goal

Add Cloudflare as a first-class, read-only operational provider in Nexa Dev Bot so the Telegram owner can inspect the real production Worker state without exposing sensitive diagnostics through the public HTTP surface.

This phase is deliberately READ-only. It does not add deploy, redeploy, rollback, settings mutation, secret mutation, route mutation, or any other Cloudflare WRITE/DESTRUCTIVE action.

## 2. Product outcome

From the owner-only Telegram operational console, Nexa can report source-backed Cloudflare information for the configured Worker, including:

- active deployment and active Worker version;
- traffic allocation for the active deployment;
- Worker bindings as safe names/types only;
- Durable Object bindings and class names where the Cloudflare API exposes them;
- observability/logging/tracing state;
- safe runtime/version metadata useful for operations;
- explicit provider failures instead of fabricated healthy state.

The existing public `/status` endpoint remains minimal health-only and MUST NOT expose these diagnostics.

## 3. Architectural approach

Cloudflare becomes an independent provider/plugin under `src/plugins/cloudflare/`, following the existing provider/plugin separation rather than embedding Cloudflare API calls in `src/ops-menu.js`.

The provider owns Cloudflare HTTP/API semantics and normalization. The Telegram/Ops layer consumes a narrow normalized interface and owns presentation only.

Expected logical components:

1. **Cloudflare client/provider** — authenticated GET requests, response validation, redacted errors, normalization.
2. **Cloudflare plugin registration** — declares READ actions and risk metadata through the existing plugin/action registry pattern.
3. **Operational diagnostics integration** — obtains a Cloudflare snapshot without coupling menu rendering to Cloudflare REST payload shapes.
4. **Telegram views** — render production state, refresh/recovery controls, and explicit unavailable/error states.

No Cloudflare provider code may depend on Telegram formatting.

## 4. Configuration and credentials

Runtime configuration must use bindings/secrets; credentials MUST NOT be hard-coded.

Required Cloudflare provider inputs are the account identifier, Worker/script name, and an API credential with only the permissions required by the READ endpoints used by this feature.

Implementation must first inspect the current runtime/config pattern and reuse existing configuration where practical. If a new Worker secret is required, only its configured/missing state may be rendered or logged; its value must never enter source, tests, audit records, Telegram messages, PR text, or diagnostics.

The existing GitHub Actions deployment credentials are not assumed to be available automatically inside the running Worker.

## 5. Cloudflare API contract

Before implementation, each Cloudflare endpoint must be selected from the current Cloudflare OpenAPI/documentation rather than model memory.

The initial provider should use the minimum endpoint set needed to obtain:

- Worker deployments;
- Worker versions/version metadata;
- Worker settings/bindings and observability configuration.

The provider must tolerate fields absent from Cloudflare responses and normalize optional values rather than leaking raw provider payloads into the UI.

## 6. Security boundary

All new actions in this phase are `READ`.

Existing Nexa owner-only authorization remains authoritative. This feature creates no alternative HTTP diagnostics endpoint and no bypass around Telegram owner validation.

The provider and presentation layer MUST NOT expose:

- API tokens or authorization headers;
- secret binding values;
- Telegram/GitHub credentials;
- signed approval material;
- source/draft text;
- raw Cloudflare error bodies when they could contain sensitive material.

Bindings may expose only safe metadata required for operations, such as binding name, type, and Durable Object class name. Secret-text bindings are represented as configured metadata only.

Cloudflare failure must fail explicitly. A failed API request must never be translated into a healthy/green provider state.

## 7. Public status boundary

`/status` remains a public minimal health endpoint.

Detailed Cloudflare account, deployment, binding, observability, version, or provider-error information is owner-only through Telegram. Regression coverage must prevent accidental publication of the new snapshot through `/status`.

## 8. Telegram UX

The operational console should expose a clearly named Cloudflare view from the existing Ops/Status area rather than creating a misleading top-level placeholder.

The view should show, when available:

- provider connection state;
- Worker/script identity;
- active deployment/version;
- traffic percentage/allocation;
- observability/logging/tracing state;
- safe binding summary;
- refresh control;
- back/recovery navigation.

Unavailable data must be labelled unavailable/unknown, not guessed. Provider errors must be concise and redacted.

Telegram message text must remain within the 4096-character limit and callback data within 64 bytes. If binding detail could overflow the message, the UI must summarize or paginate rather than truncate security-relevant state ambiguously.

## 9. Data flow

1. Owner opens Cloudflare/Ops view in Telegram.
2. Existing bot owner boundary authorizes the request.
3. Ops orchestration calls the Cloudflare READ provider/plugin.
4. Provider performs authenticated Cloudflare GET requests.
5. Provider validates and normalizes responses into a safe operational snapshot.
6. UI renders only the normalized snapshot.
7. Errors are redacted and rendered as explicit provider failures.

No Safe Approval is required because this phase performs no provider mutation.

## 10. Error handling

The provider must distinguish at least:

- provider not configured;
- authentication/permission failure;
- Worker/script not found;
- Cloudflare/network/provider failure;
- malformed/unexpected provider response;
- partial-data state when one safe READ succeeds and another fails.

A partial snapshot may render successful facts alongside an explicit warning for unavailable sections. It must not report the overall Cloudflare provider as fully healthy if required probes failed.

## 11. Testing strategy

Implementation follows TDD: RED before production implementation.

Minimum automated coverage:

- provider request construction and authenticated READ behavior;
- normalization of deployments, versions, settings/bindings, and observability;
- no secret binding values in normalized output;
- redaction of provider errors;
- explicit configured/missing behavior;
- partial failure behavior;
- plugin registry contains Cloudflare READ actions with correct risk class;
- Telegram Cloudflare view renders source-backed data and recovery navigation;
- Telegram 4096-character and callback 64-byte constraints;
- public `/status` remains minimal and contains no Cloudflare operational detail;
- existing GitHub, Workspace, Safe Approval, replay protection, Guide, and Ops regressions remain green.

After relevant tests pass, run the complete `npm test` suite.

## 12. Delivery and verification

Implementation must occur on a separate implementation branch after this design is reviewed and an implementation plan is approved.

Definition of done for the implementation phase:

- RED evidence captured;
- implementation and tests complete;
- full suite green;
- security/diff review complete;
- PR opened;
- PR CI green;
- Cloudflare Preview green where relevant;
- locked-head merge;
- post-merge main CI green on exact merge SHA;
- Deploy workflow green on exact merge SHA;
- active Cloudflare Worker deployment/version independently verified;
- runtime bindings/observability re-verified;
- documentation/Guide synchronized if the user-visible control changes.

## 13. Explicit non-goals

Not included in this phase:

- deploy/redeploy;
- rollback;
- Worker settings mutation;
- secret or binding mutation;
- routes/domains mutation;
- log streaming or persistent incident storage;
- automated remediation;
- scheduled monitoring/notifications;
- multi-account Cloudflare management;
- public operational diagnostics.

Those require separate scope and, for mutation, Safe Approval/risk design.

## 14. Acceptance criteria

The phase is accepted only when an owner can open the Cloudflare operational view in Telegram and see real, current, safely normalized Worker state; provider failures are explicit; no secret value is exposed; no Cloudflare mutation path exists; `/status` remains minimal; and the full regression suite and production deployment verification pass.