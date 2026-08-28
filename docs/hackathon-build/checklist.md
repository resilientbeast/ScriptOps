# Build Checklist

## Build Preferences

- **Build owner:** Codex implements; Arkadiusz supplies credentials/keys and makes product or visual calls.
- **Build mode:** Autonomous. Once building begins, Codex advances through safe in-scope tasks without re-asking routine implementation questions.
- **Comprehension checks:** N/A; explanations are concise and attached to decisions that affect cost, security, or demo behavior.
- **Git:** Initialize a public-ready repository and commit after every working vertical slice. Never commit secrets, local environment files, generated build output, or judge credentials.
- **Verification:** Yes. Every item ends with command-level or deployed evidence.
- **Check-in cadence:** Speed-run with four visual pauses: populated baseline (item 7), live rail/evidence (item 9), approved ripple/PDF (item 11), final deployed demo (item 12).
- **Time envelope:** 18–24 hours. Each numbered stage should be executed as 15–30 minute atomic substeps; cut P1 upload before compressing the golden path.
- **Protected wow moment:** the Scene 14 Revision Ripple visibly passes through Parallel Evidence and updates all five artifacts only after approval.
- **Selected track:** Parallel. Do not add Replit, Google Places, ClickHouse, Grafana, IBM Bob, or another runtime AI provider.

## Checklist

- [x] **1. Bootstrap the public-ready Next.js project**
  Spec ref: `spec.md > 3. Technology Stack` and `spec.md > 12. File Structure`
  What to build: Initialize a Next.js App Router project with TypeScript, Tailwind, ESLint, Vitest, the planned folder boundaries, environment validation, `.env.example`, `.gitignore`, README skeleton, and an OSI-approved license. Add scripts for `lint`, `typecheck`, `test`, and `build`; commit the lockfile. Do not add provider secrets or P1 upload code.
  Acceptance: A clean clone has an obvious setup path, no secret material, and one placeholder route that builds under the pinned Node/dependency versions.
  Verify: Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; inspect `git status --short` for ignored local/generated files; commit as `chore: bootstrap ScriptOps`.

- [x] **2. Provision the smallest Google Cloud foundation and deploy hello**
  Spec ref: `spec.md > 13. Environment And IAM > Google Cloud resources` and `Deployment`
  What to build: Select/create the Google Cloud project and region; enable Cloud Run, Cloud Build, Artifact Registry, Cloud Tasks, Firestore, Vertex AI, and Secret Manager; create Firestore Native mode, the queue, application service account, and task-invoker service account with least-privilege roles. Deploy the placeholder Next.js service from source and record non-secret resource names in README/build notes.
  Acceptance: A public Cloud Run URL serves `/api/health`; the queue and Firestore database exist in compatible locations; no broad owner keys are stored in the repo.
  Verify: Run `gcloud run services describe scriptops --region <region>`, `gcloud tasks queues describe scriptops-ripples --location <region>`, and open `/api/health`; commit configuration/docs as `chore: add Google Cloud foundation`.

- [x] **3. Prove Cloud Tasks survives browser/request departure**
  Spec ref: `spec.md > 2.1 Why Cloud Tasks` and `spec.md > 8. API Contracts > POST /api/internal/ripples/:runId/execute`
  What to build: Add Firestore admin access, task enqueueing, OIDC identity verification, and a temporary delayed worker smoke path. The public trigger must return immediately, while the task worker persists queued → analyzing → completed after a delay. Validate issuer, audience, and exact invoker service-account email; add unit tests for invalid identities.
  Acceptance: Closing the initiating client after `202` does not cancel work; the delayed completion is visible in Firestore. An unauthenticated or wrong-audience request to the internal route is rejected.
  Verify: Trigger the deployed smoke route, close the client, then read the persisted completion; call the worker route without OIDC and confirm `401/403`; run `npm test`; commit as `feat: prove durable ripple dispatch`.

- [ ] **4. Prove one Gemini/ADK result and one live Parallel result**
  Spec ref: `spec.md > 10. Parallel Search Integration` and `spec.md > 11. Google ADK And Gemini`
  What to build: Install/pin official `@google/adk` and `parallel-web`; add server-only clients and redacted configuration. Create two protected smoke paths/tests: one structured Breakdown result through Gemini on Vertex AI and one Parallel Search result normalized to title, URL, excerpt, query/objective, retrieval time, and live status. Record the working Gemini model ID and package versions.
  Acceptance: Both calls succeed from deployed Cloud Run using only allowed runtime AI providers; Parallel output is persisted and visibly attributable; no provider secret reaches the client bundle or logs.
  Verify: Execute both deployed smoke checks, inspect one stored evidence record, run `npm run build`, and search the built/client source for leaked secret names; commit as `feat: prove Gemini and Parallel integrations`.

