# MAX Router

> Multi-provider AI router with a unified API, model discovery, provider management, and a web dashboard.

Repository: [kuro-myths/max-router](https://github.com/kuro-myths/max-router)  
Production: [max-router.vercel.app](https://max-router.vercel.app)

## Source of truth

**`main` is the only supported integration and production source branch.**

- Commit and push application changes to `main`.
- GitHub Actions quality checks run for pushes and pull requests targeting `main`.
- Vercel production deployments must be connected to this repository with **Production Branch = `main`**.
- Other branches are for temporary work only. Do not configure `master` or a feature branch as a production source.
- A successful GitHub Actions run does not itself deploy to Vercel; Vercel Git integration performs production deployment when its Production Branch setting is `main`.

## Project architecture

This repository is a JavaScript monorepo:

- `frontend/` — Vite + React dashboard.
- `backend/` — Express API, provider integrations, routing, model discovery, and persistence.
- `api/[...path].js` — Vercel serverless API entry point.
- `vercel.json` — build, output, function, and API rewrite configuration.
- `.github/workflows/` — CI and repository automation.

The root npm workspaces coordinate backend, frontend, and the Open SSE package.

## Requirements

- Node.js 22 (Node.js 20+ may work for local development; CI uses 22).
- npm.
- Provider API credentials for whichever upstream AI services you enable.
- A configured persistent database for production features that require durable state.

## Local development

```bash
npm ci
npm run dev
```

The root scripts provide:

```bash
npm run backend
npm run frontend
npm test
npm run typecheck
npm run build
npm start
```

Use the environment examples and setup documentation in the relevant workspace. Never commit `.env` files, API keys, OAuth tokens, database passwords, private certificates, or user data.

## GitHub Actions

The main quality workflow runs on:

- Pushes to `main`.
- Pull requests targeting `main`.
- Manual workflow dispatch.

It installs the lockfile with `npm ci`, checks imports, runs unit tests, typechecks workspaces, builds backend and frontend, and audits production dependencies.

Workflow results are visible in the repository's **Actions** tab. Fix failed checks before promoting changes to production.

## Vercel production deployment

Vercel is configured to build this repository using `vercel.json`:

- Install: `npm install --include=dev --ignore-scripts=false`
- Build: `npm run build`
- Output: `frontend/dist`
- API function: `api/[...path].js`
- API routes: `/api/*`, `/v1/*`, and `/v1beta/*`

To make deployment automatic from `main`, open the Vercel project settings:

1. Select **Settings → Git**.
2. Confirm the connected repository is `kuro-myths/max-router`.
3. Set **Production Branch** to `main`.
4. Save the setting.
5. Push a commit to `main`; Vercel should create a production deployment automatically.

Vercel's Production Branch is a project-level setting, not a value controlled by `vercel.json` or GitHub Actions. Confirm the setting in Vercel before assuming a push to `main` updates the production domain.

## API overview

The application exposes an OpenAI-compatible API surface, including model listing and chat completions. Exact routes and authentication requirements are defined by the backend implementation and its API documentation.

Typical endpoints include:

- `GET /api/health` — service health.
- `GET /v1/models` — available models.
- `POST /v1/chat/completions` — chat completions.

Use a provider/API key with the permissions configured in the dashboard. Do not expose provider secrets in browser code or commit them to this repository.

## Security and operations

- Store secrets in Vercel Project Environment Variables or the relevant hosting provider's secret manager.
- Use separate Preview and Production credentials where possible.
- Keep database backups before schema or data migrations.
- Review deployment logs and GitHub Actions checks after changes.
- Never paste access tokens, private keys, or database credentials into issues or chat.

## License

See [LICENSE](./LICENSE).
