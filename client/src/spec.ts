/**
 * Dashboard JSON contract — the client's view of the spec the server emits.
 *
 * Mirrors the types in `server/src/spec/*` and `server/src/catalog/github.ts`.
 * The two are kept in lockstep by hand; the contract is small and frozen for
 * the MVP. If a primitive is added, update both sides in the same change.
 */

export type LayoutJustify =
  | "start"
  | "center"
  | "end"
  | "spaceBetween"
  | "spaceAround"
  | "spaceEvenly";

export type LayoutAlign = "start" | "center" | "end" | "stretch";

export type ListDirection = "vertical" | "horizontal";

export interface TableColumn {
  id: string;
  header: string;
  /** Dotted path into a row, e.g. "owner.login". Ignored when `cell` is set. */
  field?: string;
  /**
   * A nested UI node rendered inside every cell of this column. The
   * renderer wraps it in a row-scoped context so descendant `text` nodes
   * can resolve their `field` against the current row.
   */
  cell?: UINode;
}

export interface TableNode {
  type: "table";
  id: string;
  title?: string;
  /** Id of a binding in `Dashboard.data`. */
  rows: string;
  columns: TableColumn[];
  /**
   * Optional action dispatched on row click. The action's `valueField`
   * (when `kind === "setStateAndRefresh"`) is resolved against the
   * clicked row, enabling master-detail: click a row on the left, the
   * right panel refetches against the selected value.
   */
  onRowClick?: Action;
}

/**
 * Vertical bar chart bound to a row-producing binding. `categoryField`
 * is a dotted path into the row used as the x-axis label and
 * `valueField` is a dotted path used as the y-axis numeric value. When
 * `seriesField` is set, rows are grouped by its value into multiple
 * series rendered side-by-side per category; omit it for a single
 * series. For "top N by X", chain the binding through `sort` + `limit`.
 */
export interface BarChartNode {
  type: "barChart";
  id: string;
  title?: string;
  /** Id of a row-producing binding in `Dashboard.data`. */
  rows: string;
  categoryField: string;
  valueField: string;
  /** Dotted path used to group rows into named series; omit for single-series. */
  seriesField?: string;
}

export interface RowNode {
  type: "row";
  id: string;
  title?: string;
  children: UINode[];
  justify?: LayoutJustify;
  align?: LayoutAlign;
}

export interface ColumnNode {
  type: "column";
  id: string;
  title?: string;
  children: UINode[];
  justify?: LayoutJustify;
  align?: LayoutAlign;
}

export interface ListNode {
  type: "list";
  id: string;
  title?: string;
  children: UINode[];
  direction?: ListDirection;
  align?: LayoutAlign;
}

export interface CardNode {
  type: "card";
  id: string;
  title?: string;
  child: UINode;
}

export interface TabsTab {
  title: string;
  child: UINode;
}

export interface TabsNode {
  type: "tabs";
  id: string;
  title?: string;
  tabs: TabsTab[];
}

export type TextVariant = "h1" | "h2" | "h3" | "h4" | "h5" | "caption" | "body";

export interface TextNode {
  type: "text";
  id: string;
  text?: string;
  field?: string;
  variant?: TextVariant;
}

export type IconName =
  | "accountCircle"
  | "add"
  | "arrowBack"
  | "arrowForward"
  | "calendarToday"
  | "check"
  | "close"
  | "delete"
  | "download"
  | "edit"
  | "error"
  | "favorite"
  | "folder"
  | "help"
  | "home"
  | "info"
  | "lock"
  | "lockOpen"
  | "mail"
  | "menu"
  | "person"
  | "refresh"
  | "search"
  | "send"
  | "settings"
  | "share"
  | "star"
  | "upload"
  | "visibility"
  | "visibilityOff"
  | "warning";

export interface IconNode {
  type: "icon";
  id: string;
  name: IconName;
}

export type TextFieldVariant = "shortText" | "longText" | "number" | "obscured";

export interface TextFieldNode {
  type: "textField";
  id: string;
  label: string;
  /** Slot name written by this field, read by endpoint params via `{ stateKey }`. */
  stateKey: string;
  /** Seeds the state slot on mount. When absent, the slot starts empty. */
  defaultValue?: string;
  placeholder?: string;
  variant?: TextFieldVariant;
}

export type ButtonVariant = "default" | "primary" | "borderless";

/**
 * Declared action — dispatched by `button.action` and `table.onRowClick`.
 *
 *  - `refresh` — bump the dashboard's refresh tick.
 *  - `setStateAndRefresh` — write the surrounding row's `valueField`
 *    into the state slot named by `stateKey`, then bump the refresh
 *    tick so every binding re-fires with the new value. Outside a row
 *    context the slot is set to "" and refresh still runs.
 */
export type Action =
  | { kind: "refresh" }
  | { kind: "setStateAndRefresh"; stateKey: string; valueField: string };

export interface ButtonNode {
  type: "button";
  id: string;
  /** Single child UI node — typically a `text` label or an `icon`. */
  child: UINode;
  variant?: ButtonVariant;
  action: Action;
}

