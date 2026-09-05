# Build Notes

## 2026-08-24 — Guided build onboarding

- Completed onboarding rounds: essentials, idea sharpening, and optional visual/tone round.
- Confirmed project name: **ScriptOps**.
- Confirmed primary user: indie producer; 1st AD and production manager are supporting collaborators.
- Confirmed signature demo moment: Revision Ripple updates all five production artifacts after one approved change.
- Confirmed demo reliability choice: lead with a bundled sample screenplay; show PDF upload as a secondary capability.
- Confirmed fallback cut order: protect schedule and budget, then locations, then casting briefs.
- Active shaping: participant rejected both a calm production office and a flashy control room, choosing “an air traffic control tower at night” to express quiet operational authority.
- Active shaping: participant concentrated nearly all cinematic motion in the Revision Ripple moment and defined the target user emotion as “control, not relief or surprise.”
- Learner calibration: minimal TypeScript experience with AI coding assistants; downstream documents should use conservative technology choices and explicit verification.
- Deepening rounds: not applicable to onboarding.

## 2026-08-24 — Scope

- Time budget confirmed: 2–3 days at 6–8 hours per day (approximately 18–24 hours).
- Scope research references: Linear for interaction quality, StudioBinder for production vocabulary, and Autodesk ShotGrid for linked dependency concepts.
- Confirmed one fixed demo project rather than multi-project CRUD.
- Active shaping: participant retained Clerk but redefined it as an allow-listed cost-control gate around agent invocation, with public signup disabled and a global daily ripple cap.
- Active shaping: participant restored a lightweight two-page PDF export because “no PDF, no file, just a UI that resets” would undermine production credibility.
- Confirmed New Mexico as the grounded location-scouting region with live results and a visibly disclosed cached fallback.
- Confirmed natural-language change requests against a selected scene; revised-screenplay diffing is deferred.
- Confirmed propose → approve → atomic commit, with the previous baseline preserved if any required specialist fails.
- Confirmed the activity rail is also the visual Revision Ripple, reducing UI scope while preserving the demo payoff.
- Track correction: ScriptOps targets Replit. Location grounding proves Google Cloud runtime functionality, not ClickHouse integration.
- Deepening rounds: 1.

## 2026-08-24 — PRD

- Converted the scope into eight user-facing epics with testable acceptance criteria.
- Confirmed first-screen requirements: production identity, selected scene, five populated summary cards, and explanatory Revision Ripple CTA visible without clicking.
- Confirmed shared artifact detail drawer rather than five pages.
- Confirmed proposal controls: approve, discard, and edit request/rerun; no manual artifact patching.
- Confirmed error rules: full retry after specialist failure, cached fallback after live location failure, and viewable project/evidence/PDF after daily-cap exhaustion.
- Active shaping: participant clarified that shared Clerk credentials require a long-lived browser demo-instance identifier independent of both account identity and Clerk login state.
- Confirmed logout/login must preserve the same demo instance and used-ripple state; only explicit `Reset demo` starts another cycle.
- Accepted residual gap: cookie clearing or incognito can create a new instance; the global daily cap is the backstop.
- Confirmed the activity rail is the dominant analysis-state visual, not a generic spinner.
- Confirmed PDF remains disabled until approval so page two always represents a real revision record.
- PRD deepening rounds: 0; participant chose to write after mandatory edge-case review.

## 2026-08-24 — Technical Spec

