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

## Status

Early prototype. There is no application code in this repository yet — only documentation and the project's stated intent. New code should land alongside updates to this file and `README.md` so the design stays legible.
