# DuckDeploy

DuckDeploy is a zero-boilerplate, API-first React template built with Vite and TypeScript.

## How it works

1. Update `openapi.yaml` with your API specification.
2. Run `npm run dev` locally (or `npm run build` in CI).
3. Orval generates TypeScript models and React Query hooks into `src/api/`.
4. GitHub Actions builds the app and deploys it to GitHub Pages.

## Scripts

- `npm run dev` - Generates the API client and starts Vite dev server.
- `npm run generate` - Regenerates API client code from `openapi.yaml`.
- `npm run build` - Generates API client code, type-checks, and builds for production.
- `npm run lint` - Runs ESLint.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` runs on pushes to `main` and on manual dispatch. It automatically:

- Installs dependencies
- Generates TypeScript models and React Query hooks from `openapi.yaml`
- Builds the app
- Deploys the `dist` output to GitHub Pages
