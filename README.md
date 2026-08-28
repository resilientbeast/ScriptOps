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

## Repository safety

Local `.env*` files, service-account exports, generated output, logs, and test coverage are ignored. Copy `.env.example` for local development and keep real credentials in Google Secret Manager for deployment.

## License

MIT — see [LICENSE](LICENSE).
