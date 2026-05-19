/**
 * Shared action dispatch.
 *
 * Both `button.action` and `table.onRowClick` carry an `Action`; this
 * helper is the single place that knows how to execute one. The renderer
 * never invokes arbitrary code from the spec — the switch below is the
 * complete vocabulary, and adding an action means adding a switch arm.
 *
 * For `setStateAndRefresh`, the value is read from the surrounding row
 * (the clicked row for a table; the enclosing table-cell row for a
 * button inside a cell) via the action's `valueField`. Outside a row
 * context the slot is set to "" and the refresh still runs.
 */

import type { Action } from "../spec";
import { readPath } from "./data";

export interface DispatchContext {
  /** The row in scope (clicked row, or the enclosing cell's row). Null outside any row context. */
  row: Record<string, unknown> | null;
  setValue: (key: string, value: string) => void;
  refreshAll: () => void;
}

export function dispatchAction(action: Action, ctx: DispatchContext): void {
  switch (action.kind) {
    case "refresh":
      ctx.refreshAll();
      return;
    case "setStateAndRefresh": {
      const raw = ctx.row ? readPath(ctx.row, action.valueField) : undefined;
      ctx.setValue(action.stateKey, raw == null ? "" : String(raw));
      ctx.refreshAll();
      return;
    }
  }
}
