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
 * Discriminated union over every binding kind. Add a variant + its
 * evaluator branch together; never both ends in separate changes.
 */
export type Binding = RowsBinding | FilterBinding | LimitBinding | SortBinding;
