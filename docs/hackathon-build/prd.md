# Product Requirements Document

## Product Summary

**ScriptOps** is a human-supervised pre-production system for indie producers. It presents a screenplay as a connected production baseline made of five artifacts—scene breakdown, shooting schedule, budget band, grounded location candidates, and casting briefs—and uses **Revision Ripple** to analyze one natural-language scene change across all five. A Parallel-powered Production Evidence Agent researches current operational constraints before the downstream agents form their proposal.

The product is not a report generator. Its defining behavior is evidence-grounded, controlled change propagation: the producer sees a complete proposed impact and the sources that informed it, decides whether to approve it, and only then replaces the working baseline. If any required part of the analysis fails, ScriptOps keeps the previous baseline intact.

### Product promise

**Nothing gets dropped when things change.**

### Primary value

One producer-approved change becomes a traceable update across the entire pre-production plan instead of five manual handoffs, several messages, and a spreadsheet reconciliation exercise.

### MVP time constraint

The product must be achievable in approximately 18–24 build hours over 2–3 days. The complete Revision Ripple journey takes priority over authentication polish, generic input support, or additional production-management features.

## Goals

- Make an indie producer understand the existing production baseline immediately after login.
- Demonstrate coordinated multi-step analysis that creates meaningful changes in all five artifacts.
- Use Parallel Search at runtime to ground schedule, budget, and location consequences in current New Mexico production evidence.
- Keep the producer in control through propose → review → approve → commit behavior.
- Make live Parallel-sourced production evidence inspectable and honest about whether it came from a live or cached result.
- Prevent partially updated plans from becoming the approved baseline.
- Leave the producer with a practical two-page PDF artifact after approval.
- Remain usable for judging even when live grounding fails or the daily analysis allowance is exhausted.

## Success Conditions

The MVP succeeds when a judge can complete the golden path without instructions beyond supplied credentials and one sentence of on-screen guidance:

1. sign in;
2. recognize the production and its five populated artifacts;
3. understand which scene is selected and what Revision Ripple will do;
4. submit the prepared revision;
5. observe six visible workflow stages, including Parallel Evidence;
6. inspect the full proposed impact;
7. approve an atomic baseline update;
8. inspect Parallel-sourced New Mexico production evidence;
9. download a two-page PDF.

Success also requires that a second judge using the same shared account but a different browser starts from a clean, independent demo baseline rather than inheriting another judge's changes. On the same browser, logout and login must preserve the existing demo instance instead of granting a free reset.

## Target User

### Primary persona: indie producer

The primary user is an indie producer entering pre-production without a large studio operations team. They need to understand how creative changes affect practical production constraints and must approve a consistent cross-functional plan.

The producer values:

- control over when a proposed change becomes official;
- clear production consequences rather than model-generated prose;
- confidence that no downstream artifact was silently skipped;
- fast access to assumptions, source evidence, and cost drivers;
- an artifact they can hand to collaborators.

### Supporting users in the product story

- A first assistant director consumes the revised schedule.
- A production manager consumes the budget band, delta, and cost drivers.
- Casting collaborators consume role and specialist briefs.
- Location collaborators consume grounded candidates and feasibility notes.

These collaborators do not receive dedicated workflows in the MVP.

## Experience Principles

### Quiet operational authority

The interface should feel like an air-traffic-control tower at night: calm, precise, and aware of many moving dependencies. It must not resemble a generic AI chatbot or a cinematic toy.

### One deliberate moment of drama

The normal interface is restrained. Amber/gold activity moves through the six-stage workflow rail only during Revision Ripple. That rail is the visual metaphor; a separate decorative ripple animation is unnecessary.

### Control, not surprise

Analysis never mutates the approved plan. The producer always sees a complete proposal first and explicitly approves or discards it.

### Evidence over assertion

User-visible impact items contain concise reasons, assumptions, confidence indicators, and sources where applicable. ScriptOps never exposes raw chain-of-thought.

### Honest degradation

Cached evidence is clearly labeled. Failed analysis does not masquerade as success. Rate limits preserve read-only access rather than producing a dead application.

