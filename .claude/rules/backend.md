---
paths:
  - "backend/**"
---

# Backend Rules

Structure and rationale: `docs/ARCHITECTURE.md` §3, §6–§11.

- Python 3.12 managed by uv (`pyproject.toml` + `uv.lock`). Add dependencies with `uv add`, never with an ad-hoc pip install.
- Type hints on all functions. Pydantic v2 models for every request, response, workflow document, node config and LLM structured output.
- **Routers stay thin:** parse, authorize, call a service, return. Business logic lives in `services/` and the domain modules (`workflow/`, `engine/`, `agents/`, `catalog/`, `generation/`).
- Async I/O for the DB, HTTP, LLM and MCP calls. Never block the event loop; offload CPU-bound work explicitly.
- Fail explicitly. Raise domain exceptions and map them to HTTP errors in one place. Never use bare `except:`, and never swallow errors silently.
- Every query on user-owned data is scoped by `owner_id`.
- **Credentials** are resolved and decrypted only inside node executors, and redacted from logs, `node_runs` records and SSE events. They are never sent to an LLM.
- No `eval`, `exec`, `pickle` of untrusted data, `shell=True` or dynamic imports driven by user input.
- Outbound HTTP and MCP calls go through the SSRF guard and have timeouts.
- `engine/` must not import from `agents/` or LangGraph. The Agent node executor is the only bridge.
- Settings come from environment variables through `pydantic-settings`. Never hardcode secrets or commit `.env`.
- Tests use pytest with a fake LLM provider. Live LLM calls are opt-in only. Run `uv run pytest` (and the linter, once configured) before reporting completion.
