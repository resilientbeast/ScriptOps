# ScriptOps

ScriptOps is a human-supervised pre-production system for indie producers. It keeps a screenplay breakdown, shooting schedule, budget band, grounded locations, and casting briefs connected when a producer proposes and approves a scene change.

The hackathon proof of concept is intentionally built around one reliable production and one visible **Revision Ripple**: Breakdown → Parallel Evidence → Schedule → Budget / Locations / Casting. Analysis creates a complete proposal; the approved baseline changes only after human approval.

## Local setup

Requirements:

- Node.js `22.16.0`
- npm `10.9.2`

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The initial scaffold does not require provider credentials. Later Cloud, Clerk, Gemini, and Parallel integrations will validate only the variables their server-side paths use.

## Quality gates

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Planned runtime

- Next.js App Router and TypeScript
- Google Cloud Run, Cloud Tasks, and Firestore
- Gemini on Vertex AI through the official Google ADK for TypeScript
- Parallel Search through the official TypeScript SDK
- Clerk judge-access gate

The Next.js build uses standalone output for container deployment. `GET /api/health` reports only service health and never calls an external provider.

## Google Cloud foundation

The deployed bootstrap uses these non-secret resources:

| Resource | Value |
| --- | --- |
| Project | `scriptops-agentic-arkad` |
| Infrastructure region | `us-central1` |
| Vertex AI inference location | `global` |
| Cloud Run service | `scriptops` |
| Public URL | `https://scriptops-916693774226.us-central1.run.app` |
| Firestore | `(default)` / Native / Standard / `us-central1` |
| Cloud Tasks queue | `scriptops-ripples` |
| Runtime identity | `scriptops-app@scriptops-agentic-arkad.iam.gserviceaccount.com` |
| Task OIDC identity | `scriptops-task-invoker@scriptops-agentic-arkad.iam.gserviceaccount.com` |

The runtime identity has only Vertex AI user, Firestore data user, Cloud Tasks enqueuer, and log-writer roles. It may impersonate only the dedicated task OIDC identity. Secret Manager access is granted per secret when that secret is created; there is no project-wide secret-reader grant.

### Durable dispatch smoke proof

The temporary item-3 spike proves that browser/request lifetime does not own analysis work:

1. `POST /api/smoke/durable-ripple` validates a Secret Manager-backed smoke token, writes a `queued` Firestore document, creates a named OIDC Cloud Task, and returns `202` immediately.
2. Cloud Tasks independently calls `POST /api/internal/smoke/:runId/execute` as the dedicated task-invoker service account.
3. The worker cryptographically verifies the Google issuer, exact audience, verified email, and exact service-account address before persisting `analyzing → completed` after a delay.
4. `GET /api/smoke/durable-ripple/:runId` reads the persisted state. It remains available after the initiating HTTP client has exited.

The smoke endpoints are development proof only. They will be replaced by the authenticated production ripple lifecycle while their identity and durability tests remain.

### Provider smoke proof

The item-4 spike pins `@google/adk@2.0.0`, `@google/genai@2.19.0`, `parallel-web@1.3.2`, and the Vertex AI model `gemini-3.7-flash`. Cloud Run, Cloud Tasks, and Firestore remain in `us-central1`; only Gemini inference uses Vertex AI's `global` location because the model is not served from `us-central1`:

1. `POST /api/smoke/providers/gemini` runs a schema-constrained Scene 14 Breakdown through an ADK `LlmAgent` on Vertex AI and persists the structured result.
2. `POST /api/smoke/providers/parallel` performs a live-only Parallel Search for New Mexico production constraints, normalizes up to eight cited records, and persists the request ID, objective, query provenance, retrieval time, and `live` status.
3. `GET /api/smoke/providers/:provider/:runId` reads the stored provider proof. Every route requires the Secret Manager-backed smoke token.

During compatibility diagnosis, `POST /api/smoke/providers/vertex` isolates the same Vertex model, project, location, prompt, and output contract from the ADK runner. It persists only validated output or a redacted failure category and is not part of the final product API.

The Parallel client disables SDK logging and cached fallback for this proof. `PARALLEL_API_KEY` is server-only and is deployed from the resource-scoped `parallel-api-key` Secret Manager secret.

Deployed provider verification passed on Cloud Run revision `scriptops-00008-qr6`. Gemini run `1c4bb6e0-08ff-4ef0-b451-ea6370be60e6` persisted the schema-constrained Scene 14 breakdown through Google ADK; Parallel run `79ff3a36-188c-4c47-b412-1eefd02a3a65` persisted eight live evidence records. ADK structured output is read from its documented `outputKey` session state and then validated by the stricter application contract.

## Repository safety

Local `.env*` files, service-account exports, generated output, logs, and test coverage are ignored. Copy `.env.example` for local development and keep real credentials in Google Secret Manager for deployment.

## License

MIT — see [LICENSE](LICENSE).
