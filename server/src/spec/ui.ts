/**
 * a2UI layer — declarative UI tree.
 *
 * Vocabulary:
 *   - `table`   — the only data-producing primitive (renders rows from a binding).
 *   - `row`     — horizontal flex layout container.
 *   - `column`  — vertical flex layout container.
 *   - `list`    — uniform flex layout with a configurable axis.
 *   - `card`    — bordered/elevated single-child container with optional title.
 *   - `tabs`    — switcher between several titled child views.
 *
 * The renderer executes only what is named here, and the LLM is told only
 * what is named here — these two stay in lockstep.
 *
 * Containers hold their children inline (`children`, `child`, or
 * `tabs[].child` as a `UINode`). The LLM-facing intermediate format uses
 * a flat components-by-id map instead (see `server/src/llm.ts`); the
 * server resolves it into this tree before returning the dashboard.
 */

/** Where to position children along a flex axis. Mirrors a2ui's basic catalog. */
export type LayoutJustify =
  | "start"
  | "center"
  | "end"
  | "spaceBetween"
  | "spaceAround"
  | "spaceEvenly";

/** How to align children on the cross axis. Mirrors a2ui's basic catalog. */
export type LayoutAlign = "start" | "center" | "end" | "stretch";

/** List axis. */
export type ListDirection = "vertical" | "horizontal";

export interface TableColumn {
  /** Stable id, preserved across patches so the user's mental model survives iteration. */
  id: string;
  /** Column header text shown to the user. */
  header: string;
  /**
   * Dotted path into the row object produced by the bound endpoint.
   * Example: "name", "owner.login", "license.spdx_id".
   */
  field: string;
}

export interface TableNode {
  type: "table";
  id: string;
  /** Optional caption rendered above the table. */
  title?: string;
  /** Id of a row-producing binding in `Dashboard.data`. */
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
  /**
   * Optional heading rendered at the top of the card. Distinct from the
   * card's child content, which is always exactly one node — wrap multiple
   * elements in a `column`/`row`/`list` to nest them inside a card.
   */
  title?: string;
  child: UINode;
}

export interface TabsTab {
  /** Label shown in the tab strip. */
  title: string;
  /** The single UI node displayed when this tab is active. */
  child: UINode;
}

export interface TabsNode {
  type: "tabs";
  id: string;
  /** Optional heading rendered above the tab strip. */
  title?: string;
  /** At least one tab. The first tab is active on mount. */
  tabs: TabsTab[];
}

/** Discriminated union over every UI primitive. */
export type UINode =
  | TableNode
  | RowNode
  | ColumnNode
  | ListNode
  | CardNode
  | TabsNode;
