/**
 * React hook that resolves a row-producing binding into an array of rows.
 *
 * Honors the endpoint call's refresh policy: MVP supports `on-mount`
 * (fetch once) and `manual` (returns a `refresh` function the UI can
 * wire up). No background polling — that lands when a real use case
 * demands it.
 *
 * State-driven refetches: when a `button` with action `refresh` bumps
 * the shared `refreshTick`, this effect re-runs and rebuilds the URL
 * against the current `textField` slot values. Typing into a field
 * alone does NOT refetch — the button is the explicit "go".
 */

import { useCallback, useEffect, useState } from "react";
import type { Binding, Dashboard } from "../spec";
import { fetchRows, loadCatalog } from "./data";
import { useDashboardState } from "./DashboardStateContext";

export interface RowsState {
  rows: Record<string, unknown>[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRows(
  binding: Binding | undefined,
  dashboard: Dashboard,
): RowsState {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const { getValue, refreshTick } = useDashboardState();

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!binding) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const catalog = await loadCatalog();
        const result = await fetchRows(binding, dashboard, catalog, getValue);
        if (!cancelled) setRows(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `tick` drives the local manual refresh button; `refreshTick` drives
    // dashboard-wide button-triggered refreshes; the binding/dashboard
    // identity changes when a new dashboard is generated. `getValue` is
    // read inside the async block — we don't depend on it directly so
    // keystrokes alone don't refire (a `filter` binding's state ref is
    // resolved at fetch time, so this is what gives the user the
    // "button applies the filter" UX).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, dashboard, tick, refreshTick]);

  return { rows, loading, error, refresh };
}
