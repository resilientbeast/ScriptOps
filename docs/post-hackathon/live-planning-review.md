# PH09 live planning review — 2026-09-07

Result: all three small synthetic scripts eventually produced complete, contract-valid drafts. The production-quality gate is **not passed**. No deployment, pilot enablement, live Firestore project write, or approved baseline was created.

The user authorized paid Gemini/Parallel verification after the earlier local-only pass. Tests used the existing Cloud project `scriptops-agentic-arkad`, application-default credentials, and Parallel key. Credentials were loaded into the process, never written to reports. Configuration matched the deployed app: `gemini-3.7-flash` on `global`.

## Successful runs

| Script | Scenes / cast | Elapsed | Input + output tokens | Estimated cost |
| --- | --- | --- | --- | --- |
| [Empty desert](evidence/planning-empty-desert-309fa4bb-1123-451c-84fb-1a8361a50ebe.json) | 2 / 0 | 28.528 s | 35,297 | $0.04855 |
| [Clock workshop](evidence/planning-clock-workshop-0249d0a6-4128-4040-b21d-f57f697ff2e1.json) | 2 / 2 | 30.423 s | 37,506 | $0.05001 |
| [Community rehearsal](evidence/planning-community-rehearsal-003c917b-988f-4eb5-984d-fd1cc5ea5e09.json) | 3 / 2 | 31.184 s | 39,891 | $0.05333 |

Successful runs total approximately $0.1519. Including metered successful stages from failed attempts, recorded estimates total approximately **$0.1999**. This is not an invoice or a complete bill: the first citation-rejected budget response did not preserve usage, and error responses supplied no usable usage counts. The harness now captures usage/output when a provider succeeds but application validation fails. All attempts stayed within the $15-per-script allowance; counting every attempted stage including free assembly gives a conservative total reservation of $9.50 across the three scripts.

Estimates use $0.75 per million input tokens and $3.75 per million output/reasoning tokens from Google's global standard rate, not batch pricing. [Google pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?authuser=3). Parallel reserves $0.015 per search, covering the default $0.005 plus up to ten additional results at $0.001 each for the configured 20-result maximum. [Parallel pricing](https://docs.parallel.ai/getting-started/pricing). These were process-only settings, not changes to `.env.local` or Cloud Run.

## Provider defects found and fixed

1. The adapter used a thinking budget and temperature unsupported by the deployed Gemini 3.7 configuration. Gemini 3 now uses `ThinkingLevel.LOW` without temperature. [Google migration guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-7-flash?authuser=7).
2. Four initial requests returned HTTP 400 at the structured-output boundary. Removing costly bounded-array grammar constraints from the transport schema allowed generation to succeed. Required structure, enums and nullable types remain; textual guidance carries numeric/length limits. Strict Zod and reference/constraint checks remain authoritative before checkpointing. [Google structured-output guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output?authuser=0).
3. Clock-workshop encountered two HTTP 429 responses across attempts. SDK retries stayed disabled; manual retries were bounded and failed reports were retained.
4. A clock-workshop budget was rejected by `INITIAL_PLAN_CITATION_INVALID`, preventing a complete draft. Provider citation fields now enumerate only current research IDs. The final workshop run passed with this restriction. The other two reports predate this additional restriction but already passed application citation checks.

Generation version is now `initial-v3`. New tests cover transport schema simplification, retaining strict application validation, supported thinking settings and restricting citation IDs. Failure reports suppress SDK request objects and authorization headers.

## Post-hardening live recheck

The explicit three-script recheck started on 2026-09-07 using the same bounded harness. Vertex returned HTTP 429 without an application retry: empty desert reached the budget stage, community rehearsal reached normalization, and clock workshop was limited before breakdown. The three sanitized reports are retained in [evidence](evidence/). No complete post-hardening draft was produced, so this attempt does not pass the quality gate.