## Core User Journey

### 1. Sign in

The judge enters supplied credentials. Public account registration is unavailable. After successful login, the judge is taken directly to the fixed demo production rather than an account home page or project list.

### 2. Understand the baseline

Without clicking, the judge can identify:

- the production title and screenplay identity;
- the selected scene and a short excerpt or summary;
- all five artifact categories;
- a meaningful summary statistic on every artifact card;
- the Revision Ripple action and a one-line explanation of what it does.

### 3. Request a change

The judge keeps Scene 14 selected and enters:

> Move Scene 14 from a daytime desert road to a rainy night exterior, add a child witness, and require stunt driving.

The request is validated as a production-relevant change before an analysis can begin.

### 4. Observe the crew working

The selected scene and request become locked. The six-stage activity rail becomes the dominant visual state and progresses through:

1. Breakdown
2. Parallel Evidence
3. Schedule
4. Budget
5. Locations
6. Casting

The current approved baseline remains inspectable while the proposal is generated.

### 5. Review the complete proposal

When every required stage succeeds, the judge sees a proposal containing before/after changes for all five artifacts. Nothing has changed in the approved baseline yet.

The judge can:

- approve the entire proposal;
- discard it and return to the unchanged baseline;
- edit the original request and run a replacement analysis.

The judge cannot manually patch individual proposed artifact values.

### 6. Approve atomically

Approval replaces the demo instance's working baseline only when all five proposed artifacts are ready. The interface confirms the new baseline version, approval time, and that five artifacts were updated.

### 7. Inspect evidence

The judge can open the locations artifact and evidence view to inspect candidates, production constraints, source links, excerpts, retrieval time, and live/cached status. A shared detail drawer presents one artifact at a time while preserving awareness of the other artifact cards.

### 8. Export and reset

After approval, the PDF action becomes available. The judge downloads the current production plan and revision record. To run another expensive analysis, the judge must choose `Reset demo`, which restores the immutable starting baseline and begins a new demo cycle within the same persistent demo instance. Logout and login do not reset the cycle.

## Product States

The interface must communicate one unambiguous state at a time:

- **Signed out:** credentials are required; no analysis action is available.
- **Baseline ready:** fixed demo production is loaded; a scene can be selected and a revision can be entered.
- **Request invalid:** analysis is blocked and the user receives a concrete example of a valid production change.
- **Analyzing:** scene and request are locked; the activity rail shows current and completed stages.
- **Proposal ready:** all five proposed updates are available; the baseline is still unchanged.
- **Analysis failed:** the baseline is unchanged; failure is identified without presenting a partial proposal; full retry is available.
- **Proposal discarded:** the baseline remains unchanged and the request can be edited.
- **Revision approved:** the working baseline is updated for this demo instance and export is enabled.
- **Cached grounding:** the proposal remains valid, but production evidence is visibly marked as cached with its original retrieval time.
- **Daily cap reached:** new analysis is disabled; existing production data, evidence, approved demo-instance state, reset, and PDF remain viewable.

## Epics And User Stories

### Epic 1: Protected Judge Access And Isolated Demo Session

#### Story 1.1 — Judge login

As a judge, I want to sign in with supplied credentials so that I can test the expensive agent workflow without public signup being available.

Acceptance criteria:

- The signed-out screen identifies ScriptOps and provides a login action.
- No public signup or account-creation action is displayed.
- Invalid credentials produce a clear error without revealing account details.
- Successful login opens the fixed demo production directly.
- The user does not encounter onboarding, profile setup, organization selection, or a project list.

#### Story 1.2 — Persistent browser demo instance

As a judge using a shared account, I want a persistent browser-specific demo instance so that other judges cannot alter my work and logging out cannot bypass the intended reset flow.

Acceptance criteria:

