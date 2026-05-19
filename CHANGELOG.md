# Changelog

All notable releases of `a2dashboard` are listed here. The README's
Milestones table is the short-form view; this file holds the full
release notes per tag.

## Unreleased

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
