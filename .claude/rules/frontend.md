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
- Run `npm run lint`, `npm test` and `npm run build` before reporting a task complete.
