# Technical Spec

## 1. Overview

ScriptOps is a single Next.js + TypeScript application deployed to Google Cloud Run. A judge signs in, receives a browser-specific copy of an immutable sample production, requests a natural-language change to one scene, watches a Gemini/ADK workflow research and analyze the consequences, reviews one complete proposal, and approves all five production artifacts in one Firestore transaction.

The selected hackathon partner is **Parallel**. Every accepted live Revision Ripple attempts a runtime Parallel Search call through a server-only tool. The resulting evidence is stored with citations and materially informs the schedule, budget, and location outputs.

This architecture is deliberately compact:

- one Cloud Run service for the web UI, APIs, passive progress stream, and task worker route;
- Cloud Tasks for durable browser-independent dispatch;
- Firestore for mutable state and atomic approval;
- versioned JSON fixtures for the screenplay, baseline, approved example, and emergency evidence fallback;
- Google ADK for typed workflow composition;
- Gemini through Vertex AI for analysis;
- Parallel Search for current web evidence;
- Clerk as a shared-credential access gate;
- no Replit, SQL ORM, Google Places, second backend, or general project/account system.

### 1.1 Architectural invariants

1. The Clerk user ID never identifies mutable demo state. The long-lived `scriptops_demo_id` browser cookie does.
2. Logout does not clear that cookie. Only explicit reset starts a new cycle in the same browser instance.
3. An accepted ripple attempts Parallel Search at runtime before downstream production recommendations are assembled.
4. Analysis writes only run/progress/proposal state. It never mutates the approved production plan.
5. A proposal becomes approvable only after all five artifact schemas and the complete proposal pass deterministic validation.
6. Approval replaces all five artifacts and records the revision in one Firestore transaction.
7. The browser does not own execution. Closing the tab, losing SSE, or refreshing cannot cancel the Cloud Tasks worker request.
8. A cached evidence result is visibly labeled and retains its original retrieval timestamp.
9. One open run exists per demo instance and cycle. One approval is allowed before explicit reset.
10. Raw chain-of-thought is never stored or shown. Only concise reasons, assumptions, confidence, sources, and stage status are exposed.
11. Provider secrets and Google credentials remain server-side.
12. No exact model/library version is trusted until a deployed smoke test passes; working versions are then pinned.

## 2. System Architecture

```text
Judge browser
  │ Clerk session + long-lived demo cookie
  ▼
Public Next.js service on Cloud Run
  ├── dashboard and shared artifact/evidence drawer
  ├── authenticated public API routes
  ├── passive SSE and polling status routes
  ├── PDF generation route
  └── OIDC-verified internal task worker route
       │
       ├── Google ADK / Gemini on Vertex AI
       ├── Parallel Search API via parallel-web
       └── deterministic schema gates and proposal assembler

Cloud Tasks ───────► internal worker HTTP request
Firestore ◄─────── run state, progress, proposals, approved plans, usage, cache
JSON fixtures ──── immutable screenplay, baseline, approved example, fallback evidence
```

### 2.1 Why Cloud Tasks

`POST /api/ripples` creates state and enqueues work, then returns `202`. Cloud Tasks makes a separate authenticated HTTP request to the worker and keeps that request open until the pipeline succeeds or fails. The browser's SSE connection is only an observer. This directly satisfies refresh/close survival without relying on a post-response callback or an always-on VM.

The worker must finish within both the Cloud Run request timeout and the Cloud Tasks dispatch deadline. The deadline is configured after timing five deployed golden-path runs; it must be at least `max(120 seconds, 2 × measured p95)` and remain under provider/platform limits.

### 2.2 Agent dependency graph

```text
Revision request + approved baseline + selected scene
                    │
                    ▼
              BreakdownAgent
                    │
              BreakdownGate
                    │
                    ▼
       ProductionEvidenceAgent
       └── Parallel Search tool
                    │
               EvidenceGate
                    │
                    ▼
               ScheduleAgent
                    │
               ScheduleGate
                    │
                    ▼
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  BudgetAgent  LocationAgent  CastingAgent
       └────────────┼────────────┘
                    ▼
           CompleteProposalGate
                    │
                    ▼
              proposal_ready
```

The production has five artifacts; `Parallel Evidence` is a sixth workflow stage, not a sixth artifact. Budget runs after Schedule because its band must use the actual proposed shoot-day count and night/day mix. Budget, Locations, and Casting then use distinct ADK output keys and run concurrently.

### 2.3 Evidence dependency rules

