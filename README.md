<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a74b8597-be5b-45c8-a7c2-688f26041f04

## Architecture

This is a **Bun workspaces monorepo** with the following layout:

```
adaptiva/
├── apps/
│   ├── web/        # React 19 + Vite 6 SPA (port 3000)
│   └── api/        # Express proxy server (port 3001) - hides Gemini API key
├── packages/
│   └── shared/     # Cross-package types/utilities stub
├── package.json    # Workspace root (Bun workspaces)
└── tsconfig.base.json
```

## Run Locally

**Prerequisites:** [Bun](https://bun.sh) >= 1.2

1. Install dependencies (hoisted workspaces):
   ```bash
   bun install
   ```
2. Set the `GEMINI_API_KEY` in [`.env.local`](.env.local) at the monorepo root.
3. Run both frontend and backend:
   ```bash
   bun run dev
   ```
   - Web: http://localhost:3000
   - API: http://localhost:3001

4. Run only one side:
   ```bash
   bun run dev:web
   bun run dev:api
   ```

5. Build for production:
   ```bash
   bun run build
   ```
   Outputs to `apps/web/dist/`.

6. Start the production server (serves web build + proxies API):
   ```bash
   bun run start
   ```
   (port 3001 by default; `PORT` env var overrides)

7. Run tests:
   ```bash
   bun run test
   ```
