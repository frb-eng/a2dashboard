/**
 * a2UI layer — declarative UI tree.
 *
 * Vocabulary:
 *   - `table`     — data-producing container (renders rows from a binding).
 *                   Cells can hold either a raw field path or an arbitrary
 *                   nested UI node — see `TableColumn`.
 *   - `barChart`  — data-producing leaf (renders rows from a binding as a
 *                   vertical bar chart with one bar per row).
 *   - `row`       — horizontal flex layout container.
 *   - `column`    — vertical flex layout container.
 *   - `list`      — uniform flex layout with a configurable axis.
 *   - `card`      — bordered/elevated single-child container with optional title.
 *   - `tabs`      — switcher between several titled child views.
 *   - `text`      — display leaf for plain or row-bound text with a variant hint.
 *   - `icon`      — display leaf for a named glyph from a curated set
 *                   mirroring a2ui's basic-catalog icon enum.
 *   - `textField` — text input that writes to a named state slot. Endpoint
 *                   params can read that slot via `{ stateKey }` so the
 *                   dashboard re-fetches with user-supplied values.
 *   - `button`    — clickable wrapper around a child component (typically
 *                   a `text` or `icon`) that triggers a declared `action`.
 *                   Actions are also the row-click handler on `table` —
 *                   the same `Action` union drives both surfaces.
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
  /**
   * Optional action dispatched when a row is clicked. The action's
   * `valueField` (for `setStateAndRefresh`) is resolved against the
   * clicked row, so a master-detail pattern — click a repo on the left,
   * see its contributors on the right — falls out without any code
   * crossing the LLM→client boundary. When absent, rows are inert.
   */
  onRowClick?: Action;
}

/**
 * Vertical bar chart bound to a row-producing binding. One bar per row;
 * `categoryField` resolves the x-axis label and `valueField` resolves the
 * y-axis numeric value, both as dotted paths into the row. Non-numeric or
 * missing values render as 0. No transformation lives here — for "top N
 * by X" pipe the binding through `sort` + `limit` upstream.
 */
export interface BarChartNode {
  type: "barChart";
  id: string;
  /** Optional caption rendered above the chart. */
  title?: string;
  /** Id of a row-producing binding in `Dashboard.data`. */
  rows: string;
  /** Dotted path into each row used as the bar's x-axis label. */
  categoryField: string;
  /** Dotted path into each row used as the bar's y-axis numeric value. */
  valueField: string;
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

/**
 * Text-input variant hint. Mirrors a2ui's basic-catalog `TextField.variant`
 * enum; the renderer maps each value onto MUI's `TextField` props
 * (multiline / `type=number` / `type=password` / default single-line).
 */
export type TextFieldVariant = "shortText" | "longText" | "number" | "obscured";

export interface TextFieldNode {
  type: "textField";
  id: string;
  /** Label rendered next to / above the input. */
  label: string;
  /**
   * Name of the state slot this field writes to. Endpoint param values
   * reference the same key via `{ stateKey }` to consume the typed value.
   * State is shared across the dashboard tree, so several inputs can write
   * to one slot or several endpoints can read from one input.
   */
  stateKey: string;
  /**
   * Optional initial value used to seed the state slot on mount. When
   * absent, the slot is empty until the user types.
   */
  defaultValue?: string;
  /** Optional placeholder shown when the field is empty. */
  placeholder?: string;
  variant?: TextFieldVariant;
}

/** Button style hint. Mirrors a2ui's basic-catalog `Button.variant` enum. */
export type ButtonVariant = "default" | "primary" | "borderless";

/**
 * Declared action — the renderer dispatches one of a fixed set; no
 * arbitrary code crosses the LLM→client boundary. Used by `button.action`
 * and `table.onRowClick`.
 *
 *  - `refresh` — bump the dashboard's refresh tick so every binding
 *                refetches with the latest state values (i.e. whatever's
 *                in the TextField slots).
 *  - `setStateAndRefresh` — write a value into a state slot, then bump
 *                the refresh tick so every binding re-fires against the
 *                new value. The value is read from the surrounding row
 *                context via `valueField` (a dotted path into the row):
 *                for `table.onRowClick` the row is the clicked one; for
 *                a `button` inside a table cell the row is that cell's
 *                row. Outside a row context the slot is set to `""` and
 *                refresh still runs. This is the master-detail wiring —
 *                click a row on the left, the right panel refetches
 *                against the selected value.
 */
export type Action =
  | { kind: "refresh" }
  | { kind: "setStateAndRefresh"; stateKey: string; valueField: string };

export interface ButtonNode {
  type: "button";
  id: string;
  /**
   * The single UI node rendered inside the button — typically a `text`
   * leaf for a labeled button or an `icon` leaf for an icon-only button.
   */
  child: UINode;
  variant?: ButtonVariant;
  action: Action;
}

/** Discriminated union over every UI primitive. */
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