- [ ] **5. Lock domain schemas, fixtures, and golden invariants**
  Spec ref: `spec.md > 5. Persistence Model`, `spec.md > 6. Domain Contracts`, and `spec.md > 16.3 Golden-path assertions`
  What to build: Implement Zod schemas for the complete ProductionPlan, Proposal, five artifact impacts, evidence records, stage progress, and public errors. Add the sample screenplay, immutable baseline, approved example, and evidence fallback fixtures. Encode the Scene 14 golden consequences and document-size/prohibited-claim gates as deterministic tests.
  Acceptance: Every fixture validates at test/build time; malformed schedules, inverted budget bands, missing evidence IDs, named actors, incomplete proposals, and oversized snapshots fail before persistence or approval.
  Verify: Run focused schema/fixture tests plus `npm run typecheck`; print only fixture titles/counts—not screenplay contents or secrets—in test output; commit as `feat: define production contracts and fixtures`.

- [ ] **6. Implement Firestore state machine, isolation, idempotency, and cap**
  Spec ref: `spec.md > 4. Authentication, Isolation, And Cost Controls`, `spec.md > 5. Persistence Model`, and `spec.md > 7. Run State Machine`
  What to build: Implement repositories/transactions for browser demo initialization, queued run creation, deterministic run IDs, one open run per cycle, daily UTC reservation, worker claims/execution tokens/heartbeats, proposal writes, discard, atomic approval, and reset. Keep all mutable state keyed to the long-lived demo cookie, never the Clerk user ID.
  Acceptance: Concurrent starts reserve at most one run; duplicate idempotency returns the same run without another daily count; invalid state transitions and late worker writes fail; approval changes all five artifacts once; reset preserves the cookie and usage count.
  Verify: Run concurrency/state-machine integration tests against an emulator or isolated test project, including duplicate create/approve and version mismatch cases; commit as `feat: add transactional ripple state`.

- [ ] **7. Build Clerk gate and the populated baseline dashboard**
  Spec ref: `prd.md > Epic 1: Protected Judge Access And Isolated Demo Session`, `prd.md > Epic 2: Production Baseline And Artifact Exploration`, and `spec.md > 14.1 First viewport`
  What to build: Add Clerk invite-only/shared-account access, server-side route authorization, the independent long-lived cookie, and demo bootstrap API. Build the dark restrained first viewport with real production identity, Scene 14, five populated summary cards, current version, revision guidance, and the shared detail drawer. Ensure logout does not clear the demo cookie.
  Acceptance: Supplied credentials land directly on the fixed project; a second browser gets a clean baseline; logout/login in the same browser returns to the same mutable state; the first desktop viewport communicates all five artifacts without clicking.
  Verify: Run component/auth tests and manually test same-browser logout/login plus a second browser profile. **Visual pause 1:** Arkadiusz reviews the baseline layout, hierarchy, typography, and trust signal. Commit as `feat: ship protected production dashboard`.

- [ ] **8. Connect revision creation, passive progress transport, and recovery**
  Spec ref: `spec.md > 8. API Contracts > POST /api/ripples` through `GET /api/ripples/:runId` and `prd.md > Epic 3: Natural-Language Revision Request`
  What to build: Add the selected-scene revision composer, request validation, idempotency key generation, real `POST /api/ripples`, Cloud Task creation, passive SSE endpoint, polling fallback, refresh rehydration, analysis lock, sanitized failures, and stale-run recovery. Replace the temporary smoke trigger without removing its test coverage.
  Acceptance: Double-click creates one run; the UI locks while analyzing; SSE is observation-only; refresh or SSE loss reconnects to persisted state; invalid requests remain editable; a stale/failed run never changes the baseline and offers a full retry.
  Verify: Exercise duplicate clicks, forced SSE disconnect, refresh during analysis, queue failure, and stale state locally/deployed; run `npm test` and `npm run build`; commit as `feat: connect durable revision lifecycle`.