export type UINode =
  | TableNode
  | BarChartNode
  | RowNode
  | ColumnNode
  | ListNode
  | CardNode
  | TabsNode
  | TextNode
  | IconNode
  | TextFieldNode
  | ButtonNode;

export interface RowsBinding {
  type: "rows";
  /** Id of an endpoint call in `Dashboard.endpoints`. */
  endpoint: string;
  /**
   * Dotted path into the response body when the rows aren't at the top
   * level. Omit for catalogued GitHub endpoints. Endpoints whose body is
   * a single object instead of an array (e.g. `github.repo`) are wrapped
   * by the engine as a 1-row stream — no `rowsPath` needed.
   */
  rowsPath?: string;
}

/** MVP filter operator. See server spec for the growth path. */
export type FilterOp = "containsIgnoreCase";

/**
 * Transforms another binding's rows by keeping only those whose `field`
 * matches `value`. Evaluated inside `useRows`, so it re-runs on the
 * dashboard's refresh tick — pressing a `button` with action `refresh`
 * is the "apply" trigger. Typing into the source `textField` alone does
 * NOT re-filter.
 */
export interface FilterBinding {
  type: "filter";
  /** Id of another binding in `Dashboard.data` whose rows we transform. */
  source: string;
  field: string;
  op: FilterOp;
  value: string | number | boolean | StateRef;
}

/**
 * Truncates another binding's rows to at most `count` entries — the
 * "top N" primitive. The source binding's row order is preserved; pair
 * with an endpoint whose response is already ordered usefully (e.g.
 * `github.repoContributors` returns contributors by commit count desc,
 * so `limit 3` is the top 3 contributors).
 */
export interface LimitBinding {
  type: "limit";
  /** Id of another binding in `Dashboard.data` whose rows we truncate. */
  source: string;
  /** Maximum number of rows to keep. Non-negative integer literal. */
  count: number;
}

export type SortDirection = "asc" | "desc";

/**
 * Reorders another binding's rows by a single field. Pure ordering;
 * chain with `limit` for the natural "top N by X" pattern. Comparison
 * is numeric when both values are finite numbers, else string-coerced;
 * `null` / `undefined` sort to the end regardless of direction.
 */
export interface SortBinding {
  type: "sort";
  /** Id of another binding in `Dashboard.data` whose rows we reorder. */
  source: string;
  field: string;
  direction: SortDirection;
}

/** Aggregation operator for the `group` binding. */
export type GroupOp = "count";

/**
 * Buckets another binding's rows by a flat field name and emits one
 * output row per distinct key, carrying the key plus the aggregated
 * value (`as`). Output rows preserve first-seen key order so a chart
 * downstream of a `union` reads the buckets in the union's order.
 */
export interface GroupBinding {
  type: "group";
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
 * which source it came from — the multi-source primitive behind
 * "compare X across N entities in one chart". Each entry in `sources`
 * names another binding plus the tag to write under `tagField` on every
 * row that source produces.
 */
export interface UnionBinding {
  type: "union";
  sources: { source: string; tag: string }[];
  /** Flat field name written onto every row, holding the source's `tag`. */
  tagField: string;
}

export type Binding =
  | RowsBinding
  | FilterBinding
  | LimitBinding
  | SortBinding
  | UnionBinding
  | GroupBinding;

export type RefreshPolicy =
  | { kind: "manual" }
  | { kind: "on-mount" };

/**
 * Reference to a value held in the shared state map and written by a
 * `textField` with the matching `stateKey`. Resolved at fetch time, so
 * the URL is rebuilt against whatever the user has typed.
 */
export interface StateRef {
  stateKey: string;
}

export type EndpointParamValue = string | number | boolean | StateRef;

export interface EndpointCall {
  endpointId: string;
  params: Record<string, EndpointParamValue>;
  refresh: RefreshPolicy;
}

export interface Dashboard {
  version: "0.1";
  title: string;
  ui: UINode;
  data: Record<string, Binding>;
  endpoints: Record<string, EndpointCall>;
}

/** Catalog entry shape returned by the server's `/api/catalog`. */
export interface CatalogParam {
  name: string;
  in: "path" | "query";
  required: boolean;
}

/**
 * Per-endpoint pagination contract — mirrors `EndpointPagination` on the
 * server. Presence means the aggregation engine will auto-walk pages of
 * this endpoint for a `rows` binding (page index in `pageParam`, page
 * size in `pageSizeParam`, page size defaulted to `defaultPageSize` when
 * the spec doesn't set one, capped at `maxPages` per binding).
 */
export interface CatalogPagination {
  pageParam: string;
  pageSizeParam: string;
  defaultPageSize: number;
  maxPages: number;
}

export interface CatalogEntry {
  id: string;
  method: "GET";
  urlTemplate: string;
  params: CatalogParam[];
  responseIsArray: boolean;
  pagination?: CatalogPagination;
}
