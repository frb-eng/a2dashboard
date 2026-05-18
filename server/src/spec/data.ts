/**
 * Data-aggregation layer — bindings that describe how field values are
 * derived from endpoint responses.
 *
 * MVP: no aggregation engine. A binding names an endpoint call and (for
 * array-shaped responses) optionally a path to the rows. Filter / group /
 * agg / join / time-bucket primitives live behind this same union as
 * future variants — adding one means adding a discriminated case here and
 * a matching evaluator, not patching the UI layer.
 */

/**
 * Produces an array of row objects from an endpoint call.
 * For MVP this is the only binding kind.
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

/** Discriminated union over every binding kind. MVP has exactly one member. */
export type Binding = RowsBinding;
