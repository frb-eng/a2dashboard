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
import { fetchRows, findRootRowsBinding, loadCatalog } from "./data";
import { useDashboardState } from "./DashboardStateContext";

export interface RowsState {
  rows: Record<string, unknown>[] | null;
  loading: boolean;
  error: string | null;
  /**
   * True when the binding's endpoint has refresh kind `when-state-set`
   * and at least one of the required state slots is still empty. The
   * fetch is intentionally skipped — the table renders a placeholder
   * instead of an error.
   */
  idle: boolean;
  /** State keys the binding is waiting on (only set when `idle` is true). */
  pendingStateKeys: string[];
  refresh: () => void;
}

export function useRows(
  binding: Binding | undefined,
  dashboard: Dashboard,
): RowsState {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [pendingStateKeys, setPendingStateKeys] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const { getValue, refreshTick } = useDashboardState();

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!binding) return;
    let cancelled = false;

    // Endpoint-level gate: when the underlying rows binding's endpoint
    // call has refresh.kind "when-state-set", hold the fetch until every
    // listed slot has a non-empty value. The setStateAndRefresh action
    // bumps refreshTick after writing a slot, so this effect re-runs and
    // re-checks — opening the gate the moment the user clicks a row.
    const rootRows = findRootRowsBinding(binding, dashboard);
    const call = rootRows ? dashboard.endpoints[rootRows.endpoint] : undefined;
    if (call && call.refresh.kind === "when-state-set") {
      const pending = call.refresh.stateKeys.filter((k) => getValue(k) === "");
      if (pending.length > 0) {
        setIdle(true);
        setPendingStateKeys(pending);
        setRows(null);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setIdle(false);
    setPendingStateKeys([]);
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
    // "button applies the filter" UX). The `when-state-set` gate is
    // re-checked on every refreshTick bump because setStateAndRefresh
    // writes the slot AND bumps the tick in one step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, dashboard, tick, refreshTick]);

  return { rows, loading, error, idle, pendingStateKeys, refresh };
}
