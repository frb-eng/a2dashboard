# Changelog

All notable releases of `a2dashboard` are listed here. The README's
Milestones table is the short-form view; this file holds the full
release notes per tag.

## v0.0.4 — Charts, cross-entity comparison, and a wiring diagram (2026-05-20)

Fourth tagged milestone. Dashboards stop being tables-only and start
being charts too. The data layer learns to compose row streams across
N entities and aggregate them per bucket. The catalog grows its first
single-object endpoint so repo-level scalars feed the same pipeline
as row-array endpoints. And the UI gains a third view — a Mermaid
wiring diagram of the spec — so when something isn't behaving the
author can see how the primitives are connected without reading the
JSON. Same three-layer model, same prompt-to-live-dashboard loop —
one new UI primitive, two new aggregation primitives, one new
endpoint, one new debug view.

### Highlights

- **`barChart` UI primitive — the first chart-shaped renderer node.**
  New typed variant `{ type: "barChart", id, rows, categoryField,
  valueField, seriesField?, title? }` binds to a row binding via
  `rows` the same way `table` does and renders bars via Highcharts.
  `categoryField` and `valueField` are dotted paths into each row —
  x-axis label and y-axis numeric value respectively. Optional
  `seriesField` groups rows into named series rendered side-by-side
  per category for cross-entity comparison; omit it for a single
  series. No transformation lives in the chart node — for "top N by
  X" pipe the binding through `sort` + `limit` upstream, the same way
  a table would. Drops into a master-detail right panel unchanged:
  same loading / error / idle ("Waiting for &lt;slot&gt;…")
  placeholders as `table`. The LLM-facing primitive count moves from
  ten to eleven; the prompt's blanket refusal of charts is narrowed to
  refuse only line / pie / scatter / KPI.

- **`union` binding — concatenate row streams from N entities into
  one stream, tagged by source.** New typed variant
  `{ type: "union", sources: { source, tag }[], tagField }`
  concatenates rows from several other bindings, stamping each row
  with the source's literal `tag` under the flat field name
  `tagField`. Behind the canonical "compare N entities in one chart"
  pipeline: one `rows` (+ optional `limit`) per entity → one `union`
  (per-entity `tag`) → one `barChart` whose `seriesField` matches the
  union's `tagField`. Each source may itself be any binding variant,
  so "top 10 contributors per repo across three repos" is three
  `limit`-on-top-of-`rows` chains feeding one `union`. Cycles and
  dangling references are caught by the engine; a union referenced
  from inside its own sources fails the spec.

