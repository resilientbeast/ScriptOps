# Post-hackathon milestone: screenplay to production workspace

Status: proposed implementation plan; no implementation started by this document.
Prepared: 2026-09-06, against the current working tree.

Implementation documents: [functional specification](functional-spec.md), [technical design](technical-design.md), and [executable build checklist](build-checklist.md). These refine the roadmap into implementation defaults; feasibility and release evidence remain open.

## Outcome

A producer can create a separate production project, upload a screenplay, review and correct extracted scenes, generate and approve an initial production plan, then repeatedly use the existing Revision Ripple and approval workflow.

The complete path is:

**Projects → New Project → Upload screenplay → Review scenes → Generate initial plan → Review and approve Plan v1 → Request a ripple → Approve Plan v2 → Continue revising.**

The additional scene-review and initial-plan-approval steps preserve ScriptOps' core promise: generated recommendations become the production baseline only after the producer approves them.

## Scope and working assumptions

- Start with private projects owned by individual authenticated users. A user can own multiple projects and access them across browsers. Team invitations, roles, billing, and public self-service signup are later milestones; invite-only access can remain for the pilot.
- Support text-based PDF and Final Draft `.fdx` uploads in this milestone. Investigate both during Stage 0; deliver the structured FDX path first, followed by PDF before release. Older `.fdr` files, scanned/image-only PDFs, OCR, handwriting, and non-English scripts are later work. Explain unsupported files before generation and offer actionable export guidance.
- “Arbitrary scripts” means user-provided scripts within a published, tested input envelope, with no dependency on the bundled sample. It does not promise every screenplay format or production scale.
- Proposed pilot envelope: English scripts, up to 20 MB per upload, 150 PDF pages, and 200 extracted scenes. These are product targets to validate in Stage 0, not measured capacity. Apply bounded extraction limits to FDX as well, without inventing PDF-style page numbers.
- Capture production country/region, currency, planning assumptions, and optional budget/date constraints. Separate the story's setting from the intended shooting region. Unsupported regions must be disclosed; do not silently use New Mexico or fabricate local evidence.
- Keep Cloud Run, Firestore, Cloud Tasks, Clerk, Gemini/ADK, and Parallel. Plan for private Google Cloud object storage for uploaded files and larger immutable outputs; select parser packages and exact infrastructure configuration through the Stage 0 spike.
- Include scene-boundary correction before first baseline approval. Replacing a screenplay after approval, automatic matching across script revisions, collaborative editing, and partial artifact approval are later milestones.
- Preserve the sample production as an explicitly labeled demo with its own behavior. Existing browser demo data is not automatically assigned to a real user account.

## What the repository already provides

| Existing capability | Reuse and required change |
| --- | --- |
| Cloud Tasks execution, worker identity checks, leases, progress, and recovery | Reuse for parsing and initial planning as well as ripples; introduce job types and project ownership. |
| Zod domain contracts and complete-proposal validation | Keep deterministic gates; separate fixture contracts from product contracts. |
| Firestore approval transaction and version checks | Preserve all-or-nothing approval; move ownership from browser demo to project and support repeated revisions. |
| Five artifact cards, scene selection, activity rail, proposal review | Reuse after Plan v1 exists; add empty, uploading, reviewing, and generating states. |
| Evidence research, citations, and fallback handling | Generate research from the actual project and script; scope caches and disallow unrelated fixture evidence. |
| PDF export work present in the working tree | Integrate with project/version ownership and initial-baseline approval; verify independently before release. |

Concrete coupling to address:

- `app/page.tsx` initializes the sample plan. `lib/demo-session.ts`, public APIs, and `lib/firestore/state-types.ts` use browser demo identity.
- `lib/firestore/ripple-state.ts` initializes/resets fixtures and permits one approved ripple per demo cycle. Real projects need persistent version history and repeated approvals.
- `lib/domain/schemas.ts` embeds `fixtureVersion`, New Mexico, USD, integer scene numbers, required page ranges, small bounded arrays, and a requirement that each scene appear on exactly one shooting day.
- `lib/agents/revision-ripple.ts` and `lib/agents/prompts.ts` contain prepared golden references and fixture-based assembly. The golden trigger currently depends on scene ID and request text; real project execution must never select it accidentally.
- Evidence research currently uses fixed New Mexico questions. The product path needs project-specific questions and relevant source selection.
- `lib/domain/invariants.ts` caps persisted JSON at 700 KiB. Full script text and duplicated before/after plans cannot simply be appended to current Firestore records.
- Export currently requires an approved ripple and its proposal. An approved initial baseline needs its own provenance and export eligibility.

