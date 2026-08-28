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