- Confirmed a single full-stack Next.js + TypeScript application on Replit, with the official Google ADK for TypeScript running server-side.
- Confirmed Replit managed SQL for mutable state and versioned JSON fixtures for the immutable production baseline and cached location fallback.
- Active shaping: participant caught the schedule-to-budget correctness dependency. Final workflow is Breakdown → Schedule → parallel Budget/Locations/Casting → deterministic proposal validation.
- Confirmed Google Places Text Search (New) through a typed custom ADK tool so candidates have structured source URLs, timestamps, and cacheable responses.
- Confirmed real structured progress events streamed from the server; the activity rail is not a timed fake animation.
- Confirmed demo-instance rows are keyed by the long-lived browser cookie, never by the shared Clerk user ID.
- Chose a compact four-table persistence model with complete production/proposal snapshots stored as validated JSONB to protect the 18–24 hour build budget.
- Chose stable `gemini-3.7-flash` and pinned Google ADK dependencies, subject to one Replit smoke test before the full UI build.
- Deepening finding: request-owned SSE could not honestly promise refresh survival. Replaced the combined stream endpoint with `POST /api/ripples` for transactional job creation plus passive SSE/status endpoints.
- Deepening decision: deploy on a Replit Reserved VM from the start. Next.js `after()` detaches execution from the initiating response; PostgreSQL remains authoritative and stale-run recovery handles process interruption.
- Deepening decision: do not hardcode a 90-second stale threshold. Measure five published golden-path runs, then configure at least 2× p95 with provider-specific timeouts.
- Deepening decision: add deterministic Breakdown and Schedule schema gates; parallel specialists use distinct ADK state keys and the executor reloads trusted context by `runId`.
- Deepening decision: enforce explicit queued/analyzing/rejected/proposal-ready terminal transitions, one open run per instance/cycle, conditional late writes, and transactional idempotency/usage reservation.
- Deepening finding: PRD cap-exhaustion behavior required an explicit immutable approved-example fixture and representative PDF, visibly disclosed as not generated in the current browser session.
- Deepening scope freeze: PDF upload inspection is P1 and begins only after the published golden path passes; no further MVP features are added.
- Spec deepening rounds: 1 complete.

## 2026-08-24 — Parallel Track Pivot

- Reassessed all five partner tracks against the current product rather than preserving the original hosting choice by inertia.
- Selected the **Parallel track** because current, cited production research can materially improve ScriptOps' schedule, budget, and location decisions; the integration strengthens the product thesis instead of merely satisfying deployment eligibility.
- Confirmed runtime proof: every accepted live Revision Ripple attempts a server-side Parallel Search call, and the resulting citations, excerpts, retrieval time, and live/cache status are visible in the product.
- Active shaping: replaced the old five-node rail with six workflow stages—Breakdown → Parallel Evidence → Schedule → Budget → Locations → Casting—while retaining exactly five production artifacts.
- Active shaping: inserted evidence before Schedule so external operating constraints can influence shoot-day planning; Budget remains downstream of Schedule for numerical consistency.
- Replaced Replit Reserved VM, Replit SQL, PostgreSQL/Drizzle, Google Places, and Next.js `after()` with Google Cloud Run, Cloud Tasks, Firestore, Parallel Search, and an authenticated task worker.
- Chose Cloud Tasks because analysis must be independent of the browser/SSE connection; the task request, not a post-response callback, owns execution.
- Chose Firestore complete-plan/proposal documents plus transactions to preserve the simple atomic-approval model without a SQL migration/ORM layer.
- Retained Clerk shared judge access and the browser-specific long-lived demo cookie independent of auth state.
- Retained live-first/cached-fallback behavior, now for broader production evidence rather than Places-only location results.
- Confirmed Codex as the primary builder; Replit Agent and Replit hosting are no longer part of the project or submission claim.
- Build strategy: autonomous implementation with four user-facing visual checkpoints, a commit after each working vertical slice, and Revision Ripple as the protected wow moment.

## 2026-08-24 — Build Checklist

- Handed checklist sequencing to Codex and selected autonomous build mode, consistent with the participant's request to proceed and minimal TypeScript experience.
- Locked four visual review points: baseline dashboard, live Parallel evidence rail, approved ripple/PDF, and final deployed demo.
- Sequenced the highest-risk deployed proofs first: Cloud Run, Cloud Tasks/Firestore detachment, Gemini/ADK, and Parallel Search all pass before substantial UI polish.
- Defined 12 implementation stages covering the 18–24 hour envelope; each stage is to be executed in 15–30 minute atomic substeps.
- Protected Revision Ripple as the submission wow moment and made the Parallel Evidence stage visible in both product and handoff materials.
- Locked the first cut: PDF screenplay inspection is P1 and begins only after every P0 deployed check passes with at least two hours remaining.
- Checklist deepening rounds: skipped on handoff path; the prior architecture deepening and track reassessment supplied the risk decisions.

## 2026-08-28 — Build item 1: public-ready Next.js bootstrap