- Breakdown determines which external questions matter.
- ProductionEvidenceAgent creates two or three focused research objectives/search-query groups for New Mexico.
- Schedule consumes validated breakdown and evidence relevant to operating hours, access, road control, child labor, and safety setup.
- Budget consumes validated schedule plus evidence-backed cost/risk drivers; it does not invent precise vendor prices.
- Locations consumes breakdown, schedule constraints, and evidence to rank candidates and attach citations.
- Casting consumes breakdown and schedule compliance flags; external evidence is optional unless it supports a compliance note.
- Cached evidence may replace a failed live call, but `sourceMode` must remain `cached` throughout the proposal and PDF.

## 3. Technology Stack

| Layer | Choice | Purpose |
|---|---|---|
| Web | Next.js App Router + TypeScript | One full-stack codebase and server-rendered judge experience. |
| UI | React, Tailwind CSS, shadcn/ui primitives, Lucide icons | Fast accessible implementation of the restrained dashboard. |
| Validation | Zod | Shared runtime contracts for APIs, model outputs, fixtures, and persisted documents. |
| Agent orchestration | Official Google ADK for TypeScript (`@google/adk`) | Sequential and parallel agent composition, tools, and structured state. |
| Model | Gemini fast stable model on Vertex AI; `gemini-3.7-flash` is the initial candidate | Low-latency structured analysis; final ID is pinned after smoke test. |
| Web research | Official Parallel TypeScript SDK (`parallel-web`) Search API | Runtime evidence with URLs, titles, and relevant excerpts. |
| Hosting | Google Cloud Run | Public Next.js container and authenticated worker request handling. |
| Durable dispatch | Google Cloud Tasks | Browser-independent workflow start, retry envelope, and authenticated HTTP delivery. |
| Database | Cloud Firestore in Native mode | Serverless persistence and multi-document transactions. |
| Auth | Clerk for Next.js | Invite-only/shared judge access gate; server authorization on expensive actions. |
| PDF | `@react-pdf/renderer` or a smaller proven server PDF library | Two-page production summary and revision record. |
| Tests | Vitest + Testing Library; Playwright only if time permits | Contract, state-machine, component, and golden-path coverage. |
| Deployment | `gcloud run deploy --source .` | Minimal build/deploy surface; Cloud Build creates the container. |

### 3.1 Version policy

- Use the current Node.js LTS supported by all pinned dependencies.
- Pin exact versions after three early spikes pass: Cloud Run hello, Gemini/ADK structured result, and Parallel Search result.
- Commit the lockfile.
- Do not upgrade dependencies during the last polish/rehearsal stage.
- Keep `GEMINI_MODEL` configurable so a supported fast Vertex model can be selected without code changes.

## 4. Authentication, Isolation, And Cost Controls

### 4.1 Clerk access gate

- Public self-signup is disabled.
- Judges receive one disposable allow-listed account containing only public demo data.
- Middleware gates application routes, but every mutating/expensive server endpoint also verifies Clerk auth.
- Supplied credentials must appear in the README, Devpost testing instructions, and demo notes, never in the public source repository if they expose a reusable secret. Prefer Devpost's tester-instruction field when available.

### 4.2 Browser demo instance