The hackathon checklist still has release/submission work open, and the working tree contains ongoing export and UI changes. Stage 0 reconciles that state; this roadmap does not declare those items finished.

## Delivery stages

Stages are ordered by dependency. Each ends with a working slice and recorded verification before the next stage expands it.

### Stage 0 — Lock the product contracts and prove ingestion feasibility

**Deliver:** a small, evaluated ingestion prototype and agreed pilot support envelope.

- Reconcile outstanding hackathon work and capture a passing demo regression baseline from the intended starting revision.
- Assemble a licensed or synthetic evaluation corpus: FDX, short and feature-length text PDFs, unusual headings, numbered/unnumbered scenes, `12A` labels, repeated headings, montage/intercut, title pages, headers/footers, and unsupported or malformed files.
- Compare parser candidates using extraction order, source mapping, malformed-input handling, deployment compatibility, license, and runtime/memory behavior. Pin a choice only after the Cloud Run spike succeeds.
- Define separate `Project`, `ScriptVersion`, `ParsedScene`, `PlanningInputs`, `PlanVersion`, and `Job` contracts. Keep source text separate from inferred production requirements.
- Validate whether the proposed upload/scene limits fit parsing, model context, generation cost, persistence, and worker duration. Set measured limits and budgets before pilot exposure.
- Decide the first supported research region(s), currency behavior, and schedule model. For the pilot, keep one allocation per scene only if the evaluation corpus supports it; otherwise implement scene allocations across days before Stage 4. Do not silently truncate complex schedules.

**Exit gate:** representative FDX and PDF inputs can be extracted with traceable source positions in the deployment environment; parser choice, supported envelope, storage layout, and expected failure cases are recorded. No product claim of arbitrary-script support yet.

### Stage 1 — Separate production projects and ownership

**Deliver:** New Project, project list, project switching, and an empty project workspace.

- Use authenticated Clerk user identity as project ownership; keep the existing access gate independent of ownership. Authorize project access on every read, write, upload/download, progress stream, export, and job lookup.
- Add project creation with title and production planning inputs. Persist lifecycle state with no approved plan initially.
- Introduce project-scoped repository operations, identifiers, API paths, and URLs. Retain a separate demo entry point and adapter for the sample.
- Establish immutable plan versions and an approved-plan pointer instead of an ever-growing mutable project document. Reserve one active planning/ripple operation per project for the pilot.
- Add project archive behavior and a defined deletion workflow for later Stage 2/6 completion. Archived projects reject new work.

**Exit gate:** one account creates and switches between two empty projects; a different account cannot access either using guessed project, job, file, or plan IDs. The same user sees the same projects in another browser. The sample demo regression still passes.

### Stage 2 — Private screenplay upload and durable ingestion

**Deliver:** upload, persisted script versions, actual processing status, and recoverable failures.

- Store the original file privately under a server-assigned project/script-version key. Record sanitized filename, content hash, format, byte count, uploader, and timestamps.
- Use an authenticated upload-initiation/completion flow with scoped, short-lived upload authorization where appropriate. Finalization verifies the actual stored file, size, type, and ownership before enqueueing work; a client-reported successful upload is insufficient.
- Validate file contents as well as extensions. Bound parsing resources, reject encrypted/unsupported inputs clearly, disable XML external entity resolution, and prevent uploaded content from executing or being treated as instructions.
- Create parse jobs through Cloud Tasks with idempotent creation, execution leases, retries, and redacted public errors. Reconcile jobs left queued if dispatch fails after persistence.
- Rehydrate upload/parse status after refresh. Support explicit retry without creating duplicate accepted script versions or repeating completed work unnecessarily.
- Implement cleanup of abandoned uploads and a deletion job that fences active workers before removing files, extracted text, and derived records.

**Exit gate:** an accepted upload survives tab closure and is processed once under duplicate completion/task delivery. Oversized, spoofed, malformed, encrypted, and unauthorized requests fail safely. A project cannot read another project's screenplay; abandoned objects are cleaned up.

### Stage 3 — Extract scenes and let the producer correct them

**Deliver:** a scene-review workspace for both FDX and text PDF.