- Initialized the repository on `main` with a pinned Node.js `22.16.0` / npm `10.9.2` toolchain and exact application dependency versions, including Next.js `16.3.3`, React `19.2.8`, Tailwind CSS `4.3.3`, TypeScript `5.9.3`, Vitest `4.1.11`, and Zod `4.4.3`.
- Pinned ESLint `9.39.5` as the newest release accepted by the peer ranges of Next.js 16.3.3's React/import/accessibility plugins; ESLint 10 was tested and rejected because it produced invalid peer dependencies.
- Added standalone Next.js output for Cloud Run, a provider-free `/api/health` route, a typed environment schema, `.env.example`, repository ignore rules, planned source boundaries, README setup/testing guidance, and an MIT license.
- Replaced the generic starter with a restrained near-black/amber ScriptOps placeholder that establishes the intended operational visual direction without starting the later dashboard milestone.
- Next.js 16 generated `AGENTS.md` and `CLAUDE.md` during the first dev run; they are retained so future agents read version-local Next.js documentation before framework edits.
- Verification passed: `npm run lint`, `npm run typecheck`, `npm test` (3 tests), and `npm run build`. The local `/` route returned HTTP 200, the build emitted standalone output, and `/api/health` compiled as a dynamic route.
- Repository hygiene passed: `node_modules`, `.next`, the local npm cache, `.env.local`, coverage, logs, and service-account JSON patterns are ignored; a source scan found no populated provider key or private-key material.

## 2026-08-28 — Build item 2: Google Cloud foundation and deployed hello

- Created dedicated billed project `scriptops-agentic-arkad` (`ScriptOps Agentic Cinema`) instead of modifying the preconfigured, unrelated `sudoku-api-project-506106` project.
- Selected `us-central1` for Cloud Run, Cloud Tasks, and Firestore so the first durable vertical slice shares a region; created the Standard Firestore Native `(default)` database with free-tier status and no PITR/delete-protection add-ons.
- Enabled the minimum APIs: Cloud Run, Cloud Build, Artifact Registry, Cloud Tasks, Firestore, Vertex AI, and Secret Manager.
- Created `scriptops-app` and `scriptops-task-invoker` service accounts. The app identity received Vertex AI user, Firestore data user, Cloud Tasks enqueuer, and log-writer roles; it can act as only the dedicated task invoker. The task identity has Cloud Run Invoker on only the `scriptops` service.
- Active shaping/security decision: a project-wide `roles/secretmanager.secretAccessor` grant was rejected as broader than necessary. ScriptOps will grant secret access on each individual secret when the secret is created.
- Created low-throughput queue `scriptops-ripples` in `us-central1` with one concurrent dispatch and one dispatch per second. Item 3 will tighten retry attempts/backoff while implementing the idempotent worker.
- Added `.gcloudignore` and deployed revision `scriptops-00001-j6v` from source with scale-to-zero, one maximum instance, 512 MiB memory, one CPU, and the dedicated application identity.
- Live verification passed: Cloud Run reports the revision ready, the queue is `RUNNING`, Firestore reports `FIRESTORE_NATIVE` / `STANDARD` in `us-central1`, and `https://scriptops-916693774226.us-central1.run.app/api/health` returned `{"service":"scriptops","status":"healthy"}`.

## 2026-08-28 — Build item 3: durable Cloud Tasks dispatch proof

