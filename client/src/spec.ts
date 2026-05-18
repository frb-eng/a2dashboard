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
  /** Dotted path into a row, e.g. "owner.login". */
  field: string;
}

export interface TableNode {
  type: "table";
  id: string;
  title?: string;
  /** Id of a binding in `Dashboard.data`. */
  rows: string;
  columns: TableColumn[];
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

export type UINode =
  | TableNode
  | RowNode
  | ColumnNode
  | ListNode
  | CardNode
  | TabsNode;

export interface RowsBinding {
  type: "rows";
  /** Id of an endpoint call in `Dashboard.endpoints`. */
  endpoint: string;
  rowsPath?: string;
}

export type Binding = RowsBinding;

export type RefreshPolicy =
  | { kind: "manual" }
  | { kind: "on-mount" };

export type EndpointParamValue = string | number | boolean;

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