- The first visit from a browser creates one long-lived demo instance that starts from the immutable baseline.
- The demo instance is bound to a persistent browser identifier that is independent of Clerk login state.
- Logging out and back in on the same browser preserves the same demo instance, working baseline, and used-ripple state.
- Two browsers or devices logged into the same shared account can hold different proposal or approved states simultaneously.
- Refreshing preserves the current demo-instance state where practical; if recovery is impossible, the interface returns to a clearly identified baseline rather than showing mixed data.
- `Reset demo` restores the immutable baseline and starts a new demo cycle within that same browser's demo instance.
- Resetting one demo instance does not alter any other demo instance.
- Clearing cookies or using a new incognito context may create another demo instance; the global daily cap is the accepted backstop rather than additional anti-abuse scope.

#### Story 1.3 — Cost-protected invocation

As the project owner, I want Revision Ripple protected behind authenticated access and usage limits so that public visitors cannot exhaust the agent allowance.

Acceptance criteria:

- Signed-out visitors cannot trigger analysis through the interface.
- Direct attempts to invoke analysis without valid access are rejected.
- One demo cycle may approve only one ripple before an explicit reset is required.
- A global daily limit blocks new analyses after the allowance is consumed.
- Reaching the limit never hides or destroys the baseline, evidence, or an already approved demo-instance result.

### Epic 2: Production Baseline And Artifact Exploration

#### Story 2.1 — Immediate production orientation

As an indie producer, I want to understand the production and its current plan at a glance so that I can trust I am working from real screenplay content.

Acceptance criteria:

- The first authenticated screen shows the actual demo production title.
- The selected scene is identifiable by scene number, heading, and a short screenplay-grounded excerpt or summary.
- Scene 14 is pre-selected for the golden path.
- The screen contains populated cards for all five artifacts.
- Each artifact card displays a meaningful live summary:
  - scene count;
  - shoot-day count;
  - budget band;
  - candidate-location count;
  - casting-brief count.
- No artifact appears as an empty placeholder.
- A one-line prompt near the primary action says, in substance, “Type a change to this scene and watch it ripple through the whole plan.”

#### Story 2.2 — Scene selection

As a producer, I want to select a scene from the screenplay so that my change request has a clear target.

Acceptance criteria:

- The interface lists the demo screenplay's scenes in screenplay order.
- The current selection is visually unambiguous.
- Changing selection updates the scene heading, excerpt/summary, and revision context.
- A scene cannot be changed while analysis is running.
- Scene 14 remains the documented and tested golden-path selection.

#### Story 2.3 — Shared artifact detail drawer

As a producer, I want to inspect any artifact without navigating away so that I retain awareness of the connected plan.

Acceptance criteria:

- Selecting any artifact card opens a shared detail drawer.
- The drawer title and content match the selected artifact.
- Closing the drawer returns to the same dashboard state.
- Opening a drawer never starts an analysis or changes the baseline.
- The other artifact cards remain at least partially visible on supported desktop layouts; this is a desirable enhancement rather than a release blocker on small screens.

#### Story 2.4 — Secondary screenplay upload proof

As a judge, I want to see that ScriptOps accepts a screenplay PDF so that the demo does not appear entirely hardcoded.

Acceptance criteria:

- The product visibly offers an “upload screenplay” secondary action.
- It accepts text-based PDF files and rejects unsupported file types with a clear message.
- A valid uploaded PDF produces a clear accepted/processing/result state rather than silently replacing the golden-path project.
- Scanned-image OCR, Final Draft fidelity, and revised-script diffing are not promised.
- Upload failure cannot damage or remove the bundled demo project.

### Epic 3: Natural-Language Revision Request

#### Story 3.1 — Enter a production change

As a producer, I want to describe a change in ordinary production language so that I can steer the plan without editing five documents.

Acceptance criteria:

- The revision input is visibly tied to the selected scene.
- The input supports the full golden-path request without truncation.
- The action label clearly indicates that it will analyze a proposed ripple, not immediately update the plan.
- The baseline remains unchanged after text entry.
- The user can clear or edit the request before analysis starts.

#### Story 3.2 — Validate the request

As a producer, I want guidance when my request is empty or irrelevant so that I understand how to make it actionable.

