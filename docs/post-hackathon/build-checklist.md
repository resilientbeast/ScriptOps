# Post-hackathon executable build checklist

Status: PH00–PH08 implementation and verification are recorded below. PH09's bounded generation and three-script provider quality capture passed; its deployment/recovery release check remains open. PH10 is implemented and verified through the authenticated production workflow. Earlier unchecked release gates remain open.
References: [functional specification](functional-spec.md) (F01–F11), [technical design](technical-design.md) (sections 1–8; G1–G4), [roadmap](plan.md).

## Execution rules

Execute in the order below; dependencies are explicit. Each item is a working slice, not a single tool call. Preserve unrelated working-tree changes and record which starting revision/changes were tested. Before Next.js code changes, read the relevant installed `node_modules/next/dist/docs/` guides required by `AGENTS.md`.

All test paths and `verify:post-hackathon:*` scripts named below are **planned deliverables**, not existing tests or passing evidence. Create them in the indicated item before invoking them. Tests run on fixtures, fakes, or the Firestore emulator by default. Deployed/provider checks use explicit test configuration and isolated, uniquely namespaced data. Cleanup must verify the exact test namespace; never use broad collection/bucket deletion.

For each item, append a dated entry to `docs/post-hackathon/build-notes.md` with changed files, commands/outcomes, redacted evidence references, limitations, and any amended decision. Check an item only when its stated exit condition is proven. User review checkpoints gather product feedback; they do not require extra permission for ordinary in-scope implementation.

Quality gate **Q** uses the existing repository commands, run separately from the project root:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Run focused verification for each change and Q at the specified slice boundaries. `npm test` alone is not evidence of live Firestore/provider/browser verification; report any skipped cases. Do not treat the documentation work as completion of PH00 or the feasibility spike.

## Stage 0 — Baseline and feasibility

- [x] **PH00 — Establish the implementation baseline.** Depends: none. Ref: technical §7.
  Inspect the dirty tree and unfinished hackathon release work; identify the intended base without resetting ongoing work. Create `build-notes.md`, record runtime/dependency versions and feature-flag strategy, and capture the current demo's behavior. Run Q; document/fix blockers within scope before relying on the baseline.
  **Exit:** a reproducible baseline and explicit list of inherited failures/skips, with no unrelated changes lost.

- [ ] **PH01 — Prove parsing and input limits.** Depends: PH00. Ref: F03–F05; G1/G2.
  Create `tests/fixtures/screenplays/` with licenses/provenance and expected source/scene annotations; include valid FDX, PDF, feature-length, `12A`, intercut, duplicate headings, mixed scanned/text, encrypted, malformed, and adversarial XML cases. Add an isolated parser experiment and `verify:post-hackathon:ingestion` script; choose/pin adapters only after local and deployed measurements. Record actual limits and source coverage in `feasibility.md` and amend the specs if targets are reduced. Resolve whether the parser needs a separate worker service.
  **Verify:** `npm run verify:post-hackathon:ingestion` against the corpus, then the same harness in the intended Cloud Run configuration. Save per-case format, counts, coverage, expected rejection, elapsed time, and peak memory without logging script text.
  **Local-contract exit:** both promised formats work with traceable source positions; invalid/unsupported documents fail deliberately; the parser candidate and bounded contracts may support PH02. **Release exit:** the same corpus runs in the intended Cloud Run worker configuration with recorded near-limit resource measurements; this remains a PH06 release gate.

- [x] **PH02 — Freeze product contracts and planning assumptions.** Depends: PH01 local-contract exit. Ref: technical §2/§8; F02/F06.
  Implement the strict project/script/planning/job schemas and fixture-independent artifact contracts. Set the provisional US-NM/USD pilot support profile and one-allocation-per-scene schedule model, both subject to PH09 quality validation. Record schema versions and contract limits; defer provider-dependent prompt-size, model-output, and expected-cost measurement to the real initial-planning runner in PH09.
  **Verify:** `npm test -- tests/unit/project-contracts.test.ts tests/unit/script-contracts.test.ts tests/unit/planning-contracts.test.ts`; Q. Cover nullable initial plan, alphanumeric labels, absent PDF pages in FDX, unknown fields, empty cast, stale hashes, foreign references, oversized records, and initial budget without deltas.
  **Exit:** implementation contracts are coherent; unsupported inputs cannot masquerade as complete plans; no golden fixture is required by product schemas. PH09 owns the three-script generated-plan quality and cost experiment.

