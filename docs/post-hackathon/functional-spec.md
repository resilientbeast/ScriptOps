# Post-hackathon functional specification

Status: build specification v1, 2026-09-06. Implementation and feasibility gates remain open.
Companions: [roadmap](plan.md), [technical design](technical-design.md), [build checklist](build-checklist.md).

## Product outcome and scope

An invited producer creates private production projects, uploads a screenplay, corrects and accepts its scene breakdown, generates and approves Plan v1, then uses repeated Revision Ripples to maintain an approved production plan.

**Projects → New Project → Upload → Review scenes → Generate → Approve Plan v1 → Ripple → Approve Plan v2 → Continue.**

The milestone includes individual ownership, text-based PDF and Final Draft `.fdx`, source-traceable scene review, all five planning artifacts, durable progress/retry, version history, and approved-plan export. It preserves the separately labeled sample demo.

Excluded: team sharing, billing, public signup, legacy `.fdr`, OCR/scanned PDFs, non-English parsing, screenplay replacement after Plan v1, full screenplay authoring, partial artifact approval, and advanced scheduling optimization. Ripple edits update the production interpretation of a scene; they do not rewrite the original uploaded file.

Working pilot defaults are English, USD, and New Mexico as the first supported shooting region. Projects may record another region/currency, but generation remains unavailable until that combination has a validated research/planning profile. This is a deliberate initial coverage limit, displayed in the UI; schema and prompts must not hard-code it. User-provided scripts must work independently of the sample story.

Proposed input targets are 20 MB, 150 PDF pages, and 200 scenes. The feasibility gate must validate or explicitly revise these before they become advertised limits. FDX uses actual source paragraph positions, with a separately measured text/block limit; it must not receive invented page numbers.

## User-visible requirements

| ID | Functionality | Acceptance |
| --- | --- | --- |
| F01 | **Projects.** List, create, rename, switch, archive, restore, and delete owned projects. Show title, workflow state, approved version, and updated time. | Two projects retain independent files, inputs, proposals, history, and plans across browsers. Another user cannot discover or access their contents. |
| F02 | **Project setup.** Required title (1–200 characters), shooting country/region, and currency. Optional assumptions, budget ceiling, shoot-date window, and daily-hour target. Display planning defaults before generation. | Missing/invalid inputs block generation with field-level guidance. Story location is distinguished from shooting region. Unsupported coverage is explained without substituting a different region. |
| F03 | **Upload.** Select PDF/FDX, see size/type limits and upload progress, then durable processing status. Show processing-provider disclosure before upload. | Refresh after upload acceptance restores processing state. Unsupported, encrypted, empty, malformed, or oversized input produces actionable feedback. A client upload percentage alone never means the file is accepted. |
| F04 | **Scene review.** Ordered scenes with original label/heading, source preview, and parse warnings. Correct labels/headings, split/merge scenes, and restore excluded source blocks. | `12A`, unnumbered scenes, repeated headings, and uncertain boundaries are preserved. No source content disappears without a recorded exclusion. Changes survive reload. |
| F05 | **Accept scenes.** Show scene count, coverage, and unresolved warnings; accept a reviewed revision explicitly. | Structural errors such as missing text, overlapping assignments, or zero scenes block acceptance. Ambiguity warnings may be acknowledged. The accepted revision is immutable. |
| F06 | **Generate initial plan.** Start only from accepted scenes and supported, complete planning inputs. Show actual persisted stages and relevant failures. | Generation produces a complete draft of breakdown, schedule, budget, locations, and casting. Closing the browser does not stop accepted work. Empty casting is allowed when the script needs no performers. |
| F07 | **Review and approve Plan v1.** Inspect all artifacts, assumptions, source citations, evidence age, warnings, and estimate uncertainty; approve all, discard, or edit inputs and regenerate. | No plan is approved automatically. Initial review has no fabricated before/after comparison. Duplicate approval creates exactly one approved version. An old draft cannot be approved after its inputs change. |
| F08 | **Repeated ripples.** Select a scene from the current approved plan, describe a production change, review five artifact impacts, then approve/discard. | Plan v1 can advance to v2 and v3 without resetting the project. Only a complete, current proposal is approvable. New proposals and failures leave the approved plan unchanged. |
| F09 | **History and export.** List approved versions with approval time, cause, and predecessor; view/export any retained approved version. | Export works immediately after Plan v1 approval and after ripples. Export identifies project, version, initial-generation or revision provenance, and evidence. Long productions paginate legibly. |
| F10 | **Recovery and limits.** Restore progress on reload, provide retry for recoverable failures, show quota exhaustion, and keep approved plans readable. | Retry creates no duplicate published output/version. Queued/running/failed are visibly distinct. Quota exhaustion prevents new expensive work, not reading or exporting approved work. |
| F11 | **Archive and delete.** Archive makes a project read-only; restore re-enables it. Delete requires an explicit confirmation naming the project and displays deletion progress. | Archive is blocked during active work or an open proposal until it finishes/is discarded. Delete revokes access immediately, supersedes work, and removes project data through a tracked cleanup job. |

