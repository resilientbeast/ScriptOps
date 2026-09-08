# Private-pilot release evidence

Status: PH14 evidence matrix started on 2026-09-07. This document records observed proof and open gates; it is not an authorization to enable a wider pilot.

## Current deployment

| Item | Evidence |
| --- | --- |
| Service | Cloud Run `scriptops`, project `scriptops-agentic-arkad`, `us-central1` |
| Production revision | `scriptops-00051-j5q`, Ready, 100% traffic |
| Public health | `GET /api/health` returned HTTP 200 with `{"service":"scriptops","status":"healthy"}` after PH13 deployment |
| Planning flag | `PROJECT_PLANNING_ENABLED=true` by prior explicit production decision |
| Upload boundary | Private bucket configured through `PROJECT_UPLOAD_BUCKET`; signed browser writes expire after 900 seconds |
| Durable work | Cloud Tasks project queue and OIDC worker are deployed; maintenance runs reconciliation and cleanup |

## Verification matrix

| Requirement | Current evidence | Status |
| --- | --- | --- |
| PDF and FDX upload through review | Prior authenticated production workflow covered both formats through persisted review-ready state | Partial: rerun against current revision |
| Initial plan and Plan v1 | Prior production project generated and approved Plan v1 | Partial: current-revision retry and quality review required |
| Ripple v1 → v3, history, export | Unit coverage and PH11/PH12 local rendering; anonymous export returned 401 | Open authenticated current-revision check |
| Two users and two projects | Local/emulator ownership tests | Open deployed check |
| Refresh, retries, worker recovery | Local/emulator contracts and prior queue deployment | Open deployed recovery drill |
| Archive and restore | Local repository/UI coverage | Open authenticated current-revision check |
| Deletion during upload, worker, and proposal | Local epoch fencing and deployed PH13 rollout health | Open authenticated destructive-flow check |
| Private boundary | Deployed smoke asserts signed-out project/deletion APIs return 401 and workspace redirects to sign-in | Ready to run against the explicit production URL |
| Narrow-screen and keyboard flow | Not recorded | Open |
| Human plan quality | PH09 synthetic paid checks were rate-limited before full plans | Open |

## Controls and operations

| Control | Current setting / evidence | Limitation |
| --- | --- | --- |
| Planning spend | Three attempts per stage; 90-second lease; one-hour deadline; 25 cents reserved per attempt; $15/job; $30/day per owner/project; $100/day global | Provider capacity and real quality are still a pilot gate |
| Upload staging | 15-minute signed URL and maintenance cleanup | Issued URLs cannot be revoked; PH13 re-sweeps deleted project prefixes during a seven-day tombstone fence |
| Deletion target | Application cleanup removes live Firestore records and object generations; the confirmed empty-project run completed in about 20 seconds | Cloud Storage soft-deleted generations remain for seven days; application cleanup is not a backup-retention guarantee |
| Rollback | Disable new intake/worker claims while retaining compatible reads and approved exports; never point an older binary at an incompatible schema | A live rollback drill remains open |
| Alerts/metrics | Cloud Run health and Cloud Tasks delivery are available operational signals | Alert thresholds and a recorded on-call response are open |

## Required pilot gate

Run the authenticated matrix with two allow-listed accounts and uniquely named current-production projects. Use a disposable project for each deletion race. Verify the exact created records and object prefix before removal, then verify their absence afterward; do not run a broad collection or bucket cleanup. Record the revision, timestamps, user-visible outcomes, worker recovery, and any provider cost/quality observations here before enabling the allow-listed pilot.

## 2026-09-07 deployed boundary smoke

`E2E_BASE_URL=https://scriptops-5sinbwmqzq-uc.a.run.app npm run verify:post-hackathon:e2e` passed all four assertions against revision `scriptops-00051-j5q`:

- `GET /api/health` returned the expected healthy response.
- Signed-out `GET /api/projects` and `GET /api/project-deletions/{guessed-id}` returned HTTP 401.
- Signed-out `/projects` redirected to `/sign-in`.
- An anonymous `DELETE /api/projects/{guessed-id}` returned HTTP 401 before it could create a deletion job.

This is perimeter evidence only. It does not authenticate, create a project, invoke providers, or delete any production data.