- Pinned official server packages: `firebase-admin@14.3.0`, `@google-cloud/tasks@7.0.0`, and `google-auth-library@11.0.2`.
- Added a temporary protected trigger, Firestore smoke-run repository, named Cloud Task enqueue, protected status endpoint, and internal delayed worker. The trigger writes `queued`, returns `202`, and does not execute the worker inline.
- The worker validates a Google-signed OIDC token's issuer, exact Cloud Run audience, verified email, and exact `scriptops-task-invoker@scriptops-agentic-arkad.iam.gserviceaccount.com` identity before claiming the run transactionally.
- Added execution tokens and conditional completion so a duplicate/late smoke worker cannot complete work it does not own.
- Created only the `scriptops-smoke-token` secret and granted the runtime identity accessor on that one secret. The 32-byte random token was piped directly into Secret Manager; it was not printed, stored locally, or committed.
- Tightened `scriptops-ripples` to three attempts, 5–60 second exponential backoff, one concurrent dispatch, and one dispatch per second.
- Build finding: Next.js Turbopack could not bundle the generated Cloud Tasks loader (`Cannot find module as expression is too dynamic`). Applied the installed Next.js 16 documented `serverExternalPackages` boundary for `@google-cloud/tasks` and `google-auth-library`; the production build then passed.
- Deployed revision `scriptops-00002-6ts`. A protected trigger returned `queued` in 2.181 seconds for run `e114cd8f-bbd6-45a0-b9d3-a1540af86b5e`; the initiating request ended, and Firestore later reported `completed` with `startedAt=2026-08-28T08:39:35.220Z` and `completedAt=2026-08-28T08:39:45.535Z`.
- Deployed identity checks passed: no bearer token returned `401 TASK_IDENTITY_MISSING`; a Google-signed token with the wrong audience/service identity returned `401 TASK_TOKEN_INVALID`.
- Verification passed: lint, typecheck, 8 unit tests (including wrong issuer/audience/email and missing bearer cases), production build, deployed queue/revision inspection, and persisted post-client completion.

## 2026-08-28 — Build item 4 adaptation: split provider verification

- Deployed revision `scriptops-00003-72z` with protected Gemini/ADK and Parallel smoke routes after local lint, typecheck, 11 tests, and production build passed.
- Parallel Search succeeded live and persisted eight visibly attributed evidence records, including request ID, URL, excerpt, query/objective provenance, retrieval time, and `live` status.
- The Gemini/ADK route returned the intentionally redacted `GEMINI_SMOKE_FAILED` for run `5071e3ad-4287-4d8d-a5cf-144f2eff57de`; item 4 was not marked complete or committed.
- Following the guided build failure protocol, work paused rather than guessing. Arkadiusz approved keeping revision 3 and splitting the item into verified Parallel substep 4a and Gemini compatibility substep 4b.
- Rollback to revision 2 remains available, but the protected revision 3 is retained because it does not mutate the product baseline and preserves useful provider evidence.
- Revision `scriptops-00004-ll9` replaced ADK-facing boolean literal enums with ordinary booleans while preserving strict post-response validation and added safe error classification. Local lint, typecheck, 17 tests, and production build passed, but deployed run `76e23e5e-de6e-4d76-9750-de130a3bacc5` still failed as the otherwise unclassified `GEMINI_PROVIDER_FAILED`.
- Arkadiusz approved a second diagnostic split: direct Vertex transport proof (4b.1), followed by the isolated ADK runner fix and final provider verification (4b.2). Revision 4 remains live because all diagnostic routes are token-protected.
- Direct dependency `@google/genai@2.19.0` and a protected Vertex-only diagnostic were deployed as revision `scriptops-00005-2st` after typecheck, 18 tests, lint, and production build passed.
- Diagnostic run `d7b11d6e-59cd-4ec0-8e0d-1a8eb075e8ee` persisted `GEMINI_MODEL_UNAVAILABLE` for `gemini-3.7-flash` at `us-central1`. This isolates the blocker to model/location availability rather than Cloud Run request handling, Firestore persistence, Parallel configuration, or the ADK runner.
- Arkadiusz approved keeping Cloud Run, Cloud Tasks, and Firestore in `us-central1` while moving only Vertex AI Gemini inference to `global`, where the selected model is available.
- Revision `scriptops-00006-wqq` cleared the model/location blocker but exposed a strict-output mismatch. The provider response stayed redacted; a safe diagnostic layer was added that records only invalid schema field paths and never generated values.
- Direct Vertex run `1439d309-c8ae-473c-a348-01c097e08916` passed on revision `scriptops-00007-4t2`, proving `gemini-3.7-flash`, the `global` Vertex endpoint, Cloud Run service identity, JSON response schema, and the strict Scene 14 contract independently of ADK.
- ADK run `f17e3bf5-70ef-4d8d-a9ac-d6e3c9c263d8` then isolated the remaining incompatibility to ADK final-event extraction. Arkadiusz approved using ADK's documented `outputKey` session state as the primary structured result with a single whole-document JSON-fence compatibility fallback.
- Revision `scriptops-00008-qr6` passed the deployed Google ADK proof. Run `1c4bb6e0-08ff-4ef0-b451-ea6370be60e6` persisted every required golden signal using `@google/adk@2.0.0` and `gemini-3.7-flash` through Vertex AI at `global`.
- The same revision preserved the Parallel integration: live run `79ff3a36-188c-4c47-b412-1eefd02a3a65` persisted eight attributed evidence records with Parallel request `search_f366a43c34512415f544a35063ece5e8` using `parallel-web@1.3.2`.
- Provider slice verification passed: lint, typecheck, 23 tests, production build, Firestore-backed readbacks for both providers, and client-bundle secret-name scanning. Provider keys remain server-only and resource-scoped in Secret Manager.

