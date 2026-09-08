# PH01 ingestion feasibility record

Status: local spike in progress, 2026-09-06. This is not a statement that production uploads are supported.

## Candidate decision

| Format | Adapter | Version | Input handling | Current decision |
| --- | --- | --- | --- | --- |
| Final Draft `.fdx` | `fast-xml-parser` | `5.11.1` | UTF-8 only; reject any DTD/entity declaration before parsing; preserve paragraph order and attributes. | Local candidate accepted pending Cloud Run measurement. |
| Text-based PDF | `pdf-parse` | `2.4.5` | Verify `%PDF-` signature; disable JavaScript evaluation and WebAssembly; fail on parser errors; retain page/line source spans. | Local candidate accepted pending Cloud Run measurement. |

`pdf-parse` supports the repository's Node 22 runtime and exposes per-page text. FDX source locations are paragraph positions, so FDX does not fabricate PDF page counts. Both choices are pinned in `package.json`.

## Local corpus and measured result

The synthetic corpus is documented in [`tests/fixtures/screenplays`](../../tests/fixtures/screenplays/README.md). The executable harness is `npm run verify:post-hackathon:ingestion`; it prints only format/count/timing/memory metrics, never screenplay text.

| Case | Expected behavior | Local result |
| --- | --- | --- |
| Valid FDX with `12A`, unnumbered heading, and pre-scene text | Two scenes, ordered paragraph spans, two review warnings. | Passed: 7 blocks, 2 scenes, 2 warnings, 12 ms, 86.7 MB RSS. |
| FDX DTD/entity declaration | Reject before XML parsing. | Passed: `FDX_DTD_FORBIDDEN`, 1 ms. |
| Malformed FDX XML | Reject before scene extraction. | Passed: `FDX_INVALID_XML`, 1 ms. |
| Two-page text PDF | Two scenes with page/line spans. | Passed: 5 blocks, 2 scenes, 2 pages, 130 ms, 98.5 MB RSS. |
| Non-PDF bytes | Reject before PDF extraction. | Passed: `PDF_SIGNATURE_INVALID`, 1 ms. |
| PDF without extractable text | Reject as unreadable. | Passed: `PDF_UNREADABLE`, 3 ms. |
| Mixed text and scan-like PDF pages | Preserve readable scenes and flag textless pages for review. | Passed: 1 readable scene and `PAGE_TEXT_MISSING`, 5 ms. |
| 200/201-scene FDX | Accept the proposed limit; reject the next scene. | Passed: 200 accepted / 201 rejected, 23 ms, 100.0 MB RSS. |
| 150/151-page text PDF | Accept the proposed limit; reject the next page. | Passed: 150 accepted / 151 rejected, 167 ms, 120.4 MB RSS. |

## Limits and remaining gates

The 20 MB, 150-page, and 200-scene values remain proposed guardrails. The local code enforces them for this spike but they are not published product limits. Before PH01 can be marked complete, measure valid and rejection cases in the intended Cloud Run configuration, add feature-length/near-limit, mixed scan/text, encrypted, malformed XML/PDF, duplicate-heading, intercut, and repeated-heading corpus fixtures, then record elapsed time and peak memory.

The local parser contract is sufficient to begin PH02 schemas and later worker implementation. The sandbox shell did not expose the configured Google Cloud SDK on `PATH`; the SDK is installed at `C:\\Users\\arkad\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd`, and its active project is `scriptops-agentic-arkad`. The protected synthetic-input Cloud Run smoke is implemented and production-built, but its live deployment is deferred. Do not ship the parser in the interactive Cloud Run path until the PH06 deployment measurement shows it has safe memory/latency headroom. If it does not, PH06 must run parser steps in a separate bounded worker service. Final size/page/scene limits, worker deadline, and parser isolation decision are G1/G2 release outputs.