- Separate format extraction from scene segmentation. Normalize into ordered source blocks, retaining source locators: PDF page/block ranges or FDX paragraph positions.
- Prefer explicit document structure and deterministic heading rules. Use a bounded model-assisted fallback only for ambiguity, preserving the source and showing uncertainty.
- Give each scene an internal stable ID independent of display number. Preserve labels such as `12A`, scene order, original headings, source text, and extraction warnings. Allow unknown/ambiguous setting or time of day pending review.
- Show scene list, source preview, and flagged gaps. Allow heading correction, split, merge, and restoration of incorrectly excluded text. Preserve an audit of corrections and deterministic ID behavior across retries; split/merge operations record their predecessor IDs.
- Require review and resolution or explicit acknowledgement of warnings, then freeze an accepted parsed-script revision. Edits before approval invalidate stale generation inputs; replacing a script after an approved baseline remains out of scope.
- Check source coverage so missing or duplicated scene text cannot silently become a complete parse. Account explicitly for excluded title-page/header/footer material.

**Exit gate:** the supported corpus retains scene text and order with expected boundaries; ambiguous cases are surfaced rather than invented. A producer can repair a deliberately bad split and approve the corrected scene set. Scanned PDFs receive a clear unsupported-file result instead of an empty successful script.

### Stage 4 — Generate and approve the initial production plan

**Deliver:** an evidence-backed, reviewable first plan from the accepted scene set.

- Add a distinct `initial-plan` job and proposal contract. There is no previous plan and no fake before/after delta. Record script revision, planning-input version/hash, schema/prompt/model versions, and generation provenance.
- Pipeline: **scene breakdowns in bounded batches → cross-scene role/location normalization → relevant evidence research → whole-project schedule → budget, locations, and casting → complete-plan validation**.
- Preserve source facts versus inferred requirements, with assumptions and uncertainty. Reuse existing typed specialist infrastructure without feeding in sample artifacts or golden references.
- Pass each stage the information it needs. Persist completed batches and validated stage outputs, enforce concurrency and spend limits, and split work across durable tasks if measurements exceed a single worker's safe duration.
- Generate research from the actual script requirements and shooting region. Keep screenplay text, character dialogue, and confidential project details out of external search queries. Cache only appropriately scoped, non-confidential research; irrelevant demo fallback evidence is prohibited.
- Validate all five artifacts together: scene coverage, valid role/location/evidence references, schedule feasibility against captured constraints, budget consistency with schedule and currency, and clearly stated unsupported assumptions. Support legitimate empty casting requirements instead of inventing roles.
- If required research or generation fails, retain recoverable job state and leave the approved-plan pointer empty. Do not substitute a sample plan. Any accepted cached evidence must match the project's research context and retain its age/disclosure.
- Present the initial draft with citations, assumptions, warnings, and actions to approve, discard, or adjust inputs and regenerate. Approval atomically installs Plan v1 only if the accepted script and planning inputs still match the generation snapshot.

**Exit gate:** at least three materially different supported scripts produce validated plans with no sample-production leakage. Duplicate approval creates one Plan v1; changed inputs make an old draft unapprovable; provider failure leaves no approved baseline. A producer reviews plan usefulness, not just schema validity.

### Stage 5 — Connect real projects to repeated Revision Ripples

**Deliver:** the existing dashboard and approval experience operating on uploaded productions.

- Hydrate the five artifact cards and scene selector from the project's approved version. Replace fixed sample text, default Scene 14 selection, region labels, currency formatting, and demo-specific reset/lock controls.
- Generalize ripple execution to the project's approved scene and planning inputs. Golden assembly and prepared references remain explicitly demo-only, including when real input happens to match the golden scene ID/request.
- Carry project ID, script revision, and base plan version on every run. Bind proposal approval to those values and the current approved pointer.
- Permit repeated revisions: Plan v1 → v2 → v3. Keep one active proposal/run per project initially; approve/discard releases the lock. Retain immutable approval history and provenance for every version.
- Preserve all-or-nothing artifact approval, idempotency, execution fencing, refresh recovery, evidence disclosure, and global cost controls. Add per-user/project quotas so one producer cannot consume the entire pilot budget.
- Make exports project/version scoped. Allow export after initial baseline approval and after later approved revisions; label initial-generation provenance distinctly from revision impact. Validate PDF pagination with long scripts instead of forcing the existing two-page layout to hold every detail.

**Exit gate:** upload a new script, approve Plan v1, approve two different ripples to reach v3, reload, switch projects, and export the expected approved version. Discard, stale approval, duplicate approval, and delayed worker writes never change the wrong baseline. Another project remains untouched.

### Stage 6 — Validate and release the private pilot

**Deliver:** a complete, bounded product milestone with operational evidence.