The partial outputs did confirm exact source quotes survive breakdown and normalization. They also showed generic tax-incentive pages still entering the cost topic through broad payroll/labor wording, and a compliance note describing an insurance threshold as a “standard” requirement. The research policy now requires direct wage/rate/agreement evidence for cost records, and compliance notes must be verification actions without standard, mandatory, legal, or regulatory assertions. This contract change increments the generation version to `initial-v3`.

## Draft review findings

This is an agent review, **not producer sign-off**.

- **Coverage and normalization:** all scene IDs, headings, alphanumeric labels and source references survive. The desert draft has no cast. Both two-person scripts retain two shared role IDs. Community rehearsal normalizes `HALL` to `COMMUNITY HALL`. Every scene is scheduled once, within the ten-hour target.
- **Source facts versus assumptions — needs correction:** workshop invents “dialogue scenes” and “speaking adult cast” although no dialogue appears in the action. Community casting calls adult ages assumptions despite the source explicitly describing adults. Later specialists need preserved fact provenance and clear labels for unsupported assumptions.
- **Labor/compliance claims — needs correction:** rehearsal converts a ten-hour producer target into “standard 10-hour daily turnaround limits.” Several outputs present jurisdiction-dependent insurance requirements as universal New Mexico standards. A planning target must not become a legal/labor rule; researched requirements need applicable context and uncertainty.
- **Cost evidence — needs correction:** crew/fringe drivers cite broad tax-incentive material, including illustrative third-party summaries, rather than applicable crew rate sources. Permit evidence is relevant but does not establish wages. “Rates” in tax-credit pages currently satisfies the broad cost-topic matcher. Require narrower research and claim-specific support.
- **Budget explainability — needs improvement:** one-day bands are $4,500–$12,000 (desert), $8,500–$18,500 (workshop), and $6,500–$16,000 (rehearsal). There are insufficient explicit quantities/rates to reconcile the totals. These are not independently verified production estimates.
- **Research hygiene — needs improvement:** identical Film Office pages appear under root and `/whynewmexico/` aliases; some excerpts contain mostly navigation. Deduplicate canonical sources and filter irrelevant excerpts before specialist prompts.
- **Locations:** recommended types/regions generally fit the scripts and disclose access uncertainty. They are broad candidate areas/spaces, not verified available properties. One-day schedules depend on assumed co-location that needs producer review.

## Remaining gates

Keep PH09 unchecked and `PROJECT_PLANNING_ENABLED` disabled while addressing source-fact propagation, claim-specific cost evidence, unsupported compliance statements and explainable budgets. This PH09 quality work should precede treating PH10 approval as release-ready.

Tiny synthetic FDX inputs do not establish feature-length/near-limit capacity, complex minor/stunt handling, live hard-constraint behavior, deployed checkpoint recovery or authenticated browser operation. Existing emulator checks remain separate evidence for transaction semantics.

## PH09 completion capture

The paced `initial-v5` / `project-research-v3` capture completed all three synthetic scripts after the contract refinements: [empty desert](evidence/planning-empty-desert-15fae082-a53f-45dc-b457-fdcd674cfcb9.json), [community rehearsal](evidence/planning-community-rehearsal-815622dd-db01-49a4-910e-ac02d9f76df6.json), and [clock workshop](evidence/planning-clock-workshop-b38ee870-fbd9-40ec-8ee2-e24f040661bd.json). Each draft preserves exact source quotes, schedules each scene once, uses cautious schedule/location verification language, and has a reconciled budget whose citations are restricted to New Mexico Film Office or New Mexico government cost records. Pacing was test-only, at ten seconds between provider calls; no application retry was added.

The synthetic provider quality gate is passed. Keep `PROJECT_PLANNING_ENABLED` disabled until the separate PH09 deployment/recovery and authenticated-browser checks are complete; those release checks do not invalidate the completed planning contract and provider-quality work.

Post-fix checks passed: `npm test` (136 passed, 12 opt-in/emulator skips), repository-wide lint, focused planning tests, TypeScript, Webpack production build and `git diff --check`. Live success was achieved across bounded targeted runs, not one uninterrupted three-case run.
