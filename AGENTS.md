# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md` is a symlink to this file — both are kept in sync by design.

## What this project is

`a2dashboard` lets a user describe a dashboard in plain language and receive a **working, live dashboard at runtime** — no code generation, no build, no deploy. An LLM emits a JSON document; the frontend interprets that JSON as UI + data bindings + endpoint requirements and renders immediately.

See `README.md` for the user-facing overview and architecture diagrams.

## Mental model

Three layers, kept separable on purpose:

| Layer | What it specifies | Who owns it |
|-------|-------------------|-------------|
| **a2UI** | The UI tree (panels, charts, tables, KPIs, layout) | Renderer |
| **Data-aggregation extension** | Filter / group / aggregate / join / time-bucket over endpoint responses | Aggregation engine |
| **Endpoint-requirement extension** | Which REST endpoint(s) feed which binding, params, refresh policy | Aggregation engine + endpoint catalog |

When extending the system, **respect the layering**: don't push aggregation concerns into the UI layer, and don't bake endpoint specifics into aggregations. The LLM is steered one layer at a time; mixing them makes prompts and patches harder.

## Conventions

- **Declarative over imperative.** No arbitrary code crosses the boundary from LLM to client. The renderer and aggregator execute only a fixed vocabulary of primitives. If you need a new capability, add a primitive — don't add a code escape hatch.
- **Endpoint catalog is hardcoded for now.** A future iteration will accept user-registered APIs (OpenAPI ingest) per tenant. Keep the catalog interface narrow so this swap stays cheap.
- **The JSON spec is the contract.** Anything that can't be expressed in the JSON spec doesn't exist in the product. If the LLM can't describe it, the renderer can't render it.
- **Patches, not rewrites.** When a user refines a dashboard, the LLM should patch the existing JSON, not regenerate it. Preserve binding IDs and layout slots so the user's mental model survives iteration.

## When making changes

- Prefer editing existing files. Don't introduce parallel structures.
- Don't add backwards-compatibility shims unless the project actually has external consumers — it doesn't yet.
- Keep the README diagrams in sync if you change the architecture. They are the canonical explanation.
- Don't expand the renderer's primitive vocabulary without also updating the LLM-facing spec docs; the LLM can only emit what it has been told exists.

## MVP scope

The first iteration is deliberately narrow so the three-layer model can be exercised end-to-end with the smallest possible surface area. Anything outside this scope is out of scope for the MVP, not "coming soon" — add it as a named extension when the time comes.

- **UI primitives:** `table` for data, plus `row` / `column` / `list` layout containers for composing several tables in one dashboard. No charts or KPIs yet.
- **Renderer:** React + MUI (the `@mui/material` `Table` family, or `@mui/x-data-grid` if a feature requires it). Layout containers are plain flex boxes whose `justify` / `align` / `direction` vocabulary mirrors Google's a2ui basic catalog, so a spec written for one renderer reads sensibly in the other. One renderer; no abstraction over alternatives.
- **Aggregation engine:** none. Bindings map rows from a single endpoint response directly onto table columns. No `filter` / `group` / `agg` / `join` / `time-bucket` ops exist yet.
- **Endpoint catalog:** two GitHub REST API endpoints (`https://api.github.com`). Requests can be unauthenticated for public data (60 req/hour) or authenticated with a GitHub Personal Access Token via `Authorization: Bearer <token>` (5000 req/hour):
  - `GET /users/{username}/repos` — paginated list of a user's public repositories. Query params: `type`, `sort`, `direction`, `page`, `per_page`.
  - `GET /repos/{owner}/{repo}/issues` — paginated list of issues for a repository. Query params: `state`, `labels`, `sort`, `direction`, `since`, `page`, `per_page`.

Implications for agents working in the MVP:

- The LLM-facing spec should advertise exactly four UI primitives (`table`, `row`, `column`, `list`) and exactly these two endpoints. Don't tell the model about primitives that don't exist.
- A binding is a `{ endpoint, field }` pair — no transformation step in between. If a column needs a derived value, that's a signal to add an aggregation primitive (and update the spec docs in the same change), not to inline logic in the renderer.
- Pagination is the only "data behavior" the MVP supports beyond raw display. Keep refresh policy minimal (manual / on-mount) until a real use case demands more.
- The UI tree is the renderer-facing shape (`ui: UINode` with inline `children: UINode[]`). The LLM emits a flat `componentEntries` + `uiRootId` form instead — see `server/src/llm.ts` — to dodge recursive JSON-schema limits in OpenAI strict mode. The server resolves the flat form into the tree before returning; any new layout primitive needs to be added on both sides of that conversion.

## Status

Early prototype. There is no application code in this repository yet — only documentation and the project's stated intent. New code should land alongside updates to this file and `README.md` so the design stays legible.
