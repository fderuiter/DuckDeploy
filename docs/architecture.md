# Architecture

This document describes the architectural data flow in DuckDeploy, focusing on how the React-Admin frontend integrates with the backend API.

## Data Flow

DuckDeploy operates strictly on an API-first paradigm. All application logic is derived from the `openapi.yaml` contract.

1. **Compilation Phase**: `openapi.yaml` is processed to generate `public/schema.json` (the UI manifest) and the TypeScript models / Axios clients in `src/api/` via Orval.
2. **Bootstrapping Phase**: The frontend loads the static `schema.json` to precalculate available resources, fields, and forms (`src/App.tsx`).
3. **Runtime UI Construction**: The `ResourceFactory` provisions standard React-Admin `<Resource>` definitions dynamically based on discovered endpoints (e.g., matching a `/users` path to a `users` resource).

## The Custom Data Provider

React-Admin relies on a standard Data Provider interface to map generic CRUD operations (`getList`, `getOne`, `create`, `update`, `delete`) to API requests. 

In DuckDeploy, `src/providers/openApiDataProvider.ts` implements this custom data provider:
- It maps React-Admin queries into generated Orval Axios calls.
- It translates generic parameters (e.g., React-Admin's `filter`, `pagination`, `sort`) into standard query parameters according to the specific definitions in `openapi.yaml`.
- It processes API responses into React-Admin's expected `{ data, total }` structure.

## Authentication and Permission Probing

The `AuthProvider` in `src/core/authProvider.ts` manages security. Instead of hardcoding role-based access logic on the frontend, DuckDeploy employs a **dynamic permission probing** approach.

- For each action (`list`, `show`, `create`, `edit`, `delete`), the AuthProvider sends a lightweight probe request to the respective endpoint.
- Mutating actions (`create`, `edit`, `delete`) are probed using `OPTIONS` requests to avoid side effects.
- If the endpoint returns an allowed status (like `200`, `204`, or a `405 Method Not Allowed` on an `OPTIONS` probe), React-Admin is informed the user has access.
- `401 Unauthorized` or `403 Forbidden` responses deny access to the corresponding view or button in the UI.

This enables backend-enforced security to instantly reflect on the frontend without duplicating permission roles.
