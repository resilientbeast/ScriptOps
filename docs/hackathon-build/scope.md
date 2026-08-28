# Project Scope

## Project

**ScriptOps** is a human-supervised pre-production system for indie producers. It turns a screenplay into five connected production artifacts and uses **Revision Ripple** to propagate one approved scene change across all five. A **Parallel-powered Production Evidence Agent** researches real-world constraints before schedule, budget, and location recommendations are proposed.

## Track And Product Thesis

- **Hackathon track:** Parallel.
- **Required partner use:** Parallel Search API is called at runtime from the agent workflow; it is not a README-only integration.
- **Google runtime:** Gemini on Vertex AI, orchestrated with the Google Agent Development Kit (ADK), hosted on Google Cloud.
- **Product promise:** nothing gets dropped when things change.
- **Track story:** creative changes become operational decisions only after ScriptOps gathers current, cited production evidence.

The strongest demo is not the initial report. It is watching a meaningful revision cascade through five linked artifacts while a visible evidence stage grounds the operational consequences.

## Target User

### Primary user

An indie producer entering pre-production who must coordinate creative decisions across scene requirements, schedule, budget, locations, and casting without a large studio operations team.

### Supporting users in the story

- The first assistant director consumes the updated schedule.
- The production manager consumes the budget band and cost drivers.
- Casting and location collaborators consume the approved briefs and evidence.

The producer remains the sole MVP persona because they own the cross-functional decision and approval loop.

## Problem

A small screenplay change creates work across disconnected documents, vendors, and conversations. Producers must identify every dependency, research external constraints, ask collaborators to recalculate their portion, reconcile inconsistent answers, and manually update the baseline. Important consequences are easily missed, while unsupported AI suggestions are difficult to trust.

ScriptOps combines coordinated analysis with current web evidence and keeps the producer in control through propose → review → approve.

## Time Budget And Scope Ruler

- Build window: 2–3 days.
- Available effort: 6–8 hours per day, approximately 18–24 hours total.
- Build method: Codex is the primary implementation partner; the user makes product and visual approvals.
- Priority rule: the complete deployed Revision Ripple path must work before secondary input support or polish.
- First cut if time compresses: screenplay PDF upload inspection.
- Artifact fallback cut order: preserve schedule and budget first, then locations, then casting. The intended MVP still updates all five.

## Core Workflow

1. A judge opens the public Cloud Run application and signs in with the supplied allow-listed Clerk credentials; public self-signup is disabled.
2. The judge lands on one fixed, pre-populated New Mexico production. A browser-specific demo instance is independent of Clerk login/logout state.
3. ScriptOps immediately shows the screenplay and five populated artifacts:
   - scene breakdown;
   - shooting schedule;
   - budget band and major cost drivers;
   - grounded location candidates;
   - casting briefs.
4. The judge selects Scene 14 and enters: **“Move Scene 14 from a daytime desert road to a rainy night exterior, add a child witness, and require stunt driving.”**
5. Revision Ripple locks the input and shows real progress through six workflow stages: **Breakdown → Parallel Evidence → Schedule → Budget → Locations → Casting**. Evidence is a workflow stage, not a sixth production artifact.
6. Parallel Search gathers cited New Mexico production evidence relevant to night access, road control, stunt safety, weather exposure, permits, and child-performer constraints. Schedule, budget, and locations consume that evidence.
7. ScriptOps presents one complete proposal explaining the consequences across all five artifacts. The approved baseline is still unchanged.
8. The producer approves or discards the proposal. Editing the request reruns and replaces the proposal; artifacts cannot be manually patched mid-proposal.
9. Approval commits all five artifacts atomically. If a required stage fails, the previous baseline remains active and no partial plan is shown as approved.
10. The judge opens location/evidence details and sees source links, excerpts, retrieval time, and a `Live` or `Cached fallback` label.
11. The judge downloads a two-page PDF containing the current plan and the approved revision-impact record.

## What We Are Building

### P0 — Complete judged path