## Stage 1 — Project foundation

- [x] **PH03 — Build owned project repositories and APIs.** Depends: PH02. Ref: F01/F02/F11; technical §1–§3.
  Implement verified actor access, project creation/list/read/update/archive/restore, immutable planning inputs, record-version checks, and idempotency. Add project-scoped persistence paths and indexes. Keep demo storage and identity separate.
  **Verify:** `npm test -- tests/integration/project-state.test.ts tests/unit/project-access.test.ts`; run the repository contract against the Firestore emulator. Check two owners, two projects, guessed nested IDs, duplicate creates, invalid profile, stale edit, archived write denial, and restore.
  **Exit:** ownership is enforced at the repository/API boundary, not only in navigation.

- [ ] **PH04 — Build project navigation and empty workspace.** Depends: PH03. Ref: F01/F02.
  Add `/projects`, creation form, switching, setup fields, empty state, and `/demo` entry. Add private-project feature flag; preserve existing dashboard behavior under the demo adapter. Do not populate a new project with the sample baseline.
  **Verify:** `npm test -- tests/unit/project-workspace.test.tsx`; Q; browser check creating/switching two projects and reopening them in a second browser for the same account.
  **Exit:** new-project functionality is independently usable with no uploaded file or approved plan.

## Stage 2 — Upload and durable work

- [ ] **PH05 — Add private storage and verified uploads.** Depends: PH04. Ref: F03; technical §4.
  Add bucket/IAM/CORS configuration and storage adapter, upload reservation/session/finalization, generation-bound object reads, immutable promotion, and source streaming. Implement upload bytes UI and recoverable expiry. Freeze or supersede prior pre-baseline inputs consistently on replacement. Add storage test configuration; keep bearer sessions out of logs/client persistence beyond the authorized flow.
  **Verify:** `npm test -- tests/integration/project-upload.test.ts`; deployed transfer check covering resume, duplicate completion, altered generation, actual oversize/type mismatch, forged object key, cross-owner source access, and unsupported files.
  **Exit:** only verified project-owned objects become parse inputs; acceptance cannot be spoofed by client metadata.

- [x] **PH06 — Generalize durable jobs, dispatch, and quotas.** Depends: PH05. Ref: F10; technical §5.
  Implement project-job queue, step records, transactional outbox, OIDC worker authentication, leases/tokens/epochs, bounded retries, per-scope reservations, and passive progress/polling. Add maintenance trigger with an independent verified identity. Start with a fake parse step so durability can be tested without AI calls. Define and configure finite G4 timing/spend defaults before enabling workers.
  **Verify:** `npm test -- tests/integration/project-jobs.test.ts tests/integration/project-usage.test.ts`; deployed worker proof after closing the initiating browser. Force dispatch failure, duplicate/out-of-order tasks, expired lease, old token writes, two-project concurrency, and exhausted quota. Prove recovery without another browser request.
  **Exit:** job publication is idempotent; bounded retries may repeat provider attempts but cannot publish twice or bypass usage accounting.

## Stage 3 — Scene extraction and review

- [x] **PH07 — Integrate parsers and source coverage.** Depends: PH06. Ref: F03–F05.
  Move the validated PH01 adapters behind the worker boundary; produce source blocks, scene manifests, warnings, and coverage classification. Preserve IDs across retry. Implement finite extraction limits and error mapping; no sample fallback or silent text truncation.
  **Verify:** `npm test -- tests/integration/script-ingestion.test.ts`; rerun `npm run verify:post-hackathon:ingestion` through the job pipeline. Compare every annotated source span and exclusion; detect unreadable PDF pages and out-of-range spans.
  **Exit:** both formats reach a persisted, correctable review state with no accepted content missing.

