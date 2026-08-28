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
| Region | `us-central1` |
| Cloud Run service | `scriptops` |
| Public URL | `https://scriptops-916693774226.us-central1.run.app` |
| Firestore | `(default)` / Native / Standard / `us-central1` |
| Cloud Tasks queue | `scriptops-ripples` |
| Runtime identity | `scriptops-app@scriptops-agentic-arkad.iam.gserviceaccount.com` |
| Task OIDC identity | `scriptops-task-invoker@scriptops-agentic-arkad.iam.gserviceaccount.com` |

The runtime identity has only Vertex AI user, Firestore data user, Cloud Tasks enqueuer, and log-writer roles. It may impersonate only the dedicated task OIDC identity. Secret Manager access is granted per secret when that secret is created; there is no project-wide secret-reader grant.

## Repository safety

Local `.env*` files, service-account exports, generated output, logs, and test coverage are ignored. Copy `.env.example` for local development and keep real credentials in Google Secret Manager for deployment.

## License

MIT — see [LICENSE](LICENSE).