## 2026-09-07 authenticated PH14 progress

- The allow-listed Judge session reached real `/projects`, showing the existing PH08 and PH07 production workspaces. The demo was not used as evidence.
- On `PH08 verification screenplay`, Plan v1 history and its owner-scoped approved-PDF link were visible. The browser automation download client blocked the file endpoint before dispatch, so this is UI-link evidence only; the separate anonymous 401 check remains the server-side export proof.
- Archive changed the live project to `archived` and exposed only Restore; Restore returned it to `active` with the approved baseline retained.
- A real Plan v2 ripple proposal completed and showed a two-day schedule, +$1,265–$1,629 budget delta, three location candidates, and 29 retained evidence records. Explicit approval installed Plan v2. A Plan v3 verification job subsequently exhausted all three attempts (75 cents reserved) and ended `RIPPLE_GENERATION_FAILED`; no v3 was published and Plan v2 remains current. The worker had no safe diagnostic log for the provider failure, so PH14 stopped at this broken observability boundary pending a sanitized structured-error update and one bounded retry.

## 2026-09-07 authenticated continuation

- Revision `scriptops-00052-8hh` added only redacted provider-failure metadata (`name`, numeric/string code, and HTTP status where present) to the ripple worker logs. It is Ready at 100% traffic and `/api/health` returned HTTP 200.
- A new bounded v3 proposal completed on its first attempt after the deployment. Review showed two shoot days, a +$1,315–$1,729 budget delta, three location candidates, and 29 retained evidence records. Explicit approval installed immutable Plan v3.
- History now lists Plan v1 (initial), Plan v2 (ripple), and Plan v3 (ripple), each with its own owner-scoped PDF endpoint. The browser automation client blocks direct download endpoints, so authenticated download-file handling remains a client limitation rather than a failed application response.
- The existing PDF verification project reloaded into its persisted `Screenplay parsed` / `Review ph07-verification.pdf` state, confirming the PDF workflow survives a browser reload.

The only remaining lifecycle verification action is deletion of a disposable project while upload, work, or proposal state is present. It has not been run because deletion is irreversible and needs a just-in-time confirmation.

## 2026-09-08 confirmed disposable deletion

The user explicitly confirmed deletion of disposable project `bd23b18c-f8e6-4c5f-ba24-5ad4aef94abd`, titled `PH14 disposable deletion verification 2026-09-08`. Revision `scriptops-00053-4z2` replaced the browser-native prompt with an accessible inline exact-title confirmation form; it is Ready at 100% traffic and healthy.

The live project moved to `deleting` immediately. After the cleanup worker completed, its workspace returned 404. A direct, scoped production verification found:

- no `projects/{projectId}` document or nested collections;
- no matching upload sessions, planning outbox entries, planning-active entries, or ripple-active entries;
- zero Cloud Storage object generations under only `projects/{projectId}/`;
- a `projectTombstones/{projectId}` record with `status: complete`, `writeEpoch: 1`, and no content fields beyond the minimal tombstone schema.

This proves confirmed empty-project cleanup and tombstone fencing on the deployed revision. It does not yet prove deletion racing an in-flight upload, parser, or proposal; those cases remain open pilot evidence.

## 2026-09-08 measured storage and maintenance policy

The production upload bucket was inspected directly. It has uniform bucket-level access and public-access prevention enforced. Object versioning is enabled; its lifecycle deletes non-live versions at seven days; its Cloud Storage soft-delete policy also retains deleted objects for **604,800 seconds (seven days)**. Therefore the application’s immediate live-object cleanup must not be represented as physical storage erasure within 24 hours. The documented retention statement is: application reads and live object generations are removed promptly after cleanup, while Cloud Storage recovery retention can keep deleted generations for up to seven days. No separate backup-retention promise has been verified.

The authenticated scheduled reconciler `scriptops-project-reconcile` is enabled every five minutes (UTC) against `/api/internal/projects/reconcile`. It handles durable dispatch recovery and completed-tombstone late-write sweeps; the schedule is evidence of cadence, not a proof of every in-flight race.

## Submission decision

The separate two-user, two-project production check and the in-flight deletion-race drill are deferred from the hackathon submission path at the owner's request. They remain private-pilot follow-up evidence and are not represented as completed verification in the submission materials.
