# PH09 initial-generation verification

2026-09-07: local implementation and subsequently authorized live verification. Three small scripts produced contract-valid drafts after provider fixes and bounded retries. Quality findings keep PH09 unchecked; see [live planning review](live-planning-review.md). Deployment remains pending.

## Implemented behavior

Accepted uploaded source spans feed batches of at most five scenes. A shared normalization stage reconciles cast IDs and story locations, preserving non-cast requirements. Fixed research templates request only production topics for the supported `US / US-NM / USD / pilot-v1` profile. Scene text, dialogue, titles, names, and assumptions never enter Parallel queries. Research must cover the required topics, use HTTP(S) URLs, and be at most 24 hours old; there is no sample fallback or cross-project cache. Mechanical topic matching is not evidence of human-assessed relevance.

Schedule, budget, locations and casting are separately validated checkpoints. Unknown citations, missing source/scene/role references, zero-budget placeholders and violated hard constraints block publication. All five artifacts are assembled into one size-checked, immutable manifest only after successful validation. A `proposal-ready` job retains the project lock; the approved pointer stays empty. PH10 will add draft reads/review, supersession/discard, and atomic approval.

One Cloud Task executes one stage. Checkpoint publication and the next dispatch-outbox entry share a Firestore transaction. Project lifecycle, write epoch, accepted revision, planning-input version, active job and lease token fence writes. Reconciliation recovers expired leases and dispatched-but-undelivered queued jobs using a new task-name generation. A paginated registry avoids scanning only the same first projects. Completed stages persist through bounded retries. Starting a new job after terminal failure does not reuse another job's checkpoints.

The transport uses the installed `@google/genai` SDK directly behind a typed provider interface, matching the existing Vertex diagnostic adapter. This amends technical §5's planned ADK-in-step transport: Firestore, rather than an in-memory ADK session, remains the durable state authority. SDK retries are disabled; application stage attempts are recorded before provider calls. API usage follows the installed types and [Google's configuration reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), with research calls based on [Parallel Search](https://docs.parallel.ai/api-reference/search/search).

## Provisional bounds

| Control | Local implementation |
| --- | --- |
| Breakdown batch | 5 scenes; 200 accepted scenes remains the schema ceiling |
| Prompt | 180,000 UTF-8 bytes of task data; total instruction/schema/data envelope capped at 220,000 bytes |
| Model output | 16,384 maximum output tokens; Gemini 3 uses LOW thinking, earlier models request budget 1,024; pricing reserves a conservative 18,432 output-token envelope |
| Provider timeout | Gemini 45 s; Parallel 35 s; SDK retries disabled |
| Lease / job deadline | 90 s / 60 min |
| Attempts / budget | 3 attempts per stage; 25 US cents reserved per attempt, including ambiguous calls; $15 per job |
| Daily reserved ceilings | $100 global; $30 per owner; $30 per project (UTC day) |
| Intake | 20 initial-generation jobs over a project's lifetime |
| Persistence | Each stored checkpoint, snapshot and complete manifest at most 700 KiB |
| Recovery | Existing five-minute scheduler; queued dispatch is eligible for a new generation after five minutes without worker progress |

Costs are estimates using explicitly configured price ceilings, not provider invoices. Uncertain/failed attempts keep their full reservation. Measured token counts and estimated costs are recorded for successful calls. Enabling planning requires positive values for `PLANNING_INPUT_USD_PER_MILLION`, `PLANNING_OUTPUT_USD_PER_MILLION`, and `PLANNING_SEARCH_USD_PER_REQUEST`. Values must cover the selected model's actual tier, reasoning charges, and Parallel basic-search contract; an envelope above 25 cents is rejected. No current market price is silently assumed. `PROJECT_PLANNING_ENABLED` defaults to disabled.

## Local commands

```powershell
npm run verify:post-hackathon:planning
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8086'
npm run verify:post-hackathon:planning:firestore
Remove-Item Env:FIRESTORE_EMULATOR_HOST
npm run lint
npm run typecheck
npm test
npm run build
```

The planning harness parses three original CC0 synthetic FDX scripts: unpeopled desert, two-person clock workshop, and community rehearsal. Local mode uses deterministic fake providers and prints `mode: fake`; its token/latency values are test data and do not establish provider capacity or quality. Separate tests cover a 200-scene fake plan, legitimate empty cast, infeasible constraints, source loss, missing/stale evidence, foreign citations, retries, and stale-token rejection. Firestore tests use a unique `demo-ph09-*` emulator project on loopback, with exact test-project/outbox/usage cleanup.

## Live verification and remaining gate

Only after the user authorizes a paid run, explicitly set `PH09_PROVIDER_TESTS=true` in the test process along with `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI=true`, `GEMINI_MODEL`, `PARALLEL_API_KEY`, and the verified pricing ceilings, then run the planning harness. Vitest does not automatically load `.env.local`. Live tests have no SDK/application retries, accept at most 60 stages/$15 reserved per script, and use only the synthetic corpus. They write model/version/usage/draft/research reports under `docs/post-hackathon/evidence/` for producer review. The initial pass made no paid calls; the subsequently authorized live results are recorded in `live-planning-review.md`.

Before PH09 completion, review these reports for source faithfulness, actual role/location normalization, realistic schedule and budget, evidence relevance, and clearly stated uncertainty. Add/measure a feature-length and near-limit provider case; the local 200-scene fake test does not establish that the whole-project normalization fits the real model's output budget. Validate Gemini JSON-schema/thinking support for the selected model, actual timeout/token/cost envelopes, and Cloud Run stage delivery/recovery after closing the browser. Exercise the generation button, reload/polling, and terminal failure states in an authenticated browser. No deployment or pilot enablement was performed in this pass.