Acceptance criteria:

- Empty or whitespace-only requests cannot start analysis.
- A request judged unrelated to the selected scene or production planning does not consume the full ripple flow.
- The error explains that the request should describe a production-relevant change.
- The error includes a short example shaped like the golden path—such as changing time of day, weather, cast requirement, or stunt requirement—without forcing a rigid template.
- The user's text remains available for editing after validation fails.

### Epic 4: Revision Ripple Analysis

#### Story 4.1 — Visible coordinated progress

As a producer, I want to see which production disciplines are being analyzed so that the system feels controlled rather than opaque.

Acceptance criteria:

- Starting analysis locks the selected scene and revision text.
- New analysis, approval, discard, and export actions are unavailable while analysis runs.
- Existing baseline cards and their detail drawer remain viewable.
- The activity rail is visually dominant during analysis.
- The rail contains exactly six named stages in the agreed order: Breakdown, Parallel Evidence, Schedule, Budget, Locations, Casting.
- The Parallel Evidence stage is visibly identified as a runtime partner call rather than folded into an unlabeled loading state.
- Every stage shows a distinct pending, active, completed, or failed state.
- Completed stages remain visible while later stages run.
- Progress text describes the discipline's task without exposing hidden reasoning.

#### Story 4.2 — Meaningful five-artifact proposal

As a producer, I want every discipline to explain its downstream impact so that I can evaluate the change as one production decision.

Acceptance criteria:

- A successful proposal contains a result for all five artifacts.
- The golden-path request produces at least these visible consequences:
  - breakdown: night, rain, child-performer, and stunt requirements;
  - schedule: night-work, lighting setup, stunt setup, and child-labor constraints;
  - budget: an increased band or delta with weather, lighting, night-premium, and stunt cost drivers;
  - locations: re-evaluation for night access, road control, rigging, weather, and stunt safety;
  - casting: a child-witness brief plus a stunt-coordinator or stunt-specialist requirement.
- Each artifact shows before/after information, concise reason, key assumptions, and confidence.
- The proposal distinguishes facts grounded in the screenplay or external evidence from planning assumptions.
- Schedule, budget, and locations cite the evidence records they consumed when making externally grounded claims.
- The proposal does not claim precise legal, labor, permit, or financial advice.

#### Story 4.3 — No partial success

As a producer, I want the previous baseline preserved if any required specialist fails so that I never mistake an inconsistent partial plan for an approved one.

Acceptance criteria:

- A failed required stage prevents the proposal-ready state.
- The interface identifies the failed discipline and states that the baseline was not changed.
- Results from successful stages are not presented as an approvable partial plan.
- The user can retry the entire analysis.
- Retry uses the same selected scene and request unless the user chooses to edit them.
- The demo video can visibly explain this guarantee.

### Epic 5: Proposal Review And Producer Approval

#### Story 5.1 — Review before commit

As a producer, I want to inspect the complete impact before changing the baseline so that I remain in control.

Acceptance criteria:

- The proposal-ready view clearly states that no baseline change has been committed.
- Every artifact card indicates that proposed changes are available.
- Opening an artifact reveals its before/after detail.
- The producer can switch among artifacts without losing the proposal.
- `Approve`, `Discard`, and `Edit request and rerun` are all visible.
- Individual proposed values cannot be manually edited.

#### Story 5.2 — Edit and replace a proposal

As a producer, I want to revise my original request and rerun the analysis so that I can steer the system without patching inconsistent outputs.

Acceptance criteria:

- Choosing `Edit request and rerun` returns focus to the original request.
- The existing proposal is clearly marked as replaceable and cannot be approved once the rerun starts.
- The rerun produces one new complete proposal.
- The product does not need to preserve or compare previous proposal attempts.

#### Story 5.3 — Approve atomically

As a producer, I want one approval to update all five artifacts together so that the new plan is internally consistent.

Acceptance criteria:

