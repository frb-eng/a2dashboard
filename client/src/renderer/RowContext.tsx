/**
 * Row-scoped context for table cells.
 *
 * When a table column declares a nested `cell` UI node, the renderer
 * wraps that subtree in `<RowContext.Provider value={row}>`. Descendants
 * (e.g. `text` leaves with a `field`) read the row out of this context
 * to resolve their data binding. Outside of a table cell the context is
 * `null` and `text.field` becomes a no-op (the literal `text` is used).
 *
 * Using React context (rather than threading the row through props)
 * keeps the dispatch in `NodeRenderer` row-agnostic, so any future
 * primitive can opt into row binding without changing the renderer's
 * public shape.
 */

import { createContext, useContext } from "react";

export const RowContext = createContext<Record<string, unknown> | null>(null);

export function useRowContext(): Record<string, unknown> | null {
  return useContext(RowContext);
}
