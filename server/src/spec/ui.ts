/**
 * a2UI layer — declarative UI tree.
 *
 * Vocabulary:
 *   - `table`   — data-producing container (renders rows from a binding).
 *                 Cells can hold either a raw field path or an arbitrary
 *                 nested UI node — see `TableColumn`.
 *   - `row`     — horizontal flex layout container.
 *   - `column`  — vertical flex layout container.
 *   - `list`    — uniform flex layout with a configurable axis.
 *   - `card`    — bordered/elevated single-child container with optional title.
 *   - `tabs`    — switcher between several titled child views.
 *   - `text`    — display leaf for plain or row-bound text with a variant hint.
 *   - `icon`    — display leaf for a named glyph from a curated set
 *                 mirroring a2ui's basic-catalog icon enum.
 *
 * The renderer executes only what is named here, and the LLM is told only
 * what is named here — these two stay in lockstep.
 *
 * Containers hold their children inline (`children`, `child`,
 * `tabs[].child`, or `TableColumn.cell` as a `UINode`). The LLM-facing
 * intermediate format uses a flat components-by-id map instead (see
 * `server/src/llm.ts`); the server resolves it into this tree before
 * returning the dashboard.
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
   * Example: "name", "owner.login", "license.spdx_id". Used when `cell`
   * is absent. Ignored when `cell` is present.
   */
  field?: string;
  /**
   * A nested UI node rendered inside every cell of this column. Renders
   * inside a row-scoped context, so leaf nodes like `text` can resolve
   * their `field` against the current row.
   */
  cell?: UINode;
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

/**
 * Typography hint. Mirrors a2ui's basic-catalog `Text.variant` enum;
 * the renderer maps each value onto a MUI Typography variant.
 */
export type TextVariant = "h1" | "h2" | "h3" | "h4" | "h5" | "caption" | "body";

export interface TextNode {
  type: "text";
  id: string;
  /**
   * Static text. Used when `field` is absent or doesn't resolve. Treated
   * as a literal — no markdown, no interpolation.
   */
  text?: string;
  /**
   * Dotted path resolved against the surrounding row context (e.g.
   * inside a table cell). When set and resolvable, this replaces `text`.
   */
  field?: string;
  variant?: TextVariant;
}

/**
 * Curated subset of a2ui's basic-catalog Icon enum. Each name has a
 * corresponding `@mui/icons-material` component on the client; adding a
 * new name requires updating both the enum here and the icon map in
 * `client/src/renderer/components/Icon.tsx`.
 */
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

/** Discriminated union over every UI primitive. */
export type UINode =
  | TableNode
  | RowNode
  | ColumnNode
  | ListNode
  | CardNode
  | TabsNode
  | TextNode
  | IconNode;