- Approval is available only after all five required proposal results are ready.
- One approval action commits all five demo-instance artifacts.
- The interface displays a new baseline version identifier or version label.
- The interface displays the approval timestamp.
- A confirmation states that five artifacts were updated.
- The approved proposal can no longer be edited.
- A second ripple cannot be started until the demo is explicitly reset.
- Export becomes available only after successful approval.

#### Story 5.4 — Discard safely

As a producer, I want to discard a proposal so that an unwanted change never affects the baseline.

Acceptance criteria:

- Discard requires a deliberate action but no elaborate confirmation workflow.
- After discard, all baseline artifact summaries match their pre-analysis values.
- The revision text remains available for editing or can be cleared.
- Export remains disabled because there is no approved revision record.

### Epic 6: Parallel-Grounded Production Evidence And Locations

#### Story 6.1 — Inspect live production evidence and grounded candidates

As a producer, I want production constraints and location candidates tied to visible evidence so that I can evaluate feasibility rather than accept unsupported suggestions.

Acceptance criteria:

- The baseline contains credible New Mexico candidates relevant to the original scene.
- Every accepted live ripple calls Parallel Search at runtime with revision-specific research objectives.
- Research covers the constraints that materially affect the revised scene, such as film-office guidance, jurisdictional access, road control, night work, stunt operations, weather exposure, and child-performer requirements.
- The proposal re-evaluates candidates against the revised night, rain, road-control, rigging, and stunt-safety constraints.
- Each evidence record contains a page title, canonical URL, relevant excerpt, research query/objective, and retrieval time.
- Each displayed candidate contains a name, region/locality, short fit explanation, and citations to supporting evidence.
- The interface names Parallel on the evidence stage and detail view so runtime partner use is visible to judges.
- The interface does not imply that a location is booked, permitted, legally cleared, or guaranteed safe.

#### Story 6.2 — Disclose cached fallback

As a producer, I want to know when production evidence is cached so that I do not mistake older data for a live lookup.

Acceptance criteria:

- Live results carry a visible live/fresh indicator and current retrieval time.
- Cached results carry a visible `Cached fallback` label and original retrieval time.
- Cached fallback can satisfy the evidence and location stages when the live lookup fails.
- Using cached results does not cause the overall ripple to fail.
- The proposal states that the producer should verify current access, permit, availability, and safety conditions.

### Epic 7: Two-Page Production Export

#### Story 7.1 — Export after approval

As a producer, I want a compact approved-plan PDF so that I can hand a tangible result to collaborators.

Acceptance criteria:

- Before approval, the PDF action is disabled.
- Disabled copy explains: “Approve a revision to export.”
- Successful approval enables the export action.
- The downloaded document contains exactly two purposeful pages unless content flow requires a harmless layout adjustment:
  - page one summarizes the current approved production plan across all five artifacts;
  - page two records the approved revision, before/after impact, approval time, and location-evidence status.
- The document identifies the production title and baseline version.
- The export is readable and professional without custom letterhead, elaborate branding, or multiple templates.
- Exporting does not start another agent invocation.

### Epic 8: Reset, Limits, And Recoverable Failures

#### Story 8.1 — Reset the demo

As a judge, I want to restore the original production quickly so that I can retry the complete experience.

Acceptance criteria:

- `Reset demo` is visible after an approval and available from recoverable failure states.
- Reset restores the original scene selection, artifact summaries, revision input, proposal state, approval state, and export state.
- Reset affects only the current browser's demo instance and does not replace its long-lived instance identifier.
- Reset does not bypass the global daily analysis cap.
- Reset does not itself consume an agent invocation.

#### Story 8.2 — Continue viewing at the daily cap

As a judge arriving after the analysis allowance is exhausted, I want to inspect a complete product state so that I can still evaluate the submission.

Acceptance criteria:

- A clear message states that new Revision Ripple analyses are temporarily unavailable.
- The message does not present the app as broken.
- The baseline dashboard, artifact drawer, grounded evidence, and bundled approved example remain viewable.
- A representative two-page PDF remains downloadable when an approved example is shown.
- Login and navigation remain functional.

#### Story 8.3 — Recover from unexpected errors