- Run the supported corpus through the complete browser → upload → parse review → generation → approval → ripple → export path. Include a feature-length input near the accepted limit.
- Exercise upload interruption, task redelivery, dispatch failure, parser failure, partial generation failure, provider timeout, stale drafts, auth expiry, concurrent approvals, deletion during work, and cross-project access attempts.
- Measure parse/generation latency, failure rate, provider usage/cost, memory, persisted-record sizes, and retry behavior. Record concrete release budgets and limits; do not ship solely on schema-test success.
- Verify keyboard and narrow-screen flows, long scene lists, clear warning/recovery copy, source preview, and progress rehydration. Inspect exported documents for representative small and large projects.
- Finish private-file IAM, retention/deletion behavior, redacted logging, deployment configuration, and restoration/rollback procedures. Explain in the product which providers process screenplay data.
- Enable the project workflow for a small allow-listed pilot using a feature flag. Rollback disables new intake/generation while keeping existing approved projects readable; disable workers consistently if a rollback requires it.

**Exit gate:** all milestone acceptance checks below pass in the deployed pilot, measured limits are documented, and there are no critical ownership, data-loss, or incorrect-baseline defects.

## Storage and lifecycle decisions

Recommended logical model; confirm exact paths and transaction boundaries in Stage 0:

| Record | Responsibility |
| --- | --- |
| Project | Owner, title, planning inputs/version, lifecycle, active script revision, approved plan pointer, active job pointer. |
| Script version | Immutable upload reference/hash, parser version, parse status, original source references. |
| Accepted scene revision | Ordered scene manifest, normalized scene records, correction provenance, review acknowledgement. |
| Plan version | Immutable validated artifact manifest, script/input provenance, evidence references, approval actor/time, predecessor version. |
| Job/proposal | Job type, input snapshot, stage/batch progress, validated output references, lease, attempts, usage, terminal outcome. |

Keep original files and bulk text out of project/job documents. Store bounded scene/artifact records and/or immutable objects behind manifests. Before approval, stage and validate every referenced output, mark the manifest complete, then atomically update the approved pointer, history metadata, and job decision in Firestore. Readers load one approved manifest, so they cannot combine artifacts from different versions. Incomplete staging remains invisible and is cleaned up later. Apply size checks to every actual persisted record, including manifests, rather than raising the current JSON cap blindly.

Project flow: `empty → script review → ready to plan → draft ready → active`. Upload, parsing, and generation have independent job statuses (`queued`, `running`, `completed`, `failed`, `superseded`) so retry does not erase project state. Archival/deletion blocks new work and fences late worker publication.

Do not reuse demo `cycle` or the one-approved-ripple flag for real projects. Initial-plan approval requires an empty approved pointer and matching script/input revisions; ripple approval requires an exact current base version. Stale work can remain inspectable without becoming approvable.

## Milestone acceptance checklist

- [ ] An authenticated producer creates two independent projects and sees them across browsers.
- [ ] Both supported upload formats reach a reviewed, source-traceable scene list.
- [ ] Ambiguous parsing can be corrected; unsupported documents never appear successfully parsed.
- [ ] Initial planning uses the uploaded script and explicit production inputs, with all five validated artifacts and relevant evidence.
- [ ] Only explicit initial-plan approval creates the baseline; retries and duplicate actions do not create extra versions.
- [ ] Two subsequent approved ripples advance the same project to v3 with complete history and unchanged approval safeguards.
- [ ] Project isolation covers files, status/events, proposals, approved plans, and exports.
- [ ] Failures and refreshes preserve durable progress and the last approved baseline.
- [ ] Near-limit scripts meet recorded runtime, storage, and cost budgets without silent truncation.
- [ ] Private-file cleanup/deletion and sample-demo regression checks pass.

## Execution sequence and scope control

Implement **0 → 1 → 2 → 3 → 4 → 5 → 6**. Stage 0 is the first implementation task; its output should turn Stage 1 into small repository changes with concrete verification commands.

Use three review checkpoints: project/upload/scene review after Stage 3; initial-plan quality and approval after Stage 4; complete project-to-ripple flow after Stage 6. These are product reviews, not additional approval requirements for routine implementation.

If scope needs reducing, limit the published input envelope or pilot region coverage explicitly, and defer optional polish. Team accounts, OCR, additional file formats, screenplay replacement after approval, and advanced schedule optimization are the first later milestones. Do not call this milestone complete while project isolation, either promised file format, source-traceable parsing, real initial generation, or repeated ripple approvals are missing.

Estimate delivery after the Stage 0 parsing/generation spike. The largest uncertainties are PDF segmentation quality, whole-script planning usefulness, and durable generation at the supported upper limit; adding an upload form alone does not resolve them.
