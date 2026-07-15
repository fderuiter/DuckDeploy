# DuckDeploy

DuckDeploy is a zero-boilerplate, API-first React template built with Vite and TypeScript.

## Documentation

For a detailed understanding of how DuckDeploy works under the hood, please refer to our [live GitHub Pages documentation site](https://fderuiter.github.io/DuckDeploy/).

## How it works

1. Update `openapi.yaml` with your API specification.
2. Run `npm run dev` locally (or `npm run build` in CI).
3. The build pipeline compiles `openapi.yaml` into the OpenAPI schema (`public/schema.json`) and the UI manifest (`public/ui-manifest.json`). Orval generates TypeScript models and Axios fetchers into `src/api/`.
4. The browser loads both the static `schema.json` and `ui-manifest.json` artifacts (not raw YAML), and GitHub Actions builds and deploys the app to GitHub Pages.
5. Static asset integrity relies on standard CI/CD controls and Vite’s content-hashed build artifacts; `ui-manifest.sha256` is generated as build metadata for traceability, not as a client-side tamper-proof guarantee.
6. CDISC credentials stay server-side behind a proxy/backend layer; the frontend only talks to that proxy via `VITE_API_BASE_URL`.

## Scripts

- `npm run dev` - Generates the API client, compiles OpenAPI to static schema JSON, and starts Vite dev server.
- `npm run generate` - Regenerates API client code from `openapi.yaml`.
- `npm run compile:schema` - Compiles `openapi.yaml` into optimized `public/schema.json`.
- `npm run build` - Generates API client code + UI manifest, compiles schema JSON, builds for production, and verifies no raw OpenAPI artifacts leak into `dist`.
- `npm run validate:contract` - Performs a static check of the UI manifest against the OpenAPI spec to ensure every field is correctly mapped and constraints (enum, minLength, etc.) are enforced by the UI.
- `npm run test:fuzz` - Runs Schemathesis property-based fuzz testing to verify backend API compliance with the OpenAPI contract.
- `npm run lint` - Runs ESLint.
- `npm run proxy` - Starts the local CDISC proxy/backend on `http://localhost:8787/api/cdisc`.

## Configuration

The environment variables required for frontend, proxy, and testing are described below.

<!-- CONFIG_START -->

| Variable | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `PORT` | `number` | No | `8787` | Port for the proxy server to listen on. |
| `CDISC_PRIMARY_KEY` | `string` | Yes |  | Primary API key for CDISC Library. |
| `CDISC_SECONDARY_KEY` | `string` | No |  | Secondary API key for CDISC Library. |
| `CDISC_PROXY_PREFIX` | `string` | No | `/api/cdisc` | Path prefix for the CDISC proxy. |
| `CDISC_PROXY_MAX_BODY_BYTES` | `number` | No | `1048576` | Maximum allowed request body size in bytes. |
| `CDISC_PROXY_TIMEOUT_MS` | `number` | No | `15000` | Upstream request timeout in milliseconds. |
| `CDISC_TRUSTED_INGRESS_HEADER_NAME` | `string` | No |  | Header name for trusted ingress assertion. |
| `CDISC_TRUSTED_INGRESS_HEADER_VALUE` | `string` | No |  | Header value for trusted ingress assertion. |
| `CDISC_ALLOWED_ORIGINS` | `string` | No | `http://localhost:5173, http://127.0.0.1:5173` | Comma-separated list of allowed CORS origins. |
| `PROXY_ALLOWED_HEADERS` | `string` | No | `` | Comma-separated list of additional allowed headers. |
| `CDISC_ALLOW_UNTRUSTED_ORIGINS` | `boolean` | No | `false` | Set to true to allow unrestricted CORS access. |
| `CDISC_UPSTREAM_BASE_URL` | `string` | No | `https://api.library.cdisc.org/api` | The base URL of the upstream CDISC API. |
| `VITE_TOTAL_COUNT_HEADER` | `string` | No |  | Header to read total count from (frontend). |
| `VITE_API_BASE_URL` | `string` | No |  | Deployed CDISC proxy base URL for frontend. |
| `SCHEMATHESIS_BASE_URL` | `string` | No |  | Base URL for fuzz testing. |
| `SCHEMATHESIS_MAX_EXAMPLES` | `number` | No | `1000` | Max examples per endpoint for fuzz testing. |
| `SCHEMATHESIS_STRICT` | `boolean` | No | `false` | Fail fuzz testing if Schemathesis returns non-zero. |

<!-- CONFIG_END -->

The frontend is static, so `CDISC_PRIMARY_KEY` and `CDISC_SECONDARY_KEY` must **not** be injected into the Vite build. Instead:

1. Deploy the backend proxy from `server/cdisc-proxy.mjs`.
2. Configure the required environment variables on the proxy host.
3. Configure the frontend build with `VITE_API_BASE_URL`, pointing at the deployed proxy base URL such as `https://proxy.example.com/api/cdisc`.

For public deployments, do not rely on `Origin`/`Referer` as an access-control boundary. Instead, place the proxy behind infrastructure that injects the configured trusted ingress header (or an equivalent network control such as IP allow-listing) before requests reach `server/cdisc-proxy.mjs`.

For local development, run the proxy and Vite side by side:

1. `npm run proxy`
2. `npm run dev`

Vite proxies `/api/cdisc` to the local backend automatically, so local builds work without exposing CDISC keys in the browser bundle.

## Verification & Testing

DuckDeploy employs a multi-layer verification strategy to ensure the generated dashboard remains synchronized with the API specification:

1. **Backend Contract Compliance (OAS-to-Backend)**:
    Using Schemathesis (`npm run test:fuzz`), we perform property-based fuzz testing against the backend API. This verifies that the backend properly handles a wide range of inputs and adheres to the structural constraints defined in `openapi.yaml`. *Note: This tests the backend's robustness, not the frontend's UI components.*

2. **Frontend Generation Fidelity (OAS-to-UI)**:
    The `npm run validate:contract` script performs a static "Manifest Fidelity Mapping." It analyzes the generated UI manifest and cross-references it with the OpenAPI AST to prove that:
    - No fields defined in the spec are silently "discarded" or unmapped in the UI.
    - Constraint-bearing fields (e.g., those with `enum`, `minLength`, or `pattern`) are assigned to UI widgets capable of enforcing those specific constraints.

3. **Shadow Build Integrity**:
    The `npm run verify:shadow` check runs during the build to ensure no intermediate artifacts (like raw OpenAPI YAML) leak into the production `dist` bundle.

## Deployment

The GitHub Actions workflow in `.github/workflows/pipeline.yml` runs on pushes to `main` and on manual dispatch. It automatically:

- Installs dependencies
- Generates TypeScript models and Axios fetchers from `openapi.yaml`
- Compiles OpenAPI into static `public/schema.json`
- Builds the app
- Deploys the `dist` output to GitHub Pages

The GitHub Pages workflow only receives `VITE_API_BASE_URL` (from a repository variable). Keep `CDISC_PRIMARY_KEY` and `CDISC_SECONDARY_KEY` on the separate proxy deployment, not in the Pages build job.