As a judge, I want errors to preserve my orientation so that I can continue the demo or reset safely.

Acceptance criteria:

- Errors use plain language and identify whether the baseline changed; the default is that it did not.
- The product never replaces populated cards with blank cards because an analysis failed.
- Recoverable failures offer either full retry, return to baseline, or reset.
- A live Parallel Search failure uses cached evidence before escalating to a whole-ripple failure.
- Authentication failure returns to a login state without revealing sensitive details.

## Edge Cases

### Shared-account concurrency

- Multiple visitors may use the same judge credential simultaneously.
- Their selected scenes, requests, progress, proposals, approvals, and resets must remain isolated by persistent browser demo instance.
- Logout and login must not create a new instance or replenish the current demo cycle.
- Aggregate usage limits remain shared across all demo instances.

### Refresh and navigation

- Refresh during baseline or approved state must return to a coherent state—preferably the same demo instance, otherwise a clearly identified baseline.
- Refresh must never mix old summary cards with a proposal from another state.
- Leaving or refreshing during analysis may cancel the attempt; returning must show the unchanged baseline and a clear retry path.

### Invalid request

- Empty, nonsensical, or non-production requests do not start the full pipeline.
- The product suggests valid change categories without forcing the golden-path wording.

### Slow analysis

- The activity rail continues to communicate which stage is active.
- The interface does not fabricate completion.
- The approved baseline remains inspectable.

### Specialist failure

- Any required discipline failure prevents approval.
- Full retry is the only MVP retry behavior; partial-node retry is deferred.

### Grounding failure

- Cached fallback is attempted.
- Cached evidence is disclosed with timestamps.
- If neither live nor cached evidence exists, the location stage fails and no partial proposal can be approved.

### Rate limit reached mid-demo

- A proposal already completed may still be reviewed and approved.
- No new analysis may start.
- Reset does not grant a new invocation.

### PDF requested too early

- The action remains visible but disabled with explanatory copy.
- No empty or fabricated page-two revision record is produced.

### Unsupported screenplay upload

- Unsupported or scanned files receive a clear limitation message.
- The fixed demo project remains available and unchanged.

## Visual And Interaction Requirements

- Use near-black rather than pure-black surfaces.
- Reserve amber/gold for active states, focus, approval, and ripple progression.
- Use restrained neutral colors for complete, pending, and inactive states.
- Use a clean geometric sans for interface copy and a monospace face for budgets, timecodes, counts, and version identifiers.
- Keep the production title, selected scene, five artifact summaries, and revision CTA visible in the first desktop viewport.
- Prefer a dashboard plus shared detail drawer over separate artifact pages.
- Make the Parallel Evidence stage and citation provenance legible without leaving the main workflow.
- Ensure keyboard focus and disabled states are visible.
- Do not rely on animation alone to communicate progress; every rail stage needs a text status.
- Respect reduced-motion preferences while retaining stage-by-stage status changes.
- Avoid cinematic imagery, film-reel clichés, fake studio dashboards, and decorative complexity.

## What We Are Building

### Required for the proof of concept

- Allow-listed judge login with no public signup.
- Persistent browser demo instances over an immutable baseline, independent of login/logout state.
- Fixed New Mexico production and populated five-artifact dashboard.
- Scene navigation with Scene 14 pre-selected.
- Natural-language revision input and validation.
- Six-stage visible Revision Ripple workflow, including a real Parallel Evidence call.
- Complete before/after proposal across all five artifacts.
- Approve, discard, and edit-and-rerun controls.
- Atomic commit and no-partial-success behavior.
- Live Parallel production evidence with cached fallback disclosure.
- One approved ripple per demo cycle plus explicit reset; logout does not reset the cycle.
- Global daily analysis cap with read-only continuity.
- Two-page post-approval PDF export.
- Cloud Tasks execution that continues independently of the browser connection.
- Cloud Run-hosted judge experience with Firestore-persisted state.
- Public OSI-licensed source repository.
- Secondary text-based PDF upload proof only after the deployed golden path passes.