- **`group` binding (op `count`) — per-bucket aggregation, the
  derived-value primitive.** New typed variant
  `{ type: "group", source, groupBy, op: "count", as }` buckets a
  source binding's rows by a flat field name and emits one row per
  distinct key, carrying the key (under `groupBy`) plus the
  aggregated value (under `as`). Output rows preserve first-seen key
  order, so a `union` feeding a `group` produces buckets in the
  union's source order — the natural "compare N entities by row
  count" pipeline is `rows` × N → `union` (tag per entity) → `group`
  (`groupBy` = union's `tagField`, `op` "count") → `barChart`.
  `sum` / `avg` / `min` / `max` land later as new op values; until
  then `count` is the only operator and the engine refuses to
  approximate the others.

- **Fourth catalogued endpoint — `github.repo` (single-object response
  via `responseIsArray`).** `GET /repos/{owner}/{repo}` joins
  `userRepos`, `repoIssues`, and `repoContributors` in the hardcoded
  catalog. Unlike the existing three, its response body is a single
  repo object, not an array of rows. A new `responseIsArray` flag on
  each `EndpointDefinition` (defaulting to `true` for the existing
  endpoints) tells the aggregation engine to wrap a non-array body
  as a 1-row stream carrying every top-level field of the response,
  so scalars like `stargazers_count` / `forks_count` /
  `open_issues_count` / `watchers_count` feed `rows` / `union` /
  `barChart` unchanged. The renderer never sees the difference — no
  new binding variant, no per-endpoint shape hack — the flag in the
  catalog is the single source of truth.

- **Third view toggle — Diagram (LLM-generated mermaid wiring
  diagram).** Alongside the rendered dashboard and the raw JSON, the
  dashboard pane now offers a third toggle that renders a Mermaid
  flowchart of every UI node, binding, endpoint, and state slot in
  the spec, with arrows showing every cross-layer reference: UI →
  binding (`rows`), binding → binding (`source` / union tag),
  binding → endpoint, dotted writes from `textField` /
  `setStateAndRefresh` actions / `filter` state refs, and dotted
  param resolution from endpoint → state. The server's
  `POST /api/mermaid` forwards the spec to the LLM with a strict JSON
  schema and the LLM returns a typed `{ nodes, edges }` graph — not
  raw mermaid syntax — and the server then emits mermaid from a
  fixed shape table (rectangle / stadium / cylinder / circle, one per
  layer) with HTML-entity-escaped labels, so the mermaid parser
  cannot choke on a model deviation. The client caches the source per
  `Dashboard` object reference and renders the SVG via mermaid.js, so
  toggling away and back is instant and only a fresh spec re-fetches.
  Strictly a debugging aid — no effect on the rendered dashboard or
  the spec contract.

### Scope (still intentionally narrow)

- UI vocabulary: eleven primitives now (`table` + `barChart` + the
  eight layout/grouping/display primitives + two interactive leaves).
  Line / pie / scatter charts and KPI tiles still refused with a
  textual reply.
- Aggregation: six typed binding variants — `rows`, `filter` (op
  `containsIgnoreCase`), `sort`, `limit`, `union`, `group` (op
  `count`). No `join` / `time-bucket` yet, and no additional
  `filter` ops or `group` ops beyond the ones above.
- Endpoint catalog: four GitHub endpoints (`github.userRepos`,
  `github.repoIssues`, `github.repoContributors`, `github.repo`).
  Per-tenant OpenAPI ingest is still on the roadmap.
- Actions: same two as v0.0.3 — `refresh`, `setStateAndRefresh`.
- Refresh policy: same two — `manual`, `on-mount` — plus the derived
  required-param fetch gate.
- Diagram view is generated on demand by the LLM. It is not part of
  the dashboard spec contract; no client-side conversion path exists
  and none is planned.

### Known gaps to address next

- More chart shapes (line / pie / scatter) for non-bar visualisations.
- More `group` operators (`sum`, `avg`, `min`, `max`) so per-bucket
  totals and averages stop being out of reach.
- More `filter` operators (`equals`, `gt`, `in`, range).
- KPI tile primitive so single-scalar summaries don't need a 1-row
  table.
- User-registered endpoints via OpenAPI ingest, so the catalog stops
  being hardcoded.

## v0.0.3 — Master-detail and top-N pipelines (2026-05-19)

Third tagged milestone. Dashboards stop being one panel that you read
and start being two panels you wire together with a click. The data
layer learns to say "top N by X" without help from the endpoint, the
UI layer learns to react to row clicks, and the renderer learns to
wait quietly for a click instead of throwing on it. Same three-layer
model, same prompt-to-live-dashboard loop — one new endpoint, one new
action, two new aggregation primitives, one new fetch state.

### Highlights

- **Row-click actions on `table` + `setStateAndRefresh` —
  master-detail without code.** The `Action` union (previously
  button-only, previously `refresh`-only) gains a second variant
  `{ kind: "setStateAndRefresh", stateKey, valueField }` that reads
  `valueField` from the surrounding row, writes it into the named
  state slot, and bumps the refresh tick in one step. Tables now
  carry an optional `onRowClick: Action` that dispatches with the
  clicked row in scope; buttons inside a table cell pick up the
  cell's row via `RowContext` so the same action works there too.
  Together this is the master-detail wiring — a click on the left
  table writes a slot that the right panel's endpoint param consumes
  via `{ stateKey }`, with no `textField` and no code escape hatch.
  Same closed dispatch as before: the renderer's switch has the
  complete vocabulary, and new actions land as new variants.

- **Required-param fetch gate — no spec change, no "missing path
  param" on master-detail mount.** The master-detail right panel was
  previously documented as "starts in an error state until the user
  clicks a row; that is expected" — bad UX baked into the contract.
  The renderer now derives the gate from existing data: if the
  underlying rows binding's endpoint call binds a *required* catalog
  param to a `{ stateKey }` whose slot is empty, `useRows` holds the
  fetch and returns `idle: true` with the pending state keys. The
  table renders "Waiting for &lt;slot&gt;…" instead of throwing. The
  `setStateAndRefresh` action already writes the slot and bumps the
  refresh tick in one step, so the gate opens automatically on the row
  click; no new primitive in the spec, no new `RefreshPolicy` variant
  — the catalog's `required` flag is the only source of truth.
  `useRows` walks the binding's `source` chain to its underlying
  `rows` binding, so the gate works for filter chains too.

- **Third catalogued endpoint — `github.repoContributors`.** `GET
  /repos/{owner}/{repo}/contributors` joins `userRepos` and
  `repoIssues` in the hardcoded catalog. Paginated, ordered by commit
  count desc, with optional `anon` to include anonymous contributors.
  Each row exposes `login`, `avatar_url`, `html_url`, `type`, and
  `contributions` so the LLM can emit top-contributor leaderboards
  without inventing fields. The catalog interface is unchanged — just
  one more `EndpointDefinition` entry — so the prompt grows by exactly
  the rows of that entry and the OpenAI strict-mode `endpointId` enum
  picks up the new id automatically.

- **`limit` binding — the "top N" primitive.** New typed binding
  variant `{ type: "limit", source, count }` truncates a source
  binding's rows to at most `count` entries. Row order is preserved
  verbatim, so `limit` over an already-ordered endpoint (e.g.
  `github.repoContributors` is by commit count desc ⇒ "top N
  contributors") expresses "top N" without a server-side sort.
  Chains freely through `source` so a `limit` can wrap a `filter`
  ("top N of the filtered rows"), a `sort` (see below — the canonical
  "top N by X" pipeline), or another `limit`. `count` is a
  non-negative integer literal; a `{ stateKey }` form lands later
  if a real use case demands it.

- **`sort` binding — client-side ordering when the endpoint can't
  sort.** New typed variant `{ type: "sort", source, field,
  direction }` reorders a source binding's rows by a single field.
  Comparison is numeric when both values are finite numbers, else
  string-coerced (case-sensitive); `null` / `undefined` sort to the
  end regardless of direction — the useful default for "top N by X"
  tables. `direction` is `asc` / `desc`. Use when the endpoint
  exposes no matching `sort` query param — e.g. `github.userRepos`
  has no "by stars" sort, so `rows` → `sort(stargazers_count, desc)`
  → `limit(10)` is the canonical "top 10 by stars" pipeline. When
  the endpoint already supports the requested ordering, prefer the
  endpoint's own `sort` / `direction` params; client-side `sort` is
  for orderings the endpoint can't express server-side.

### Scope (still intentionally narrow)

- UI vocabulary: same ten primitives as v0.0.2 — `table`, `row`,
  `column`, `list`, `card`, `tabs`, `text`, `icon`, `textField`,
  `button`. Charts, KPIs, sliders, selects, checkboxes still refused
  with a textual reply.
- Aggregation: four typed binding variants — `rows`, `filter` (op
  `containsIgnoreCase`), `sort`, `limit`. No `group` / `agg` /
  `join` / `time-bucket` yet, and no `filter` operators beyond
  case-insensitive substring.
- Actions: two — `refresh`, `setStateAndRefresh`. New variants land
  as new spec union members + new switch arms in the renderer's
  dispatch, never as a code escape hatch.
- Endpoint catalog: three GitHub endpoints (`github.userRepos`,
  `github.repoIssues`, `github.repoContributors`). Per-tenant
  OpenAPI ingest is still on the roadmap.
- Refresh policy: same two (`manual`, `on-mount`); the
  required-param fetch gate is derived from the catalog, not a
  new `RefreshPolicy` variant.

### Known gaps to address next

- More aggregation operators (filter ops `equals` / `gt` / `in`;
  `group` / `agg` / `join` / `time-bucket`).
- More UI primitives (chart, KPI tile, slider, select, checkbox)
  for dashboards that aren't tabular.
- More actions / refresh semantics (refresh-one, navigate, submit).
- User-registered endpoints via OpenAPI ingest, so the catalog
  stops being hardcoded.

## v0.0.2 — Composable, interactive dashboards (2026-05-19)

Second tagged milestone. The renderer's vocabulary grows from one
primitive (`table`) to ten, the data layer gains its first aggregation
operator, and dashboards become *interactive*: the LLM can now emit a
spec the user can type into and apply, not just one they read. Same
three-layer model, same prompt-to-live-dashboard loop — wider surface
area, exercised end-to-end.

### Highlights

- **Ten UI primitives, all a2ui-aligned.** Layout containers `row` /
  `column` / `list` compose tables side-by-side, stacked, or scrolled
  along an axis (`justify` / `align` / `direction` from a2ui's basic
  catalog). Grouping containers `card` (bordered, elevated,
  single-child) and `tabs` (titled switcher, first tab active on
  mount) wrap subtrees. Display leaves `text` (typography variant
  `h1`…`h5` / `caption` / `body`, mapped to MUI Typography) and `icon`
  (curated `name` enum, mapped to `@mui/icons-material`) fill out the
  basic-catalog surface. The renderer keeps the registry pattern from
  the a2ui React renderer: one map of `type` → component, no
  per-primitive logic in the dispatch path.
- **Recursive table cells.** Each `TableColumn` carries either a
  `field` path *or* a nested `cell` UI node. When `cell` is set, the
  renderer wraps the subtree in a `RowContext.Provider` so descendant
  `text` leaves resolve their `field` against the current row.
  Closes the a2UI recursion loop: any node can live inside any cell,
  enabling icon-plus-bound-text cells, multi-line cells, etc.
- **Interactive leaves — `textField` and `button`.** Inspired by
  a2ui's basic-catalog `TextField` and `Button`. `textField` writes
  user input to a slot named by `stateKey` in a shared client-side
  state map; endpoint params and filter bindings declared as
  `{ stateKey }` consume those slots at fetch time. `button`
  dispatches one of a fixed enum of declared actions (MVP:
  `{ kind: "refresh" }`), which bumps a shared refresh tick and
  re-fires every binding against the current state. No arbitrary code
  crosses the LLM→client boundary — new actions land as new spec
  variants. Typing alone does NOT refetch: the button stays the
  explicit "go". State persists across turn-by-turn patches so the
  user's typed values survive iteration; switching sessions resets
  it.
- **First aggregation primitive — `filter`.** The data layer is no
  longer "just `rows`". A typed `filter` binding (`{ source, field,
  op, value }`) keeps only rows from another binding whose `field`
  matches `value`, where `value` is either a literal or a
  `{ stateKey }` ref so a `textField` can drive the predicate. MVP
  op is `containsIgnoreCase`; future ops (equals / gt / in / etc.)
  land as new enum values, never as free-form expressions. Filters
  chain through `source`; cycles and dangling references are caught
  in the renderer's aggregation engine. Unlocks the canonical
  "search input + Apply button + table" dashboard end-to-end (e.g.
  "issue-search dashboard for react repo").
- **Flat-components intermediate.** The LLM now emits the UI tree as
  a flat `componentEntries[]` + `uiRootId` form (children referenced
  by `childIds`, `childId`, `tabs[].childId`, or column `cellId`) to
  dodge recursive-schema limits in OpenAI strict mode. The server
  resolves it into the renderer-friendly `ui: UINode` tree with
  inline children, with cycle and dangling-reference checks. Shared
  sub-trees (e.g. one cell component reused across columns) resolve
  independently and do not trip cycle detection.

### Scope (still intentionally narrow)

- UI vocabulary: exactly ten primitives — `table`, `row`, `column`,
  `list`, `card`, `tabs`, `text`, `icon`, `textField`, `button`. No
  charts, KPIs, sliders, selects, or check primitives yet. Requests
  that need any of these are still refused with a textual reply
  rather than faked.
- Aggregation: one operator (`containsIgnoreCase`) on one binding
  variant (`filter`). No `group` / `agg` / `join` / `time-bucket`
  yet.
- Endpoint catalog: same two GitHub endpoints as v0.0.1
  (`/users/{u}/repos`, `/repos/{o}/{r}/issues`). Per-tenant OpenAPI
  ingest is still on the roadmap.
- Button actions: one (`refresh`). Per-binding refresh, navigation,
  and submit semantics land as new switch arms when use cases demand.

### Known gaps to address next

- More aggregation operators (`equals` / `gt` / `in` / `group` /
  `agg` / `join` / `time-bucket`).
- More UI primitives (chart, KPI tile, slider, select, checkbox)
  for dashboards that aren't tabular.
- More button actions (refresh-one, navigate, submit).
- User-registered endpoints via OpenAPI ingest, so the catalog
  stops being hardcoded.

## v0.0.1 — Conversational, multi-session iteration (2026-05-18)

First tagged milestone. The end-to-end loop works: a user describes a
dashboard in plain language, gets a live table populated from GitHub's
REST API, and can iterate on it conversationally — with no code
generation, no build step, and no deploy.

### Highlights

- **Declarative three-layer JSON spec** (a2UI tree + data bindings +
  endpoint requirements), generated by `gpt-5-mini` under strict JSON
  schema constraints.
- **React + MUI runtime renderer** for the `table` primitive. Two
  GitHub endpoints in the catalog — `GET /users/{u}/repos` and
  `GET /repos/{o}/{r}/issues` — with pagination params and manual /
  on-mount refresh.
- **Conversational editing.** Each turn patches the existing spec
  rather than rewriting it; ui node, column, and binding ids are
  preserved across turns so the user's mental model survives iteration.
- **Multiple parallel dashboard sessions**, each with its own chat
  history and current spec, switchable from a sidebar and persisted to
  `localStorage`.
- **Graceful textual replies** when a request is ambiguous, off-topic,
  or needs primitives / endpoints not yet supported — instead of
  fabricating capabilities to satisfy the user.

### Scope (intentionally narrow)

- UI vocabulary: `table` only. No charts, KPIs, or layout containers
  yet.
- Aggregation engine: none. Bindings map endpoint response rows
  directly onto table columns.
- Endpoint catalog: hardcoded; two GitHub endpoints. Per-tenant
  OpenAPI ingest is a future milestone.

### Known gaps to address next

- Aggregation primitives (filter / group / agg / time-bucket).
- Additional UI primitives (chart, KPI, layout containers).
- User-registered endpoints via OpenAPI ingest.