## 2026-09-04 — Build item 5: production contracts and immutable fixtures

- Added strict Zod contracts for the complete production plan, five typed artifact impacts, evidence/provenance bundles, revision proposals, six-stage progress, public failures, approved revisions, and all fixture sources.
- Enforced persistence boundaries before Firestore writes: validated snapshots fail above 700 KB, prohibit unsupported certainty claims, require every scene to be scheduled exactly once, reject unknown scene/cast references, and reject missing evidence references in impacts, budget drivers, and locations.
- Added four versioned fixtures for the fictional **Dust & Thunder** demo: a 14-scene screenplay, immutable baseline plan, visibly cached evidence fallback, and a compact approved-example source that hydrates into a complete validated proposal and approved plan.
- Encoded the prepared Scene 14 request as deterministic golden invariants across night/rain/child/stunt breakdown changes, sourced New Mexico evidence, schedule constraints, positive budget drivers, re-ranked locations, and archetype-only child/stunt casting briefs.
- Kept performer guidance archetype-only and fixture loading deeply frozen at runtime; the approved example increments the external plan version once while the proposal remains approval-free.
- Focused verification passed 12 contract tests covering malformed schedules, inverted budget bands, missing evidence IDs, named performers, incomplete proposals, oversized snapshots, prohibited certainty language, and golden-path drift. Repository-wide verification passed lint, typecheck, all 35 tests, and the production build.
- This item changed code and fixtures only; no new Google Cloud revision or infrastructure resource was deployed.

## 2026-09-04 — Build item 6: transactional Firestore ripple state

- Added validated persistence records for browser-keyed demo instances, ripple runs, daily UTC usage, run status, stage state, proposals, public failures, execution leases, and timestamps. Mutable ownership is keyed only by the cryptographically random demo UUID; no Clerk user identifier enters a document key or state contract.
- Added a shared transactional state-store boundary with production Firestore and deterministic in-memory implementations. The Firestore adapter converts native timestamps at the boundary and refuses any broad test cleanup unless a non-empty namespace is supplied.
- Implemented idempotent baseline initialization, hash-derived cycle-scoped run UUIDs, concurrent queued-run reservation, one-open-run and one-approved-ripple controls, UTC daily caps, enqueue failure, semantic rejection, worker claim/reclaim, heartbeats, conditional stage transitions, execution-token fencing, complete proposal writes, discard, atomic approval, and reset/supersede behavior.
- Approval validates ownership, proposal completeness, cycle, base version, and open-run identity in one transaction; it replaces all five artifacts, records the approved revision, and increments the external plan version once. Concurrent duplicate approval returns the already-approved state without a second increment.
- Reset keeps the same browser demo ID and daily usage record, increments the cycle, restores the immutable baseline and plan version 1, and supersedes a ready unapproved proposal. Queued/analyzing work blocks reset.
- Local transactional verification covers 14 state-machine cases including competing starts, duplicate idempotency, global cap contention, invalid transitions, incomplete proposals, stale lease takeover, late-worker writes, duplicate approval, version/cycle mismatch, discard, reset, enqueue failure, and semantic rejection.
- A uniquely namespaced integration run against the dedicated `scriptops-agentic-arkad` Firestore project passed concurrent create, single usage reservation, version-drift rejection, five-artifact approval, and concurrent duplicate approval. The generated test collections were removed after the run. The initial live run exceeded Vitest's 5-second local default without an assertion failure; the remote-only test now has a bounded 30/120-second timeout and passed in 33.86 seconds.
- No Cloud Run revision or permanent Google Cloud resource was created for this item.

## 2026-09-04 — Build item 7 visual checkpoint (authentication verification pending)