### Priority protection

If time runs short, protect the working flow in this order:

1. deployed baseline → revision → six-stage workflow → proposal → approval;
2. schedule and budget impact quality;
3. Parallel runtime evidence, citations, and cached fallback;
4. casting brief quality;
5. PDF export;
6. authentication polish and secondary upload proof;
7. drawer refinements and motion polish.

Authentication's server-side invocation gate is still required before public judging, even if its visual polish is deferred.

## What We Would Add With More Time

- Individual user accounts and private production data.
- Multiple project creation, listing, renaming, deletion, and project-specific persistence.
- Full screenplay version upload and semantic revision diffing.
- Fountain and Final Draft support.
- Scanned-script OCR.
- Multiple sequential revisions with version history, rollback, and proposal comparison.
- Partial specialist retry with dependency-aware recomputation.
- Manual constraint editing with full cross-artifact validation.
- Collaboration, comments, assignments, approvals by role, and notifications.
- Detailed stripboards, call sheets, line-item budgets, permit workflows, and tax-incentive modeling.
- Named talent discovery only after appropriate rights, bias, and compliance design.
- Configurable regions beyond the New Mexico demo.
- Custom export templates and downstream integrations.

## Non-Goals

- ScriptOps is not a complete production-management suite; breadth would dilute the Revision Ripple proof within the available time.
- ScriptOps does not provide legal, labor, permitting, safety, accounting, or financial advice.
- ScriptOps does not recommend real actors; publicity, bias, and rights concerns are avoided by generating casting briefs only.
- ScriptOps does not expose model chain-of-thought.
- ScriptOps targets the Parallel track and does not claim integration with Replit, ClickHouse, Grafana, or IBM Bob.
- ScriptOps does not make the bundled demo dependent on live PDF parsing. A disclosed evidence cache protects the flow when Parallel is temporarily unavailable.
- ScriptOps does not use Google Places as its live grounding source.

## Submission Proof Points

### Technological implementation

- A visibly coordinated Gemini/Google agent workflow produces structured changes rather than a single prose answer.
- A dedicated Production Evidence Agent calls Parallel Search at runtime; its cited output materially informs schedule, budget, and location results.
- Failure isolation preserves the approved baseline when any required discipline fails.
- Runtime research is evidenced with Parallel labeling, links, excerpts, timestamps, query provenance, and live/cached disclosure.
- Agent invocation is access-controlled and rate-limited.
- The application runs on Google Cloud Run, executes durable work through Cloud Tasks, persists state in Firestore, and uses Gemini through Vertex AI.

### Design

- One coherent dashboard presents the screenplay, five artifacts, revision control, impact proposal, and export.
- The restrained interface feels credible for real production work.
- The activity rail unifies system status and the memorable Revision Ripple visual.
- The shared detail drawer provides depth without fragmenting navigation.

### Potential impact

- The demo shows how one creative change normally creates separate schedule, budget, location, casting, and breakdown tasks.
- The approved proposal replaces those manual handoffs with one traceable decision loop.
- The PDF demonstrates a practical handoff artifact rather than an animation-only concept.

### Quality of the idea

- The novelty is not screenplay summarization; it is cross-artifact dependency protection.
- Human approval, atomic commit, source disclosure, and failure isolation demonstrate understanding of real production risk.
- The exact golden-path revision creates legitimate consequences in all five disciplines.

### Three-minute demo evidence

The demo must visibly show:

1. successful judge login;
2. populated baseline summaries;
3. Scene 14 and the natural-language change;
4. all six rail stages progressing, with Parallel Evidence visibly identified;
5. complete proposed before/after impact;
6. explicit producer approval;
7. five updated artifacts and new version confirmation;
8. Parallel-sourced evidence, citations, and cache disclosure;
9. PDF download;
10. a concise statement that failed specialist analysis never commits a partial plan.

The submission README and video must also show the public Cloud Run URL, public OSI-licensed repository, the Parallel SDK/import in source, and one stored live evidence result so eligibility does not depend on narrative claims.
