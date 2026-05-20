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
 *
 * Required-param gate: if the underlying rows binding's endpoint call
 * binds a *required* catalog param to a `{ stateKey }` whose slot is
 * currently empty (e.g. master-detail's right panel before any row is
 * clicked), the fetch is held and the hook returns `idle: true` with
 * the pending state keys. The `setStateAndRefresh` action writes the
 * slot and bumps `refreshTick` in one step, so the effect re-runs and
 * the gate opens automatically. Optional params with empty state refs
 * are simply omitted from the URL (existing behavior).
 */

import { useCallback, useEffect, useState } from "react";
import type { Binding, CatalogEntry, Dashboard, EndpointCall } from "../spec";
import { fetchRows, findRootRowsBindings, loadCatalog } from "./data";
import { useDashboardState } from "./DashboardStateContext";

export interface RowsState {
  rows: Record<string, unknown>[] | null;
  loading: boolean;
  error: string | null;
  /**
   * True when the fetch is intentionally held because a required
   * catalog param is bound to an empty state slot. The table renders a
   * placeholder instead of an error.
   */
  idle: boolean;
  /** State keys the binding is waiting on (only set when `idle` is true). */
  pendingStateKeys: string[];
  refresh: () => void;
}

/**
 * Return the names of state slots that back a *required* catalog param
 * but currently resolve to "". Empty array when the call is ready to
 * fire. The catalog is the source of truth for which params are
 * required, so no per-binding annotation is needed in the spec.
 */
function pendingRequiredStateKeys(
  call: EndpointCall,
  catalog: CatalogEntry[],
  getValue: (key: string) => string,
): string[] {
  const entry = catalog.find((e) => e.id === call.endpointId);
  if (!entry) return [];
  const pending: string[] = [];
  for (const param of entry.params) {
    if (!param.required) continue;
    const raw = call.params[param.name];
    if (raw && typeof raw === "object" && "stateKey" in raw) {
      if (getValue(raw.stateKey) === "") pending.push(raw.stateKey);
    }
  }
  return pending;
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
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const catalog = await loadCatalog();
        if (cancelled) return;

        const rootRows = findRootRowsBindings(binding, dashboard);
        const pending = new Set<string>();
        for (const r of rootRows) {
          const call = dashboard.endpoints[r.endpoint];
          if (!call) continue;
          for (const key of pendingRequiredStateKeys(call, catalog, getValue)) {
            pending.add(key);
          }
        }
        if (pending.size > 0) {
          setIdle(true);
          setPendingStateKeys([...pending]);
          setRows(null);
          setLoading(false);
          return;
        }
        setIdle(false);
        setPendingStateKeys([]);

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
    // "button applies the filter" UX). The required-param gate is
    // re-checked on every refreshTick bump because setStateAndRefresh
    // writes the slot AND bumps the tick in one step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, dashboard, tick, refreshTick]);

  return { rows, loading, error, idle, pendingStateKeys, refresh };
}
