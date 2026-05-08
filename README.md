# 🐶 DuckDeploy

**DuckDeploy** is a fully automated, API-first frontend template. It acts as your loyal CI/CD companion—just hand it an `openapi.yaml` file, and it does the heavy lifting of fetching your data contracts, generating your network layer, and deploying the results.

Built for developers who want to maintain a single source of truth without writing repetitive `fetch` boilerplate, DuckDeploy bridges the gap between your backend OpenAPI specification and your React user interface.

## 🚀 How It Works

This repository is wired up with a seamless GitHub Actions pipeline. When you push an updated `openapi.yaml` to the `main` branch:

1. **Fetch & Generate:** Orval automatically reads the spec and generates TypeScript models, Axios clients, and ready-to-use TanStack React Query hooks.
2. **Build:** Vite compiles the React application, seamlessly integrating the newly generated API client.
3. **Deploy:** The pipeline automatically publishes the compiled static site directly to GitHub Pages.

## 🛠️ The Tech Stack

* **Build Tool:** [Vite](https://vitejs.dev/) (React + TypeScript)
* **API Generator:** [Orval](https://orval.dev/)
* **State Management:** [TanStack Query (React Query)](https://tanstack.com/query/latest)
* **HTTP Client:** [Axios](https://axios-http.com/)
* **CI/CD:** GitHub Actions & GitHub Pages

## 📦 Usage

1. Clone or fork this template.
2. Replace the `openapi.yaml` in the root directory with your own API specification.
3. Push to `main`.
4. Your fully typed, automatically generated frontend will be live on GitHub Pages!

*Note: The generated API client is intentionally ignored in version control (`src/api/`). It is generated dynamically during the local development process (`npm run dev`) and the CI/CD build step.*