- [x] **PH08 — Implement scene corrections and acceptance.** Depends: PH07. Ref: F04/F05.
  Build ordered list/source preview, heading/label correction, split, adjacent merge, excluded-block restoration, warning acknowledgements, and accept/reopen APIs. Persist edit provenance and stable predecessor IDs. Enforce edit versions and pre-baseline-only behavior; structural gaps/overlaps cannot be acknowledged away.
  **Verify:** `npm test -- tests/integration/scene-review.test.ts tests/unit/scene-review.test.tsx`; Q; browser repair of an intentionally incorrect split followed by reload, acceptance, reopen, and reacceptance.
  **Exit / review checkpoint 1:** a producer can understand and repair the parsed screenplay before spending generation budget.

## Stage 4 — Initial production plan

- [ ] **PH09 — Implement bounded initial generation.** Depends: PH08. Ref: F06; technical §5.
  **2026-09-07 local progress:** bounded generation, stage checkpoints/outbox recovery, owned start/progress APIs, workspace entry, evidence validation, and emulator transaction tests are implemented. Live provider quality, deployed recovery, and browser interaction checks remain open; see [planning verification](planning-verification.md). The initial local-only pass was followed by authorized live verification; see [live review findings](live-planning-review.md).
  Add breakdown batches, shared role/location normalization, sanitized project-specific research, schedule, downstream specialists, and complete-manifest assembly. Reuse validated job checkpoints; reject unknown citations. Implement finite cost/attempt limits and partial-stage failure recovery. Generalize artifact contracts and prompts without leaking fixture assumptions.
  **Verify:** `npm test -- tests/integration/initial-plan.test.ts tests/unit/planning-evidence.test.ts`; add/run `npm run verify:post-hackathon:planning` on three scripts using explicit provider-test configuration. Record G2/G3 final quality, coverage, evidence relevance, usage, and near-limit latency. Include legitimate empty casting and hard-constraint infeasibility.
  **Exit:** complete validated drafts arise from uploaded inputs; missing required evidence, invalid artifacts, or provider failure never create a baseline.

- [x] **PH10 — Add initial review and atomic Plan v1 approval.** Depends: PH09. Ref: F07; technical §6.
  Build initial review without fake before/after fields; add approve/discard and draft supersession on input changes. Implement immutable complete manifests, approval transaction, job-level duplicate approval result, and version record. Keep object/provider calls outside transaction callbacks.
  **Verify:** `npm test -- tests/integration/project-approval.test.ts tests/unit/initial-plan-review.test.tsx`; run approval concurrency against the emulator; Q. Race approval against reopen/input edit/deletion, reject incomplete manifests, and prove duplicate approval installs one version only.
  **Exit / review checkpoint 2:** the producer approves a useful first baseline, and its five artifacts remain consistent across reload and retries.

## Stage 5 — Repeated ripples and exports

- [ ] **PH11 — Adapt Revision Ripple and version history.** Depends: PH10. Ref: F08/F09.
  Bind the dashboard, selected scene, ripple prompts, evidence, proposal review, and transactions to project-approved manifests. Remove the one-approved-cycle limit for projects; retain one open proposal lock. Add history and explicit demo execution mode. Use derived budget/artifact deltas and project region/currency labels.
  **Verify:** `npm test -- tests/integration/project-ripple.test.ts tests/unit/project-proposal.test.tsx`; approve v1 → v2 → v3, discard another proposal, then retry an old approval and receive its original version. Test real inputs matching the golden ID/request to prove they cannot trigger fixture assembly. Check a second project stays unchanged.
  **Exit:** repeated real-project revisions preserve atomicity, stale-version rejection, current baseline selection, and demo behavior.
  **2026-09-07 local progress:** project-scoped ripple jobs, immutable v2+ manifests, protected proposal/review APIs, plan history, recovery registration, and workspace controls are implemented. The local unit contract passes; emulator transaction execution and deployed/browser verification remain pending.

