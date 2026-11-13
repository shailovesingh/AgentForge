---
paths:
  - "frontend/**"
---

# Frontend Rules

Structure and rationale: `docs/ARCHITECTURE.md` §2.

- TypeScript `strict` mode. No `any` in shared or exported types; use `unknown` and narrow it.
- **Editor state lives in the Zustand store.** Components read it through selectors, so they don't subscribe to the whole store. React Flow runs in controlled mode, rendered from the store.
- **React Flow is the view layer only.** Map between workflow nodes and edges and React Flow `Node`/`Edge` objects in one place. React Flow types never reach `workflow/` or exported JSON.
- **Pure logic lives in `src/workflow/`** (serialize, validate, migrate, `canConnect`). It has no React imports and is covered by Vitest.
- **One generic `WorkflowNode` component** renders from the catalog definition. Do not create a component per node type unless a node truly needs custom UI, and record a decision if it does.
- **The config panel is generated from `configSchema`.** Do not hand-code per-node forms.
- Handle IDs equal port names. Inputs go on the left and outputs on the right.
- Styling uses CSS Modules and CSS custom properties. Icons come from `lucide-react` only. No new UI or styling libraries without approval.
- Never put secrets, API keys or provider tokens in frontend code, local storage or exported workflow files.
- Interactive elements are keyboard-reachable and labelled. Anything that can be added by drag-and-drop also has a click or Enter equivalent.
- **Untrusted text never reaches `JSON.parse`.** Imports go through `importWorkflow` (strict parser, policy limits, migration, validation); typed JSON in the config panel goes through `strictParse`. Files are written only through `exportWorkflowText` (canonical key order, never throws, refuses values that could not be re-imported).
- **Errors, warnings and the document are three different things (D-017, D-018).** `validateWorkflow` returns structured errors `{code, path, message}` for files that are invalid. `lintWorkflow` derives editor warnings (incomplete or suspicious drafts) from the document and the catalog: they are never stored in the document, never exported, and never block editing, import or export. An absent required setting is a warning, not an import error (decision C1).
- **Derived data keeps its identity.** Pure helpers in `store/` (`warnings.ts`, `secretReport.ts`) cache per workflow object and reuse the previous result when it is structurally equal. Components subscribe to the SMALLEST slice they need (a boolean, one node's array), never to the whole workflow, so a drag frame or a keystroke does not re-render the canvas (lesson of the T7b performance finding).
- **Contracts are specifications with fixtures.** A change to validation, serialization, schema, migration, warnings or secret detection must update the matching document in `contracts/` AND its fixtures in the same task; the spec text and the code must agree (a spec that disagrees with the code is a defect, as found in the T6 and T9a reviews). No Python parity is claimed until the Python runner exists (Phase 2).
- **Never echo a possible secret.** UI code shows node names only through `safeDisplayName` and shows display paths only; it never renders a value, a substring, a hash or a credential-shaped key, and contains no `console.*` calls. The export confirmation dialog takes the pre-built report only (no `Workflow`).
- **No token-shaped literals anywhere in the repository** (the Product Owner pushes to GitHub, whose push protection rejects them). Tests build secret-shaped values at run time from placeholders; a repository-wide test fails on any literal. Describe credential formats in words in documents.
- Run `npm run verify` (lint, unit tests with the repository-wide guards, build, Playwright) before reporting a task complete; never run a bare `npx`.
