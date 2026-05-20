/**
 * Data-aggregation layer — bindings that describe how field values are
 * derived from endpoint responses.
 *
 * The union grows one operator at a time. Each variant is a typed
 * primitive (not a free-form function call), so the LLM can only emit
 * — and the renderer can only evaluate — what is named here. New
 * operators land as new variants with matching evaluator branches; they
 * do NOT live in the UI layer.
 */

import type { StateRef } from "./endpoint.js";

/**
 * Produces an array of row objects from an endpoint call.
 */
export interface RowsBinding {
  type: "rows";
  /** Id of an endpoint call in `Dashboard.endpoints`. */
  endpoint: string;
  /**
   * Optional dotted path inside the response that contains the rows array.
   * Omit when the response body is already the array (e.g. the GitHub
   * `/users/{username}/repos` endpoint returns a top-level array).
   * Endpoints whose body is a single object instead of an array (e.g.
   * `github.repo` → GET /repos/{owner}/{repo}) are wrapped by the engine
   * as a 1-row stream — no `rowsPath` needed.
   */
  rowsPath?: string;
}

/**
 * MVP filter operator — case-insensitive substring match. Future
 * operators (equals, gt, in, etc.) land as new enum values plus matching
 * evaluator branches in the aggregation engine. No regex / no free-form
 * expressions — keep the surface area named and finite.
 */
export type FilterOp = "containsIgnoreCase";

/**
 * Filters another binding's rows down to those whose `field` matches
 * `value`. `value` is the same union as endpoint params — either a
 * literal scalar or a `StateRef` so a `textField` slot can drive the
 * filter at button-press time.
 *
 * Filters chain: a `filter` binding's `source` can itself be another
 * `filter` (e.g. by state, then by label). Cycles and dangling
 * references are caught by the aggregation engine.
 */
export interface FilterBinding {
  type: "filter";
  /** Id of another binding in `Dashboard.data` whose rows we transform. */
  source: string;
  /** Dotted path into each row identifying the field to compare. */
  field: string;
  op: FilterOp;
  /** Comparison value — literal scalar or `StateRef`. */
  value: string | number | boolean | StateRef;
}

/**
 * Truncates another binding's rows to at most `count` entries — the
 * "top N" primitive. Combine with an endpoint that returns rows in a
 * useful order (e.g. `github.repoContributors` is ordered by commit
 * count desc, so `limit 3` is the top 3 contributors) to express "top
 * N" without a server-side sort param.
 *
 * `count` is a non-negative integer literal — keep the surface area
 * named and finite. A state-ref form can land later as a new variant
 * if a real use case demands it.
 */
export interface LimitBinding {
  type: "limit";
  /** Id of another binding in `Dashboard.data` whose rows we truncate. */
  source: string;
  /** Maximum number of rows to keep. Must be a non-negative integer. */
  count: number;
}

/**
 * Sort direction for the `sort` binding. New directions land as new enum
 * values + matching evaluator branches — same discipline as `FilterOp`.
 */
export type SortDirection = "asc" | "desc";

/**
 * Reorders another binding's rows by a single field. Pure ordering — no
 * filtering, no truncation — so chaining with `limit` is the natural
 * "top N by X" pattern (e.g. sort repos by `stargazers_count` desc,
 * then limit to 10).
 *
 * Comparison is numeric when both values are finite numbers, else
 * string-coerced (case-sensitive) — the same rule any reviewer would
 * write by hand. Rows with `null` / `undefined` at `field` sort to the
 * end regardless of direction.
 */
export interface SortBinding {
  type: "sort";
  /** Id of another binding in `Dashboard.data` whose rows we reorder. */
  source: string;
  /** Dotted path into each row identifying the field to sort by. */
  field: string;
  direction: SortDirection;
}

/**
 * Aggregation operator for the `group` binding. New ops (`sum`, `avg`,
 * `min`, `max`) land as new enum values + matching evaluator branches —
 * the same discipline as `FilterOp`. `count` doesn't read a per-row
 * field; future numeric ops will require an additional `field` member
 * on the binding, added in the same change as the op.
 */
export type GroupOp = "count";

/**
 * Buckets another binding's rows by a flat field name and emits one
 * output row per distinct key, carrying the key plus the aggregated
 * value. The MVP op is `count` (number of input rows in each bucket) —
 * paired with a `union` upstream, this is "compare N entities by how
 * many rows each one contributes" (e.g. total contributors per repo).
 *
 * Output rows preserve first-seen key order, so a `union` whose
 * `sources` are listed `[react, angular, vue]` produces `[{ repo:
 * "react", … }, { repo: "angular", … }, { repo: "vue", … }]` —
 * downstream charts read them in that order without an extra `sort`.
 *
 * `groupBy` is a flat field name (same discipline as `union.tagField`);
 * for nested keys, flatten upstream. The output row stores the key
 * under that same field name, plus the aggregated value under `as`.
 */
export interface GroupBinding {
  type: "group";
  /** Id of another binding in `Dashboard.data` whose rows we aggregate. */
  source: string;
  /** Flat field name read from each input row to bucket by. */
  groupBy: string;
  op: GroupOp;
  /** Flat field name where the aggregated value is written on each output row. */
  as: string;
}

/**
 * Concatenates rows from several other bindings into a single stream,
 * stamping each row with a literal tag so downstream consumers can tell
 * which source it came from. This is the multi-source primitive that
 * unlocks "compare X across N entities in one chart" — three `rows`
 * bindings (one per repo) joined into one binding, then read by a
 * `barChart` with `seriesField` pointing at the tag field.
 *
 * Each entry in `sources` names another binding plus the literal value
 * to stamp on every row produced by that source. The tag is written to
 * `tagField` on each row (last-write-wins if the source row already has
 * a key with the same name). `tagField` is a flat field name — not a
 * dotted path — so the stamped value sits at the top level of the row,
 * mirroring how `text` / `barChart` resolve a top-level field.
 *
 * Sources evaluate independently and in parallel; cycles and dangling
 * references are caught by the aggregation engine the same way they are
 * for `filter` / `sort` / `limit`. Each source in turn may be any
 * binding variant — chain `rows` → `limit` per repo to get "top N
 * contributors per repo, unioned together".
 */
export interface UnionBinding {
  type: "union";
  /** Each entry: a source binding id plus the tag to stamp on its rows. */
  sources: { source: string; tag: string }[];
  /** Flat field name written onto every row, holding the source's `tag`. */
  tagField: string;
}

/**
 * Discriminated union over every binding kind. Add a variant + its
 * evaluator branch together; never both ends in separate changes.
 */
export type Binding =
  | RowsBinding
  | FilterBinding
  | LimitBinding
  | SortBinding
  | UnionBinding
  | GroupBinding;
