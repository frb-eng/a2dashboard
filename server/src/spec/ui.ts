/**
 * a2UI layer — declarative UI tree.
 *
 * MVP vocabulary: a single `table` primitive. No charts, KPIs, panels, or
 * layout containers. The renderer executes only what is named here, and the
 * LLM is told only what is named here — these two stay in lockstep.
 */

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

/** Discriminated union over every UI primitive. MVP has exactly one member. */
export type UINode = TableNode;
