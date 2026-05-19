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

export type Binding = RowsBinding | FilterBinding | LimitBinding;

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

export interface CatalogEntry {
  id: string;
  method: "GET";
  urlTemplate: string;
  params: CatalogParam[];
  responseIsArray: boolean;
}