- One polished sample screenplay and immutable baseline fixtures.
- One persistent browser-specific demo instance, copied from that baseline.
- Scene selection and natural-language revision input.
- Gemini/ADK multi-agent orchestration with structured schemas.
- A Parallel Search evidence tool invoked during every accepted live ripple.
- Evidence-aware schedule, budget, and location recommendations.
- Five connected proposed artifact updates.
- Human approval before baseline mutation.
- Firestore transaction for all-or-nothing approval and cycle enforcement.
- Cloud Tasks execution so closing or refreshing the browser cannot cancel the workflow.
- Real server progress via passive SSE with polling fallback.
- Six-stage activity rail that is the restrained Revision Ripple animation.
- Live evidence with cited URLs, excerpts, timestamps, and query provenance.
- Disclosed cached evidence fallback for demo resilience.
- Two-page PDF after approval.
- Clerk allow-listed access, one ripple per browser cycle, explicit reset, and a global daily invocation cap.
- Public deployment on Cloud Run and a public OSI-licensed repository.

### P1 — Only after the deployed golden path passes

- Text-based PDF screenplay inspection, limited to 5 MB.
- No OCR; scanned or empty PDFs return a clear unsupported-input message.
- The upload proves generality but does not replace the fixed demo project or drive the judged flow.

## Presentation Direction

- Near-black, restrained interface inspired by Linear and an air-traffic-control tower at night.
- Warm amber/gold reserved for active states and ripple progression.
- Clean geometric sans for interface chrome; monospace for budgets, timecodes, run IDs, and evidence timestamps.
- All five cards show real summary statistics on first load.
- One shared detail drawer preserves context instead of creating five separate pages.
- During analysis, the activity rail—not a spinner—is the dominant visual.
- `Parallel Evidence` is visibly branded in the rail and evidence drawer so partner runtime use is unmistakable.
- The emotional target after approval is control: one change was resolved without five manual handoffs.

## What We Are Not Building

- Public signup, account administration, profiles, organizations, roles, or password-recovery product flows.
- Multiple projects or project CRUD.
- Real-time collaboration, messaging, Slack, or email integrations.
- Scanned-screenplay OCR, whole-screenplay revision diffing, or Final Draft/Fountain fidelity.
- Detailed line-item production accounting or tax-incentive calculations.
- Named real-actor recommendations; casting output is archetypes, compliance notes, and specialist briefs.
- Full call sheets, stripboards, sides, permits, contracts, payroll, or production-suite parity.
- Manual edits to individual proposal artifacts.
- Raw chain-of-thought.
- Google Places as the live grounding source; Parallel Search owns runtime web evidence for this track.
- Replit Agent, Replit hosting, Replit SQL, or any claim to the Replit track.
- ClickHouse, Grafana, or IBM Bob integrations.

## Demo Path

The three-minute demo moves quickly through setup and spends its time on Revision Ripple:

1. Sign in and show the populated fixed project.
2. Orient viewers to the five artifacts in under 20 seconds.
3. Select Scene 14 and submit the prepared revision.
4. Show the six-stage rail, explicitly calling out the live Parallel evidence step.
5. Open one citation while the complete proposal remains uncommitted.
6. Review meaningful changes across all five artifacts.
7. Approve once and show the versioned atomic update.
8. Download the two-page PDF.
9. State the safety guarantee: one failed required stage never creates a half-updated approved plan.
10. Briefly show the public repository and architecture diagram as submission proof.

## Definition Of Done

The MVP is complete when a judge, using supplied credentials and no setup beyond login, can open the Cloud Run URL, reach an isolated copy of the fixed demo project, submit the prepared revision to Scene 14, watch all six real workflow stages, inspect current Parallel-sourced evidence, review five proposed artifact changes, approve them atomically, refresh without losing state, and download the two-page PDF. Cached evidence may rescue a Parallel failure, but it must be visibly disclosed and the approved baseline must remain consistent.

## Submission Story

Most production tools help teams create documents. ScriptOps protects the connections between them and grounds high-consequence changes in current evidence. Gemini agents interpret the creative revision; Parallel Search supplies real operational context; the producer controls the final commit. The result is a production-ready decision loop rather than a one-shot AI report.