- [ ] **PH12 — Export approved project versions.** Depends: PH11. Ref: F09.
  Adapt the existing PDF work to initial/ripple provenance and authorized immutable versions. Include project/version/approval/evidence, handle long content, and export historical approved versions. Preserve any still-needed demo export path.
  **Verify:** `npm test -- tests/unit/project-export.test.tsx`; render and visually inspect initial, revised, historical, and feature-length exports; Q.
  **Exit:** no draft export is mislabeled approved; no project leak, clipping, missing citations, or fixed two-page overflow.
  **2026-09-07 local progress:** owner-scoped project-version PDF export, history download links, v1/v2 render tests, and feature-length flow coverage are implemented. The original demo export remains separate. Deployment and authenticated download verification remain pending.

## Stage 6 — Lifecycle, reliability, and pilot

- [ ] **PH13 — Complete deletion and maintenance.** Depends: PH12. Ref: F11; technical §7/G4.
  Add confirmed deletion, tombstone/epoch fencing, upload-session cancellation, recursive scoped cleanup, late-write sweeps, and approved-reference-safe staging GC. Finish archive/restore UI and actual retention disclosure. Record G4 backup/soft-delete policy and the measured 24-hour application-storage removal target.
  **Verify:** `npm test -- tests/integration/project-cleanup.test.ts`; exercise deletion during upload, worker execution, and proposal readiness in an isolated deployed namespace. Confirm approved objects survive ordinary staging GC and that late uploads/tasks cannot resurrect a deleted project.
  **Exit:** application data removal is verified across nested Firestore records and object generations, with an honest backup-retention statement.
  **2026-09-07 local progress:** confirmed deletion now creates a minimal owner-only tombstone, increments the project write epoch, clears locks, fences parse persistence, queues a scoped cleanup worker, deletes all project object generations and nested Firestore records, then re-sweeps late writes. Archive/restore and deletion controls are present in the workspace. Local fence coverage passes; live deletion, actual bucket soft-delete/backup retention, and the 24-hour removal measurement remain release evidence.

- [ ] **PH14 — Full verification and private pilot release.** Depends: PH13; all G1–G4 resolved. Ref: F01–F11.
  Add `verify:post-hackathon:e2e` for browser/API/state assertions against an explicit test deployment. Exercise both formats, three scripts, two users, two projects, feature-length limits, v1 → v3, refresh/SSE loss, failure/retry, history/export, archive/restore, and deletion. Check keyboard/narrow-screen flows and human planning quality. Record configured limits, metrics/alerts, deployment revision, rollback procedure, and remaining non-blocking limitations in `release-evidence.md`. Enable the allow-listed pilot only after gates pass.
  **Verify:** Q; `npm run verify:post-hackathon:ingestion`; `npm run verify:post-hackathon:planning`; `npm run verify:post-hackathon:e2e`; separate sample-demo regression. Run a rollback drill that preserves reads/exports without allowing incompatible worker writes.
  **Exit / review checkpoint 3:** the entire functional specification is demonstrated in the pilot; no critical ownership, lost-source, partial-baseline, or version-history defects remain.

## Reconciled status — 2026-09-08

The implementation through PH14 is present in the repository and deployed. The unchecked boxes above remain unchecked deliberately: their exit criteria include evidence that has not been collected, rather than indicating that their feature code is absent.

- **Verified on the current revision:** anonymous boundary, project reload, accepted FDX scene review, Plan v3 with three-entry history, proposal refresh/discard continuity, archive/restore, confirmed empty-project deletion, the enabled reconciler, and the restored isolated demo route.
- **Deferred by owner:** the second allow-listed user and two-project ownership check.
- **Still open:** a current-revision PDF upload rerun; upload/parser/proposal deletion races; in-flight worker recovery; full three-script and feature-length quality review; narrow-screen/keyboard review; rollback drill; and alert/on-call evidence.

See [release evidence](release-evidence.md) for the exact observations, limitations, deployed revision, and non-overstated pilot gates.
