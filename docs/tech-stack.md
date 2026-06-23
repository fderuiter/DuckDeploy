# Tech Stack

DuckDeploy is a modular, API-first React template. Its tech stack is designed to minimize boilerplate and provide a seamless end-to-end integration with the OpenAPI standard.

## Core Technologies

- **React-Admin**: The primary UI framework that powers DuckDeploy. It provides a robust, generic administrative interface on top of React, handling routing, list views, and forms out of the box.
- **TypeScript**: Ensures type safety across the entire stack, from API client generation to UI components.
- **OpenAPI**: The source of truth for DuckDeploy. The `openapi.yaml` specification defines the data models and operations.
- **Orval**: A code generator that automatically builds TypeScript models and Axios fetchers (`src/api/`) directly from the OpenAPI specification.
- **Vite**: The build tool and dev server used for lightning-fast frontend compilation.
