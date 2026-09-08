# ScriptOps — Devpost submission draft

## Title

ScriptOps

## Tagline

Turn a screenplay change into an evidence-backed production plan a producer can safely approve.

## Partner track

Parallel

## Project description

Independent film producers lose time when a screenplay change ripples across schedules, budgets, locations, casting, and compliance planning. The work is often repeated in disconnected documents, while a seemingly small revision can create expensive production consequences.

ScriptOps is a human-supervised pre-production workspace for media and entertainment teams. A producer uploads a screenplay, reviews the parsed scenes, and generates a connected initial production plan. The plan contains five linked artifacts: a scene breakdown, shooting schedule, budget band, location recommendations, and casting briefs.

Its central workflow is **Revision Ripple**. A producer describes a change to a selected scene, such as moving a desert sequence to a rainy night with a child witness. ScriptOps creates a complete proposed revision, showing schedule, budget, location, and casting consequences before anything changes. The approved baseline stays untouched until the producer explicitly approves the entire proposal. Approved versions are retained in history and exported as owner-scoped production PDFs.

## How it works

1. **Parse and review.** Screenplay PDF and FDX uploads enter a private project workspace. The producer can inspect and correct parsed scene structure before planning begins.
2. **Research constraints with Parallel.** The initial planning workflow calls the Parallel Search API at runtime through the official `parallel-web` TypeScript SDK. It runs focused searches for production constraints triggered by the screenplay, including permits, costs, minors, stunts, vehicles, and night work.
3. **Validate evidence.** ScriptOps accepts only fresh, cited, topic-complete evidence. The system normalizes sources, rejects incomplete coverage, and attaches evidence IDs to downstream planning outputs.
4. **Generate the plan with Gemini on Google Cloud.** Gemini on Vertex AI produces schema-constrained planning stages for the breakdown, schedule, budget, locations, and casting. Cloud Tasks performs the durable work and Firestore persists state, proposals, and immutable approved versions.
5. **Approve a complete revision.** Revision Ripple produces an explainable all-artifact proposal. The producer either approves the full version atomically, discards it, or revises the request. No partial artifact patch can silently change the baseline.

## Why Parallel is essential

Parallel is not a decorative search box. It supplies the current, cited production evidence that constrains the initial plan and informs real choices:

- location and permit risks influence schedule and location recommendations;
- wage and cost evidence supports budget line items;
- child-performer, stunt, road, and night-work constraints become explicit warnings and planning assumptions;
- evidence provenance is shown in the product with source links, retrieval time, and source count.

The initial plan cannot proceed when required research coverage is missing or stale. This lets ScriptOps give producers a reviewable plan based on current external constraints rather than treating an LLM response as an unverified production decision.

## Google Cloud products used

- Cloud Run for the hosted Next.js application and authenticated worker routes
- Vertex AI Gemini for structured planning generation
- Google ADK and Google Gen AI SDKs for agent and model integration
- Firestore for durable project, job, proposal, and approved-version state
- Cloud Tasks for asynchronous, OIDC-authenticated processing and recovery
- Cloud Storage for private screenplay source objects and approved artifacts
- Secret Manager for server-side provider credentials
- Cloud Scheduler for reconciliation and cleanup

## Other tools and products

- Parallel Search API through the official `parallel-web` TypeScript SDK
- Clerk for allow-listed judge access
- Next.js, React, TypeScript, Zod, and React PDF

## Key features

- Private per-project screenplay workspace with PDF and FDX ingestion
- Scene review before paid planning begins
- Evidence-aware initial planning with strict schema and citation checks
- Deterministic, multi-step Revision Ripple workflow
- Atomic producer approval and immutable Plan v1, v2, and v3 history
- Owner-scoped production-PDF exports
- Archive, restore, and confirmed scoped deletion with durable cleanup fencing

## Architecture

```text
Producer browser
  → Cloud Run / Next.js / Clerk
  → Firestore project and approved-plan state
  → Cloud Tasks durable job worker
  → Parallel Search API (current production evidence)
  → Vertex AI Gemini / Google ADK (structured plan stages)
  → Firestore immutable approved version
  → Cloud Storage private sources and owner-scoped PDF export
```

## Testing and validation

- Unit, integration, typecheck, lint, and production-build coverage for planning, ownership, versioning, export, cleanup, and failure boundaries.
- Deployed verification confirmed signed-out project and deletion APIs return `401`, the workspace redirects unauthenticated users to sign-in, and Cloud Run health is live.
- Authenticated production verification covered project archive/restore, Plan v1 to Plan v2 to Plan v3 approval, version history, persisted PDF review state, and an empty-project confirmed deletion with scoped Firestore and Cloud Storage cleanup.
- Live production planning produced cited Parallel evidence and visible schedule, budget, and location impacts. Provider errors cannot publish a draft baseline.

## How Codex was used

Codex was used as the implementation partner: translating the product requirements into typed contracts, designing durable Google Cloud workflows, writing and verifying the application, testing deployed behavior, and iterating on the producer-facing workflow. The project’s human approval boundary remained deliberate: Codex helped build and test the system, while ScriptOps requires a producer to approve any plan change.

## Demo video outline (three minutes)

1. **0:00–0:25 — The production problem.** Show a selected scene and explain why a change affects five planning artifacts.
2. **0:25–0:55 — Initial plan and evidence.** Show the connected plan and visible Parallel evidence links/provenance.
3. **0:55–1:55 — Revision Ripple.** Request a rainy-night change with a child witness. Show the multi-step workflow, then the proposed schedule, budget, locations, casting, assumptions, and citations.
4. **1:55–2:30 — Producer control.** Emphasize that the baseline remains unchanged until one atomic approval. Approve the proposal and show Plan v2/Plan v3 history.
5. **2:30–3:00 — Production readiness.** Show the export and summarize the Cloud Run, Firestore, Cloud Tasks, Vertex AI Gemini, and Parallel runtime path.

## Screenshot shot list

1. Project workspace showing the selected scene and five production artifacts.
2. Parallel evidence panel with live/cited source links and retrieval provenance.
3. Revision Ripple proposal showing before/after impact summary and explicit approval controls.
4. Plan history with approved versions and production-PDF links.

## TODO — exact Devpost form fields

- Open-source repository URL: `https://github.com/resilientbeast/ScriptOps`
- Hosted project URL: `https://scriptops-5sinbwmqzq-uc.a.run.app/`
- Public YouTube or Vimeo demo URL: **TODO — upload three-minute demo**
- Submitter type: **TODO — confirm Individual, Team, or Organization**
- Organization name: **TODO — use `N/A` unless representing an organization**
- Government employee: **TODO — confirm**
- Country of residence: **TODO — confirm**
- Canada province: **TODO — use `N/A` unless applicable**
- Project status before July 27, 2026: **New**
- Partner track: **Parallel**
- Total team members: **TODO — confirm**
- First time using Parallel: **TODO — confirm**
- IBM/Grafana/Clickhouse/Replit first-use fields: **N/A — Parallel track**
