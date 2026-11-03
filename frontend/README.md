# AgentForge frontend

React + TypeScript + Vite visual workflow editor. Architecture: `../docs/ARCHITECTURE.md`. Project state: `../docs/PROJECT_BRAIN.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Vite) |
| `npm run typecheck` | Type-check every project (`tsc -b`: app, node tooling, e2e); run `npm ci` first, never bare `npx tsc` |
| `npm run lint` | Oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check every project (`tsc -b`: app, node tooling, e2e) and build |
| `npm run test:e2e` | Browser tests (Playwright, Chromium); starts its own dev server on port 5174 |
| `npm run verify` | Everything above in order: lint, unit tests, build (includes type-check), e2e |

## Reproducible run from a clean checkout

```
cd frontend
npm ci
npx playwright install chromium     # one time, about 120 MB; no system Chrome needed
npm run verify
```

`npm run test:e2e` always starts its own dev server on port 5174 (`--strictPort`) and never reuses a running one, so it fails if that port is taken rather than testing another server. In CI (`CI=1`) it also retries a failed test once, fails the run if a test needed a retry (`failOnFlakyTests`), and keeps traces of retried tests.

## End-to-end tests (`e2e/`)

- Files end in `.e2e.ts` so Vitest does not collect them. `playwright.config.ts` fixes the browser, viewport (1400x900) and reduced motion, because the drag and connect tests depend on layout.
- `fixtures.ts` gives every test a fresh editor page and **fails the test on any console error or uncaught page error**.
- `editor.ts` holds the helpers (drop from the library, connect two ports, export, import). Selectors use roles, labels and the catalog node type, never random node ids.
- When a test fails, `npx playwright show-report` (after a CI-mode run) or `npx playwright test --ui` shows the trace.

## Continuous integration

`.github/workflows/ci.yml` runs `npm run verify` on every push and pull request to `main`. Every GitHub Action in it is pinned to a **commit SHA**, with the release tag in a trailing comment.

To update or re-verify a pin: find the action's release tag on its official repository, resolve it to a commit (for an annotated tag use the commit the tag points to, not the tag object), put the 40-character commit SHA in `uses:` and the tag in the comment, and record the version and SHA in `docs/DEVELOPMENT_LOG.md`.