- Implemented the Next.js 16 Clerk boundary, exact user-ID allow list, production fail-closed behavior, signed long-lived browser demo cookie, bootstrap API, and browser-isolated state initialization.
- Replaced the placeholder with the populated **Dust & Thunder** dashboard: Scene 14 is preselected, all five artifact summaries are present in the first 1440×1000 viewport, scene selection works, and one accessible shared detail drawer renders each artifact.
- Local verification passed lint, typecheck, 56 tests, the optimized production build, API cookie stability/isolation checks, browser synchronization, drawer/keyboard interactions, and a zero-error browser console inspection.
- Arkadiusz initially approved the baseline hierarchy, then reopened the visual pause after using the authenticated workspace and said it was “too dark, too dense to be usable.” The dashboard now opens in a warm high-contrast light theme, retains the planned night treatment behind a session theme toggle, uses a balanced 3+2 desktop artifact grid, and increases scene/card spacing and type size.
- The first local Clerk login loop was traced to a sandboxed development server that could not complete Clerk’s server-side handshake. Restarting the server with network access removed the loop; replacing an email-shaped allow-list entry with Clerk’s immutable `user_...` ID allowed the supplied account through, and Arkadiusz confirmed the dashboard was working.
- Post-adjustment verification passed lint, typecheck, all 56 active tests, the optimized production build, the authenticated light/dark toggle, Scene 14 selection, and all five populated artifact controls in the accessibility tree. The constrained 741×912 in-app pane intentionally uses the more open mobile layout and scrolls; the first-desktop-viewport requirement remains targeted at the documented 1440×1000 review size.
- **Visual pause 1 approved:** Arkadiusz reviewed the revised authenticated workspace and said, “its great lets move on and continue.”
- Same-browser logout/login passed through the live Clerk form and returned directly to the same browser workspace. A separate clean Chrome context correctly reached the protected sign-in gate; the earlier two-client cookie/API verification proved distinct stable demo cookies and independent baseline initialization across browser contexts.
- Item 7 is complete after the visual approval, live supplied-account login, logout/login persistence, clean-browser gate, cookie isolation checks, lint, typecheck, 56 active tests, and production build. Production Clerk secrets are intentionally deferred to a later Cloud Run release rather than added during this local dashboard slice.

## 2026-09-05 — Build item 8: durable revision lifecycle

- Replaced the smoke-only entry point with a protected selected-scene composer and real `POST /api/ripples` contract. Requests now require an authenticated allow-listed user, the signed browser demo cookie, exact same-origin delivery, a production-relevant description, and a client UUID idempotency key.
- Added deterministic duplicate suppression, the one-open-run analysis lock, daily-cap enforcement, a deterministic Cloud Task name, and an OIDC-authenticated worker route. Public run snapshots redact the browser demo ID, idempotency key, and execution token.
- Added six-stage persisted activity UI, passive SSE observation, polling fallback, refresh rehydration, malformed-event recovery, editable validation failures, enqueue-failure recovery, and timeout recovery for both workers that stop heartbeating and queued tasks that never start. No progress stage is simulated in the client.
- Local development now uses the configured Firestore project so independently bundled Next.js route handlers share the same durable state; the in-memory repository remains the no-project test fallback. Optional blank `.env.local` values normalize to unset while non-blank values remain strictly validated.
- Browser verification proved a real Firestore-backed `202` start, analysis locking, all six pending stages, unchanged Plan v1 cards, same-browser refresh rehydration, SSE closure followed by status polling, and preserved editable request text. Repository tests cover concurrent duplicate starts, enqueue failure, analyzing timeout, and queued-task timeout without baseline mutation.
- Deployed revision `scriptops-00009-rgs` is serving 100% of traffic and `/api/health` returned healthy. A direct worker invocation returned `401`; an OIDC Cloud Task claimed run `e211797d-02a9-5354-95c9-68295502bee4` and persisted the intentional pre-Stage-9 bridge failure `AGENT_CREW_NOT_CONNECTED` with one attempt, `baselineChanged: false`, and `retryable: true`.
- Final verification passed lint, typecheck, 62 active tests, and the optimized Next.js production build. Stage 9 will replace the safe bridge failure with the evidence-aware ADK workflow while retaining the Stage 8 lifecycle and smoke coverage.
