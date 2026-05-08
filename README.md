# DuckDeploy

DuckDeploy is a zero-boilerplate, API-first React template built with Vite and TypeScript.

## How it works

1. Update `openapi.yaml` with your API specification.
2. Run `npm run dev` locally (or `npm run build` in CI).
3. The build pipeline compiles `openapi.yaml` into `public/schema.json` (dereferenced + optimized) and Orval generates TypeScript models and React Query hooks into `src/api/`.
4. The browser loads only the static `schema.json` artifact (not raw YAML), and GitHub Actions builds and deploys the app to GitHub Pages.

## Scripts

- `npm run dev` - Generates the API client, compiles OpenAPI to static schema JSON, and starts Vite dev server.
- `npm run generate` - Regenerates API client code from `openapi.yaml`.
- `npm run compile:schema` - Compiles `openapi.yaml` into optimized `public/schema.json`.
- `npm run build` - Generates API client code, compiles schema JSON, and builds for production.
- `npm run lint` - Runs ESLint.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` runs on pushes to `main` and on manual dispatch. It automatically:

- Installs dependencies
- Generates TypeScript models and React Query hooks from `openapi.yaml`
- Compiles OpenAPI into static `public/schema.json`
- Builds the app
- Deploys the `dist` output to GitHub Pages