- [ ] **9. Implement the full evidence-aware ADK Revision Ripple**
  Spec ref: `spec.md > 2.2 Agent dependency graph`, `spec.md > 9. Revision Execution Lifecycle`, and `prd.md > Epic 4: Revision Ripple Analysis`
  What to build: Implement Breakdown → Parallel Evidence → Schedule → parallel Budget/Locations/Casting using official ADK workflow primitives and distinct output keys. Add provider timeouts, schema gates, evidence normalization/cache/fallback, real persisted stage progress, final proposal validation, and conditional token-owned writes. Tune prompts until the golden request produces all required production consequences.
  Acceptance: The six rail stages reflect real work; every accepted live run attempts Parallel Search; Schedule, Budget, and Locations cite consumed evidence; all five artifact impacts are complete; any required invalid stage fails the whole proposal while preserving the baseline.
  Verify: Run one deployed live golden ripple and one forced-Parallel-failure ripple; inspect stored stage/evidence/proposal documents and execute contract tests. **Visual pause 2:** Arkadiusz reviews the amber rail, visible Parallel proof, proposal quality, and whether the ripple feels memorable. Commit as `feat: complete Revision Ripple agent crew`.

- [ ] **10. Add producer review, atomic approval, discard, rerun, reset, and cap UX**
  Spec ref: `prd.md > Epic 5: Proposal Review And Producer Approval`, `prd.md > Epic 8: Reset, Limits, And Recoverable Failures`, and `spec.md > 8. API Contracts`
  What to build: Build the complete proposal view and shared before/after drawer with evidence citations, assumptions, confidence, and unchanged-baseline notice. Wire Approve, Discard, Edit request and rerun, explicit Reset demo, one-approved-ripple lock, daily-cap read-only state, and the disclosed approved-example fallback. Do not permit manual artifact patching.
  Acceptance: Approval commits exactly once and updates version/all five cards; discard leaves the baseline untouched; rerun supersedes the old proposal; logout does not bypass the cycle; reset is the only intended fresh-cycle path; cap exhaustion preserves view/PDF/example access.
  Verify: Manually and automatically test approve double-click, discard, rerun, logout/login, reset, two-browser isolation, and cap reached. **Visual pause 3a:** Arkadiusz reviews the propose → approve → commit control feeling. Commit as `feat: add controlled proposal decisions`.

- [ ] **11. Deliver PDF, accessibility, reliability drills, and final Cloud Run release**
  Spec ref: `prd.md > Epic 7: Two-Page Production Export`, `spec.md > 15. Failure And Recovery`, and `spec.md > 18. Definition Of Technical Done`
  What to build: Generate the two-page PDF only after approval, including current plan, revision impact, evidence status, citations, version, and approval time. Finish responsive/reduced-motion/keyboard states, loading/error copy, redacted structured logs, measured timeouts from five deployed runs, and final Cloud Run configuration. Add P1 text-PDF inspection only if every P0 check already passes and at least two hours remain.
  Acceptance: PDF is disabled before approval and readable after it; forced specialist/Parallel/SSE failures degrade exactly as specified; five measured runs set timeout values; all core checks pass on the public deployment; P1 cannot delay or destabilize P0.
  Verify: Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; perform the full failure matrix and visually inspect the downloaded PDF pages. **Visual pause 3b:** Arkadiusz approves the completed ripple, PDF, and responsive polish. Commit/tag as `release: ScriptOps MVP`.

- [ ] **12. Prepare Devpost handoff**
  Spec ref: `spec.md > 19. Demo And Submission Evidence` and `prd.md > Submission Proof Points`
  What to build: Rehearse and record the ≤3-minute golden path; gather the Cloud Run URL, public repository, OSI license, architecture diagram, setup/test instructions, judge access instructions, screenshots, Parallel runtime proof, stored live evidence example, built-with list, and concise AI/Codex disclosures. Confirm the submission targets the Parallel track and remove every obsolete Replit/Places claim from public materials.
  Acceptance: The demo clearly shows login, populated baseline, Scene 14 request, six real stages, visible Parallel evidence and citations, complete proposal, approval, five updated artifacts, PDF, and failure-isolation statement. The repository can be evaluated without private setup and contains no secrets.
  Verify: Run the golden path from a fresh browser against the public URL, time the final video, inspect the public repo as a stranger, scan docs for `Replit|Google Places`, and confirm the next command is `$prepare-submission`. **Visual pause 4:** Arkadiusz signs off on the exact deployed demo and submission evidence.

## Cut Rule

If the schedule slips, remove item 11's P1 PDF upload inspector, nonessential motion, and drawer refinements. Do not cut the live Parallel call, six real progress stages, five complete artifact impacts, human approval, Firestore transaction, durable task execution, source/cache disclosure, authentication on invocation, or public deployment.
