# DuckDeploy

DuckDeploy is a zero-boilerplate, API-first React template built with Vite and TypeScript.

## How it works

1. Update `openapi.yaml` with your API specification.
2. Run `npm run dev` locally (or `npm run build` in CI).
3. The build pipeline compiles `openapi.yaml` into `public/schema.json` (dereferenced + optimized) and Orval generates TypeScript models and Axios fetchers into `src/api/`.
4. The browser loads only the static `schema.json` artifact (not raw YAML), and GitHub Actions builds and deploys the app to GitHub Pages.
5. Static asset integrity relies on standard CI/CD controls and Vite’s content-hashed build artifacts; `ui-manifest.sha256` is generated as build metadata for traceability, not as a client-side tamper-proof guarantee.
6. CDISC credentials stay server-side behind a proxy/backend layer; the frontend only talks to that proxy via `VITE_API_BASE_URL`.

## Scripts

- `npm run dev` - Generates the API client, compiles OpenAPI to static schema JSON, and starts Vite dev server.
- `npm run generate` - Regenerates API client code from `openapi.yaml`.
- `npm run compile:schema` - Compiles `openapi.yaml` into optimized `public/schema.json`.
- `npm run build` - Generates API client code + UI manifest, compiles schema JSON, builds for production, and verifies no raw OpenAPI artifacts leak into `dist`.
- `npm run test:fuzz` - Runs Schemathesis property-based fuzz testing against the OpenAPI contract.
- `npm run lint` - Runs ESLint.
- `npm run proxy` - Starts the local CDISC proxy/backend on `http://localhost:8787/api/cdisc`.

## Proxy / backend configuration

The frontend is static, so `CDISC_PRIMARY_KEY` and `CDISC_SECONDARY_KEY` must **not** be injected into the Vite build. Instead:

1. Deploy the backend proxy from `/home/runner/work/DuckDeploy/DuckDeploy/server/cdisc-proxy.mjs`.
2. Configure these environment variables on the proxy host:
   - `CDISC_PRIMARY_KEY`
   - `CDISC_SECONDARY_KEY`
   - `CDISC_ALLOWED_ORIGINS` (comma-separated frontend origins; defaults to local Vite origins only)
   - `CDISC_UPSTREAM_BASE_URL` (optional, defaults to `https://api.library.cdisc.org`)
3. Configure the frontend build with `VITE_API_BASE_URL`, pointing at the deployed proxy base URL such as `https://proxy.example.com/api/cdisc`.

For local development, run the proxy and Vite side by side:

1. `npm run proxy`
2. `npm run dev`

Vite proxies `/api/cdisc` to the local backend automatically, so local builds work without exposing CDISC keys in the browser bundle.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` runs on pushes to `main` and on manual dispatch. It automatically:

- Installs dependencies
- Generates TypeScript models and Axios fetchers from `openapi.yaml`
- Compiles OpenAPI into static `public/schema.json`
- Builds the app
- Deploys the `dist` output to GitHub Pages

The GitHub Pages workflow only receives `VITE_API_BASE_URL` (from a repository variable). Keep `CDISC_PRIMARY_KEY` and `CDISC_SECONDARY_KEY` on the separate proxy deployment, not in the Pages build job.