- On first authenticated application request, the server creates a cryptographically random UUID and sets `scriptops_demo_id` as `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, with a long lifetime.
- The cookie is independent of Clerk and is not cleared during logout.
- The server creates `demoInstances/{demoId}` from the immutable baseline on first use.
- Every public data route validates both Clerk auth and ownership by the cookie ID.
- A different browser receives another demo ID even with the same Clerk account.
- Cookie clearing/incognito can create a new instance; the global UTC daily cap is the accepted backstop.

### 4.3 Invocation controls

- One open run per instance/cycle.
- One approved ripple per cycle; reset increments the cycle and restores the baseline.
- Client-generated UUID idempotency key on `POST /api/ripples`.
- Deterministic run ID: hash of instance ID, cycle, and idempotency key. Duplicate requests return the existing run.
- UTC daily counter reserved in the same Firestore transaction as run creation.
- Validation failures that occur before any provider call do not consume a daily slot. Accepted starts, provider failures, and retries do.
- Reaching the cap disables new runs but never hides existing state, evidence, the disclosed approved example, or eligible PDFs.

## 5. Persistence Model

Firestore is server-only; the browser never receives Firebase credentials or queries collections directly. Persisted JSON must pass the same Zod schemas used at runtime. ProductionPlan and Proposal documents must remain comfortably below Firestore's document-size limit; fail validation above 700 KB.

### 5.1 `demoInstances/{demoId}`

```ts
type DemoInstance = {
  demoId: string;
  fixtureVersion: string;
  cycle: number;
  planVersion: number;
  currentPlan: ProductionPlan;
  openRunId: string | null;
  approvedRunId: string | null;
  hasApprovedRipple: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

`demoId` is the cookie UUID, not a Clerk user ID. `currentPlan` is a complete validated snapshot so reset and approval stay simple.

### 5.2 `rippleRuns/{runId}`

```ts
type RunStatus =
  | 'queued' | 'analyzing' | 'rejected' | 'proposal_ready'
  | 'failed' | 'discarded' | 'approved' | 'superseded';

type StageName =
  | 'breakdown' | 'evidence' | 'schedule'
  | 'budget' | 'locations' | 'casting';

type RippleRun = {
  runId: string;
  demoId: string;
  cycle: number;
  basePlanVersion: number;
  idempotencyKey: string;
  sceneId: string;
  requestText: string;
  status: RunStatus;
  stages: Record<StageName, StageProgress>;
  proposal: RevisionProposal | null;
  failure: PublicFailure | null;
  executionAttempt: number;
  executionToken: string | null;
  heartbeatAt: Timestamp | null;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
  approvedAt: Timestamp | null;
};
```

`executionToken` prevents an older worker attempt from writing after a retry/recovery owns the run. Every stage write and final transition conditionally checks the current token and `status === 'analyzing'`.

### 5.3 `evidenceCache/{queryHash}`

```ts
type EvidenceCache = {
  queryHash: string;
  region: 'New Mexico';
  objectives: string[];
  queries: string[];
  evidence: EvidenceRecord[];
  parallelRequestId?: string;
  retrievedAt: Timestamp;
  expiresAt: Timestamp;
  fixtureVersion?: string;
};
```

The newest valid matching cache is preferred. A bundled golden fallback is the last resort. Cached records keep their original timestamp and never change to `live` merely because they were read during a new run.

### 5.4 `usageDaily/{yyyy-mm-dd}`

```ts
type DailyUsage = {
  dateUtc: string;
  acceptedStarts: number;
  cap: number;
  updatedAt: Timestamp;
};
```

### 5.5 Immutable fixtures

- `sample-screenplay.json`
- `baseline-plan.json`
- `approved-example.json`
- `evidence-fallback.json`

All fixtures carry `fixtureVersion` and are validated at build/test time. The approved example and representative PDF are visibly labeled as bundled examples when the current browser has not approved a ripple.

## 6. Domain Contracts

```ts
type ProductionPlan = {
  production: { id: string; title: string; logline: string; region: 'New Mexico' };
  scenes: SceneBreakdown[];
  schedule: ShootingSchedule;
  budget: BudgetBand;
  locations: LocationCandidate[];
  casting: CastingBrief[];
  revisionRecord: ApprovedRevision | null;
};

type EvidenceRecord = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  objective: string;
  query: string;
  retrievedAt: string;
  sourceMode: 'live' | 'cached';
};

type RevisionProposal = {
  runId: string;
  sceneId: string;
  requestText: string;
  basePlanVersion: number;
  proposedPlan: ProductionPlan;
  impacts: {
    breakdown: ArtifactImpact;
    schedule: ArtifactImpact;
    budget: ArtifactImpact;
    locations: ArtifactImpact;
    casting: ArtifactImpact;
  };
  evidence: {
    sourceMode: 'live' | 'cached';
    records: EvidenceRecord[];
    retrievedAt: string;
    parallelRequestId?: string;
  };
  assumptions: string[];
  warnings: string[];
  generatedAt: string;
};

type ArtifactImpact = {
  changed: boolean;
  before: unknown;
  after: unknown;
  reasons: string[];
  evidenceIds: string[];
  confidence: 'low' | 'medium' | 'high';
};
```

Specific artifact schemas additionally enforce:

- schedule shoot-day count and day/night flags;
- budget low/high values, currency, delta range, and named cost drivers;
- location candidates with locality, fit, risks, evidence IDs, and optional map-search URL;
- casting roles/archetypes, age category, compliance notes, and specialist needs;
- no named real performers;
- no claims that permits, access, labor compliance, safety, or costs are guaranteed.

## 7. Run State Machine

```text
queued ──► analyzing ──► rejected
                    ├──► proposal_ready ──► approved
                    │                    ├──► discarded
                    │                    └──► superseded
                    └──► failed
```

Rules:

- `queued → analyzing` is a transactional worker claim.
- Empty/obviously invalid requests are rejected before enqueue. Semantic rejection by Breakdown ends in `rejected`; baseline and cycle allowance remain unchanged, but the accepted daily slot remains consumed.
- Only `analyzing` may become `proposal_ready`, `rejected`, or `failed`.
- Only `proposal_ready` may become `approved`, `discarded`, or `superseded`.
- `approved` requires the run's demo ID, cycle, base version, and `openRunId` to match the current instance.
- No terminal run may accept late stage/proposal writes.
- A stale run can be marked failed only when its heartbeat exceeds the configured threshold. It is never auto-approved or partially recovered.

## 8. API Contracts

All public routes require a valid Clerk session unless stated otherwise. Mutating routes also require same-origin/CSRF protection appropriate to Clerk/Next.js and the signed demo cookie.

### `GET /api/demo`

Creates the cookie and baseline instance if absent, then returns:

- current complete plan and version;
- cycle and approval state;
- current/open run summary;
- cap state without exposing global usage details;
- export eligibility;
- approved-example availability.

### `POST /api/ripples`

Body:

```json
{
  "sceneId": "scene-14",
  "requestText": "Move Scene 14 ...",
  "idempotencyKey": "client-uuid"
}
```

Behavior:

1. Verify Clerk, demo cookie, request length, scene membership, and obvious production relevance.
2. Derive deterministic `runId`.
3. In one Firestore transaction, read the instance, run ID, and UTC usage document; enforce cap/cycle/open-run/base rules; create `queued` run; set `openRunId`; increment accepted starts.
4. Enqueue one named Cloud Task targeting the internal worker with `{runId}`.
5. If task creation fails, conditionally mark the run `failed` and clear `openRunId`; do not invoke providers inline.
6. Return `202 { runId, statusUrl, eventsUrl }`. Duplicate idempotency returns the existing run without incrementing usage.

### `POST /api/internal/ripples/:runId/execute`

- Not linked from the UI.
- Verifies a Google-issued OIDC ID token, expected audience, and exact Cloud Tasks invoker service-account email using `google-auth-library`.
- Rejects requests without valid identity even though the containing Cloud Run service is public.
- Transactionally claims only `queued` work, assigns a new execution token, and increments attempt count.
- A terminal run returns `204`.
- A fresh already-analyzing run returns a retryable response only when delivery semantics require it; an expired lease may be reclaimed with a new token.
- Executes the agent pipeline and returns 2xx only after a terminal run state is persisted.
- Provider errors are converted to sanitized `failed` state; secrets and raw provider bodies are logged only through redacted structured logging.

Cloud Tasks configuration starts with three maximum attempts and conservative exponential backoff. The handler is idempotent. Five deployed timing runs determine the final dispatch deadline and stale threshold.

### `GET /api/ripples/:runId/events`

Passive SSE observer:

- verifies Clerk and demo ownership;
- emits the current snapshot immediately;
- emits only real persisted stage/status changes;
- sends heartbeat comments;
- closes after a terminal state or a short observer timeout;
- never starts, owns, or cancels execution.

### `GET /api/ripples/:runId`

Polling fallback that returns the same public run snapshot. The client switches to 1–2 second polling after SSE failure and re-fetches on refresh.

### `POST /api/ripples/:runId/approve`

In one Firestore transaction:

1. Read instance and run before any writes.
2. Verify ownership, `proposal_ready`, matching cycle/base version/open run, not previously approved, and a fully valid proposal.
3. Replace `currentPlan` with `proposedPlan`, increment `planVersion`, set `approvedRunId`, set `hasApprovedRipple`, clear `openRunId`, and update timestamps.
4. Mark run `approved` with the same commit timestamp.

Concurrent/duplicate approvals return the already-approved state or `409`; they never increment the version twice.

### `POST /api/ripples/:runId/discard`

Conditionally marks a `proposal_ready` run discarded and clears `openRunId`. The approved plan is untouched.

### `POST /api/demo/reset`

In one transaction, refuses reset while a live run is analyzing, restores the immutable baseline, increments cycle, resets plan version and approval fields, clears `openRunId`, and supersedes any unapproved proposal for the prior cycle. It does not replace the browser cookie or reduce the global usage counter.

### `GET /api/export/production-bible.pdf`

- Current-browser approved run: generate page 1 current plan and page 2 approved revision/evidence record.
- No current approval: return `409 EXPORT_REQUIRES_APPROVAL` unless the cap-reached approved-example mode is explicitly selected and visibly labeled.
- Never invokes Gemini or Parallel.

### `POST /api/uploads/inspect` — P1

Accepts one PDF up to 5 MB, checks MIME and PDF signature, extracts text server-side, and returns filename, character count, page count where available, and detected scene headings. Empty extraction returns `422 OCR_NOT_SUPPORTED`. It never mutates the project or invokes agents.

### `GET /api/health`

Returns version/build status only. Deep checks are authenticated and must not call Gemini or Parallel.

## 9. Revision Execution Lifecycle

1. Browser posts a validated request with an idempotency key.
2. API transaction reserves the run and daily slot.
3. API creates the named Cloud Task and returns `202`.
4. Browser subscribes to SSE; refresh simply calls `GET /api/demo` and reconnects/polls.
5. Cloud Tasks invokes the OIDC-verified worker.
6. Worker reloads the trusted baseline, scene, request, cycle, and base version from Firestore.
7. BreakdownAgent creates structured revised scene requirements. BreakdownGate rejects irrelevant or invalid output.
8. ProductionEvidenceAgent derives focused research objectives and calls Parallel Search with the `parallel-web` SDK. EvidenceGate normalizes URLs/excerpts, deduplicates, timestamps, validates allowed protocols, and stores live cache.
9. If Parallel times out or errors, the worker selects a matching valid cache, then the bundled fallback, and marks `sourceMode='cached'`.
10. ScheduleAgent consumes breakdown and evidence; ScheduleGate validates day counts and flags.
11. ADK runs Budget, Locations, and Casting in parallel using distinct state keys.
12. CompleteProposalGate validates all artifacts, evidence references, golden-path invariants, size limits, and prohibited claims.
13. The worker conditionally writes one complete proposal and `proposal_ready` only if its execution token still owns an analyzing run.
14. Producer approval applies all five artifacts atomically; no model call happens during approval.

## 10. Parallel Search Integration

### 10.1 Runtime tool contract

The server-only `searchProductionEvidence` tool accepts:

```ts
{
  region: 'New Mexico';
  objectives: string[];      // 1–3 concise research goals
  searchQueries: string[];   // 1–4 focused web queries
  maxResults: number;        // bounded, initially 8
}
```

It calls Parallel Search using the official TypeScript SDK and returns normalized `EvidenceRecord[]`. The tool must preserve the returned URL, title, relevant excerpts, and any request identifier useful for auditability. It must not scrape pages itself or invoke another AI provider.

Initial golden-path research should target authoritative sources where possible:

- New Mexico film office and state/local government guidance;
- city, county, park, or transport authority pages about access and road control;
- production/safety guidance relevant to night exteriors, simulated rain, stunt driving, and child performers.

Search results are evidence, not legal advice. The UI says `Verify with the relevant authority before booking or permitting.`

### 10.2 Cache behavior

1. Always attempt live Parallel Search for an accepted live run unless an explicit local-test flag is active outside the submitted deployment.
2. On success, validate and write a cache record with an expiry (initially 72 hours).
3. On failure, use newest valid query/region cache.
4. If no database cache exists, use the bundled golden fallback.
5. Propagate `live`/`cached` to every consuming claim and the PDF.
6. Never describe cached evidence as a current live search.

### 10.3 Eligibility proof

- `parallel-web` appears in `package.json` and is imported in server-only code.
- The demo visibly shows the Parallel Evidence stage.
- Evidence drawer shows live/cached state, retrieval time, URLs, and excerpts.
- The repository README explains where Parallel is called and which outputs depend on it.
- A submission screenshot and demo segment show an actual stored live result.
- The deployed golden-path test records a successful Parallel request before submission.

## 11. Google ADK And Gemini

- Use official `@google/adk` TypeScript primitives rather than a hand-written loop presented as multi-agent orchestration.
- Use `SequentialAgent` for dependency order and `ParallelAgent` for Budget/Locations/Casting fan-out.
- Expose Parallel Search as a typed custom tool only to ProductionEvidenceAgent.
- Run on Vertex AI using Cloud Run service identity and Application Default Credentials.
- Candidate configuration:

```text
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=<supported-region>
GEMINI_MODEL=gemini-3.7-flash
```

If the candidate model ID is unavailable in the selected Vertex region, choose the current stable fast Gemini model shown in official Vertex documentation, record the exact ID in `build-notes.md`, and pin it. Do not add a non-Google model fallback because hackathon rules restrict runtime AI providers.

### 11.1 Prompt and output rules

- Inputs contain only the trusted selected scene, current baseline sections needed by the stage, validated upstream outputs, and relevant evidence.
- Prompts demand JSON matching a named schema; prose outside the schema is rejected.
- Agents identify assumptions and confidence but never expose hidden reasoning.
- Schedule must derive from breakdown and evidence.
- Budget must derive from the validated schedule and uses bands/deltas, not fabricated quotes.
- Locations must cite evidence IDs for externally grounded claims.
- Casting produces role archetypes and specialist/compliance needs, never named actors.
- All outputs include a disclaimer for verification of legal, labor, permitting, safety, availability, and cost facts.

## 12. File Structure

```text
.
├── app/
│   ├── (auth)/sign-in/[[...sign-in]]/page.tsx
│   ├── (app)/page.tsx
│   ├── api/
│   │   ├── demo/route.ts
│   │   ├── demo/reset/route.ts
│   │   ├── ripples/route.ts
│   │   ├── ripples/[runId]/route.ts
│   │   ├── ripples/[runId]/events/route.ts
│   │   ├── ripples/[runId]/approve/route.ts
│   │   ├── ripples/[runId]/discard/route.ts
│   │   ├── internal/ripples/[runId]/execute/route.ts
│   │   ├── export/production-bible.pdf/route.ts
│   │   ├── uploads/inspect/route.ts             # P1
│   │   └── health/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── dashboard/
│   │   ├── production-header.tsx
│   │   ├── scene-panel.tsx
│   │   ├── artifact-grid.tsx
│   │   ├── artifact-card.tsx
│   │   ├── detail-drawer.tsx
│   │   └── evidence-panel.tsx
│   ├── ripple/
│   │   ├── revision-composer.tsx
│   │   ├── activity-rail.tsx
│   │   ├── proposal-review.tsx
│   │   └── approval-bar.tsx
│   └── ui/
├── lib/
│   ├── agents/
│   │   ├── workflow.ts
│   │   ├── breakdown-agent.ts
│   │   ├── evidence-agent.ts
│   │   ├── schedule-agent.ts
│   │   ├── budget-agent.ts
│   │   ├── location-agent.ts
│   │   ├── casting-agent.ts
│   │   ├── prompts.ts
│   │   └── gates.ts
│   ├── parallel/
│   │   ├── client.ts
│   │   ├── search-production-evidence.ts
│   │   └── normalize.ts
│   ├── cloud-tasks/
│   │   ├── enqueue.ts
│   │   └── verify-task-identity.ts
│   ├── firestore/
│   │   ├── admin.ts
│   │   ├── demo-instances.ts
│   │   ├── ripple-runs.ts
│   │   ├── evidence-cache.ts
│   │   └── usage.ts
│   ├── domain/
│   │   ├── schemas.ts
│   │   ├── types.ts
│   │   └── invariants.ts
│   ├── auth/require-access.ts
│   ├── demo-cookie.ts
│   ├── pdf/render-production-bible.tsx
│   ├── public-errors.ts
│   └── env.ts
├── fixtures/
│   ├── sample-screenplay.json
│   ├── baseline-plan.json
│   ├── approved-example.json
│   └── evidence-fallback.json
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   └── fixtures/
├── docs/hackathon-build/
├── middleware.ts
├── next.config.ts
├── package.json
├── LICENSE
└── README.md
```

## 13. Environment And IAM

### 13.1 Environment variables

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_ALLOWED_USER_IDS
DEMO_INSTANCE_COOKIE_SECRET

GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GOOGLE_GENAI_USE_VERTEXAI=true
GEMINI_MODEL

CLOUD_TASKS_LOCATION
CLOUD_TASKS_QUEUE
CLOUD_RUN_BASE_URL
TASK_INVOKER_SERVICE_ACCOUNT
TASK_OIDC_AUDIENCE

PARALLEL_API_KEY
DAILY_RIPPLE_CAP
RIPPLE_STALE_MS
GEMINI_STAGE_TIMEOUT_MS
PARALLEL_TIMEOUT_MS
EVIDENCE_CACHE_TTL_HOURS
```

Local `.env` files are ignored. Production secrets live in Secret Manager and are mounted/referenced by Cloud Run.

### 13.2 Google Cloud resources

Enable at minimum:

- Cloud Run API;
- Cloud Build API and Artifact Registry API;
- Cloud Tasks API;
- Firestore API;
- Vertex AI API;
- Secret Manager API.

Use one application service account with least-privilege roles for Vertex AI invocation, Firestore data access, Cloud Tasks enqueue, logs, and secret access. Use a dedicated task-invoker service account for the OIDC token and grant it Cloud Run Invoker. The internal route still verifies its email and audience in application code.

### 13.3 Deployment

Initial deployment uses:

```powershell
gcloud run deploy scriptops --source . --region <region> --allow-unauthenticated --timeout 600
```

The final command may add service account, min/max instances, CPU/memory, env, and secrets. Start with one minimum instance only if cold-start measurements harm the demo; otherwise keep scale-to-zero for cost. The Cloud Tasks queue and Cloud Run service should share a practical region, also compatible with the selected Vertex model and Firestore location.

## 14. UI Responsibilities

### 14.1 First viewport

- Real production title and screenplay identity.
- Scene 14 pre-selected with summary/excerpt.
- Five populated artifact cards with scene count, shoot days, budget band, location count, and casting-brief count.
- One-line guidance: `Type a change to this scene and watch it ripple through the whole plan.`
- Clear current plan version and evidence freshness.

### 14.2 Activity rail

- Exact order: Breakdown, Parallel Evidence, Schedule, Budget, Locations, Casting.
- States: pending, active, completed, failed.
- Real state only; no timer-driven fake progress.
- Amber/gold moves stage by stage; reduced-motion mode uses state/color/text without pulses.
- The Parallel stage shows live search/cached fallback status as soon as known.

### 14.3 Proposal review

- All five artifacts indicate proposed changes.
- Shared drawer shows before/after, reasons, assumptions, confidence, and evidence citations.
- Persistent statement that the baseline is unchanged until approval.
- Controls: Approve, Discard, Edit request and rerun.
- No manual individual artifact edits.

## 15. Failure And Recovery

| Condition | Required behavior |
|---|---|
| Empty/obviously irrelevant input | Reject before providers; preserve input; show a production-change example. |
| Breakdown semantic rejection | Mark `rejected`; preserve baseline and cycle allowance; accepted daily slot remains consumed. |
| Parallel timeout/error | Try matching Firestore cache, then bundled fallback; clearly label cached. |
| Parallel invalid/unsafe URLs | Drop invalid records; use cache if the minimum evidence set is not met. |
| Gemini stage timeout/invalid schema | Fail whole run; do not show an approvable partial proposal. |
| Cloud Tasks enqueue failure | Mark run failed and clear open run; no inline provider calls. |
| Worker crash/attempt exhaustion | Heartbeat becomes stale; run is safely failed/retryable; baseline unchanged. |
| SSE disconnect/refresh | Worker continues; browser polls/reconnects and reloads Firestore state. |
| Duplicate create/approve | Idempotency and conditional transactions return the existing result; no double spend/version increment. |
| Daily cap reached | Disable new runs; preserve project/evidence/PDF and disclosed approved example. |
| Firestore unavailable | Do not invoke Gemini/Parallel; show temporary service error. |
| PDF before approval | Disable action and return `409` if called directly. |

Public errors use stable codes plus helpful copy. Provider keys, stack traces, raw prompts, and raw responses are never returned to the browser.

## 16. Verification Strategy

### 16.1 Required automated checks

- fixture/schema validation;
- cookie/demo isolation and logout persistence logic;
- run transition legality;
- deterministic idempotency/run ID behavior;
- daily cap transaction behavior under concurrent starts;
- approval transaction rejects mismatched cycle/version/open run;
- duplicate approval does not double-increment;
- stage output gates reject missing artifacts/evidence IDs/invalid budgets;
- live-to-cache-to-fixture evidence fallback behavior;
- OIDC task identity verifier rejects wrong issuer/audience/email;
- PDF is blocked before approval and contains the approved record after approval.

### 16.2 Early deployed spikes

Perform these before full UI work:

1. Deploy a Next.js health route to Cloud Run.
2. Enqueue a Cloud Task, close the initiating client, and prove the worker persists a delayed completion to Firestore.
3. Run one server-side ADK/Gemini structured Breakdown call on Cloud Run.
4. Run one server-side Parallel Search call and persist URL/title/excerpt/timestamp.

If any spike fails, resolve or simplify the architecture before styling.

### 16.3 Golden-path assertions

For the prepared Scene 14 request, validate at minimum:

- breakdown adds night, rain, child performer, and stunt driving;
- evidence contains relevant current New Mexico sources and provenance;
- schedule changes night/day structure and includes lighting, stunt setup, and child-work constraints;
- budget band/delta rises with weather, lighting, night, stunt, and compliance drivers;
- locations are re-ranked for access, road control, rigging, weather, and stunt safety with citations;
- casting adds a child witness and stunt specialist/coordinator brief;
- all five changes are proposal-only before approval;
- one approval updates the version and all five artifacts;
- refresh preserves the result and PDF eligibility.

### 16.4 Manual end-to-end matrix

| Area | Local/mocked | Deployed/live |
|---|---|---|
| Baseline UI | responsive/keyboard/reduced motion | supplied login, first viewport, independent browsers |
| State | transition and transaction tests | refresh, logout/login, reset, duplicate clicks |
| Cloud Tasks | mocked enqueue/identity | close browser after `202`, observe completion |
| Gemini/ADK | contract fixtures | real golden run on Vertex AI |
| Parallel | normalized fixtures/cache tests | real Search call, citations, forced fallback |
| Proposal | schema/invariant tests | five complete impacts, no baseline mutation before approval |
| Approval | concurrency tests | double-click approval and version check |
| Export | PDF text/page assertions | downloaded two-page visual inspection |
| Deployment | lint/typecheck/test/build | Cloud Run golden-path smoke and public repo review |

## 17. Risks And Mitigations

### Risk 1: Platform setup consumes the build window

Mitigation: provision and prove Cloud Run → Cloud Tasks → Firestore as the first vertical slice. Use source deploy and one service. Do not add Terraform for the hackathon.

### Risk 2: ADK TypeScript or candidate model friction

Mitigation: run a tiny deployed structured-output spike and pin the working versions/model. Keep workflow contracts independent of ADK-specific types.

### Risk 3: Parallel evidence is weak or too broad

Mitigation: generate focused objectives from Breakdown, favor authoritative domains in queries, bound result count, validate excerpts, and tune the golden query set. Store a disclosed fallback only for reliability.

### Risk 4: Long workflow exceeds deadlines

Mitigation: provider-level abort timeouts, concurrent final specialists, bounded evidence queries, measured p95, Cloud Run/Tasks timeouts with margin, and visible progress. Do not guess a 90-second limit.

### Risk 5: Duplicate/late workers corrupt state

Mitigation: deterministic run IDs, transactional claims, execution tokens, conditional stage/final writes, and version/cycle checks on approval.

### Risk 6: Shared Clerk credentials collide

Mitigation: all mutable state keys on the long-lived browser cookie. Test two browsers using the same Clerk account.

### Risk 7: Scope exceeds 18–24 hours

Mitigation: build the deployed golden path in vertical slices. Cut PDF upload first, then motion/drawer polish. Never cut Parallel runtime use, all-five validation, human approval, atomic commit, source disclosure, or deployed verification.

## 18. Definition Of Technical Done

- Public Cloud Run URL works with supplied credentials.
- Same-browser logout/login retains the demo instance; another browser receives a clean one.
- `POST /api/ripples` returns `202`, and Cloud Tasks completes after the browser closes.
- Activity rail reflects six real persisted stages.
- A successful live run invokes Gemini/ADK and Parallel Search at runtime.
- Parallel evidence displays citations, excerpts, retrieval time, and live/cache status.
- Golden revision produces meaningful changes in all five artifacts.
- No proposal changes the baseline before approval.
- Approval is one conditional Firestore transaction and duplicate approval is harmless.
- Failed required stages never expose a partial approved plan.
- Refresh and SSE failure recover from persisted state without rerun.
- Reset, one-ripple-per-cycle, idempotency, and daily cap work.
- Two-page PDF downloads only after real approval (or is explicitly labeled as the bundled cap-reached example).
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Public repository includes README, architecture/run instructions, `.env.example`, screenshots, and an OSI-approved license.

## 19. Demo And Submission Evidence

### Three-minute demo

1. Login and populated baseline (15–20 seconds).
2. Prepared Scene 14 revision (10 seconds).
3. Six-stage real rail, with Parallel Evidence called out (30–45 seconds).
4. Open one live citation and state which outputs consume it (20 seconds).
5. Review five proposed impacts and unchanged baseline (40 seconds).
6. Approve and show new version/all-five update (20 seconds).
7. Download PDF (15 seconds).
8. Show architecture/repository and state failure-isolation guarantee (20 seconds).

### Submission proof checklist

- Public Cloud Run deployment URL.
- Public GitHub repository with OSI-approved license.
- README setup and testing instructions.
- Built-with list: Google Cloud Run, Cloud Tasks, Firestore, Vertex AI Gemini, Google ADK, Parallel Search, Next.js, TypeScript, Clerk.
- Architecture diagram showing the runtime Parallel call and Google Cloud path.
- Screenshot/video frame with Parallel Evidence active and cited output visible.
- Concise AI-usage and Codex-development disclosure.
- Demo video no longer than the hackathon's stated limit and publicly viewable.

## 20. Official Technical References

- [Parallel Search quickstart](https://docs.parallel.ai/search/search-quickstart)
- [Parallel Search API reference](https://docs.parallel.ai/api-reference/search/search)
- [Google ADK workflow agents](https://google.github.io/adk-docs/agents/workflow-agents/)
- [Google ADK TypeScript repository](https://github.com/google/adk-js)
- [Deploy Next.js to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/frameworks/deploy-nextjs-service)
- [Cloud Tasks HTTP targets](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Cloud Tasks overview and deadlines](https://docs.cloud.google.com/tasks/docs/dual-overview)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Vertex AI Gemini documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models)

## 21. Build Checklist Handoff

The implementation plan must prioritize uncertainty and vertical proof:

1. deploy the smallest Next.js service and provision Google Cloud resources;
2. prove detached Cloud Tasks execution and Firestore persistence;
3. prove one structured Gemini/ADK call and one live Parallel Search call;
4. lock schemas, fixtures, state machine, and isolation;
5. build the baseline dashboard and real activity transport;
6. connect the full evidence-aware agent graph;
7. add proposal review and atomic approval;
8. add PDF, failure drills, visual polish, and final submission evidence;
9. treat PDF upload as P1 and the first cut.