## Workspace states and permitted actions

Lifecycle (`active`, `archived`, `deleting`) is separate from the workflow state below. The UI derives workflow state from persisted records rather than maintaining a competing state machine.

| State | Primary action | Other permitted actions |
| --- | --- | --- |
| Empty | Upload screenplay | Edit setup, archive, delete. |
| Uploading / parsing | Observe progress | Resume incomplete transfer or retry failed processing; delete. |
| Scene review | Correct and accept scenes | Preview source, edit setup; archive when no job is active. |
| Ready to plan | Generate initial plan | Reopen scene review or edit setup. |
| Generating | Observe stages | Read inputs; delete. Input editing is temporarily locked. |
| Initial draft ready | Review and approve | Discard; edit inputs/scenes, which supersedes the draft. |
| Active production | Request ripple | View/export approved versions; archive when idle. |
| Ripple running / ready | Observe / review | Read approved baseline; approve/discard when ready. |

Only one upload/parse/generation/ripple operation or open plan proposal is allowed per project at a time in the pilot. Different projects can progress independently subject to account/global quotas. Retrying a failed job reacquires the project lock.

Before Plan v1, reopening accepted scenes creates a new editable revision; accepting it replaces the selected revision. Replacing an upload is available only when idle and before Plan v1; the old upload remains traceable until deletion. After Plan v1, source and planning inputs are frozen for this milestone; project title may still change. Material production changes use scene ripples. Broader setup changes require a future full replan feature.

## Plan-quality rules

- Every accepted scene appears in the production breakdown and schedule; all role, location, and evidence references resolve. Source facts remain distinguishable from generated assumptions.
- Baseline schedule uses one allocation per scene unless the feasibility gate requires multi-day allocations. If the supported model cannot represent a script's constraints, generation reports the limitation rather than presenting a misleading valid plan.
- Budget is an explicitly approximate band in the selected supported currency, derived from schedule and declared assumptions. An initial plan has no revision delta.
- Evidence questions arise from the actual script and shooting region. Only relevant, attributable evidence supports recommendations. Cached results retain retrieval time and disclosure; sample evidence is never a real-project fallback.
- Hard planning constraints must be satisfied or generation returns a clear infeasibility result. Qualitative estimates and uncertain interpretation require warnings; they do not become confirmed permits, availability, prices, or safety approvals.
- Initial approval covers all five artifacts. Ripple approval covers the complete proposed successor. Neither supports individual artifact patching.

## Failure and privacy behavior

| Condition | Required response |
| --- | --- |
| Expired/incomplete upload | Resume when possible or restart upload; retain the empty project; do not enqueue an invalid file. |
| Mixed scanned/text PDF or poor extraction | Flag unreadable pages; block acceptance until a usable export is uploaded. No silent partial success. |
| Ambiguous heading | Preserve text and show a correctable warning. |
| Missing evidence/provider failure | Use only a relevant allowed cache or fail recoverably; never install a partial plan. |
| Stale draft/concurrent approval | Explain that inputs/version changed; retain the current approved baseline. |
| Lost progress stream | Poll persisted state and reconnect without starting another run. |
| Unauthorized project/file/job | Return a generic unavailable result without identifying its owner or contents. |

Uploads and source previews are private. Gemini/Vertex receives necessary screenplay content for analysis; Parallel receives sanitized production research questions, not screenplay text or confidential identifiers. Raw scripts, upload credentials, and model reasoning are excluded from logs. Keep project data until explicit deletion; target removal from application storage within 24 hours, with actual backup/soft-delete retention documented before pilot release. Do not promise immediate erasure from provider backups.

## Release acceptance

Complete the flow for at least three distinct licensed/synthetic scripts, covering both formats, one feature-length near-limit input, ambiguous boundaries, and a production unlike the sample. Record human review of planning usefulness alongside deterministic validation.

Release requires two-user isolation, two-project independence, Plan v1 → v2 → v3, browser-close survival, meaningful recovery, approved-version export, deletion verification, and a passing sample-demo regression. See [checklist](build-checklist.md) for executable gates. No feasibility test is marked complete by this specification.
