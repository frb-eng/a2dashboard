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

- **UI primitives:** `table` for data, the `row` / `column` / `list` layout containers, the `card` / `tabs` grouping containers, the `text` / `icon` display leaves, and the `textField` / `button` interactive leaves. Tables compose recursively: every column carries either a `field` path or a `cell` UI node, so a custom cell can hold any subtree (e.g. an icon + bound text). Tables also carry an optional `onRowClick: Action` so clicking a row can drive other panels. No charts or KPIs yet.
- **Renderer:** React + MUI (the `@mui/material` `Table` family, or `@mui/x-data-grid` if a feature requires it). Vocabulary mirrors Google's a2ui basic catalog: `justify` / `align` / `direction` on flex containers, single `child` on `card`, `tabs: [{ title, child }]` on `tabs`, `variant` ∈ h1…h5/caption/body on `text`, a curated `name` enum on `icon`, `variant` ∈ shortText/longText/number/obscured on `textField`, and `variant` ∈ default/primary/borderless plus a single declarative `action` on `button`. Row-scoped data inside table cells flows through a React context, so `text` inside a `cell` resolves its `field` against the current row — and a `setStateAndRefresh` action fired from inside a cell (or from a row click) reads its `valueField` from the same row. `textField` writes into a shared dashboard state map keyed by `stateKey`; endpoint params declared as `{ stateKey }` consume those values at fetch time so a `button` press, or a row-click that wrote a slot, rebuilds every URL against the current state. One renderer; no abstraction over alternatives.
- **Actions:** the renderer dispatches a closed `Action` union — no arbitrary code crosses the LLM→client boundary. `{ kind: "refresh" }` bumps a shared refresh tick. `{ kind: "setStateAndRefresh", stateKey, valueField }` reads `valueField` from the row in scope (the clicked row for `table.onRowClick`, the enclosing cell's row for a `button` inside a cell), writes it into the named slot, and then bumps the tick — the master-detail wiring. The same union backs `button.action` and `table.onRowClick`; new actions land here as new variants, never as a code escape hatch.
- **Aggregation engine:** four typed binding variants. `rows` passes an endpoint response through unchanged; `filter` (op `containsIgnoreCase`) keeps only rows whose `field` matches `value` — where `value` is either a literal or a `{ stateKey }` ref so a `textField` can drive the predicate; `sort` reorders another binding's rows by a single `field` in `asc` / `desc` (numeric when both values are numbers, else string-coerced) — for orderings the endpoint can't express server-side (e.g. `github.userRepos` has no "by stars"); `limit` truncates a source binding's rows to at most `count` entries — paired either with an already-ordered endpoint (e.g. `github.repoContributors` ⇒ "top N contributors") or stacked on top of `sort` for the canonical "top N by X". Filters, sorts, and limits chain through `source`, evaluated inside `useRows` so a `button` press re-applies them. No `group` / `agg` / `join` / `time-bucket` yet — each is a future variant, never a code escape hatch.
- **Endpoint catalog:** three GitHub REST API endpoints (`https://api.github.com`). Requests can be unauthenticated for public data (60 req/hour) or authenticated with a GitHub Personal Access Token via `Authorization: Bearer <token>` (5000 req/hour):
  - `GET /users/{username}/repos` — paginated list of a user's public repositories. Query params: `type`, `sort`, `direction`, `page`, `per_page`.
  - `GET /repos/{owner}/{repo}/issues` — paginated list of issues for a repository. Query params: `state`, `labels`, `sort`, `direction`, `since`, `page`, `per_page`.
  - `GET /repos/{owner}/{repo}/contributors` — paginated list of contributors to a repository, ordered by commit count (desc). Query params: `anon`, `page`, `per_page`. Each row carries `login`, `avatar_url`, `html_url`, `type`, and `contributions` (commit count); anonymous contributors (when `anon` is truthy) instead carry `name` / `email` and have `type: "Anonymous"` with no `login`.

Implications for agents working in the MVP:

- The LLM-facing spec should advertise exactly ten UI primitives (`table`, `row`, `column`, `list`, `card`, `tabs`, `text`, `icon`, `textField`, `button`) and exactly these three endpoints. Don't tell the model about primitives that don't exist.
- Bindings are typed variants: `rows` (raw endpoint), `filter` (predicate over another binding), `sort` (reorder another binding by a field), and `limit` ("top N" over another binding). For derived columns, prefer extending the binding union over inlining logic in the renderer. Cycles and dangling source references are caught by the aggregation engine; never bypass that check.
- Endpoint params are `string | number | boolean | { stateKey }`. The `{ stateKey }` form defers to whatever's currently in that slot — written either by a `textField` keystroke or by a `setStateAndRefresh` action firing from a button or table row click. Resolution happens at fetch time, NOT on every keystroke; the explicit trigger is a `button` press, a `table.onRowClick`, or an `on-mount` policy. New actions land here as new switch arms — never as a code escape hatch.
- Pagination is the only "data behavior" the MVP supports beyond raw display. Keep refresh policy minimal (manual / on-mount) until a real use case demands more. The renderer derives a third state from the catalog: when a *required* param is bound to a `{ stateKey }` whose slot is empty, the fetch is held and the table renders an idle "Waiting for &lt;slot&gt;…" placeholder instead of throwing "missing path param". This is the master-detail right panel's wait-for-the-row-click semantic; no spec annotation needed because the catalog already says which params are required.
- The UI tree is the renderer-facing shape (`ui: UINode` with inline `children: UINode[]`). The LLM emits a flat `componentEntries` + `uiRootId` form instead — see `server/src/llm.ts` — to dodge recursive JSON-schema limits in OpenAI strict mode. The server resolves the flat form into the tree before returning; any new layout primitive needs to be added on both sides of that conversion.

## Status

Early prototype. There is no application code in this repository yet — only documentation and the project's stated intent. New code should land alongside updates to this file and `README.md` so the design stays legible.
