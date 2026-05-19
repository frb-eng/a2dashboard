/**
 * Shared dashboard state — the slot map that `textField` writes to and
 * endpoint params (via `{ stateKey }`) read at fetch time.
 *
 * The renderer keeps state separate from the dashboard JSON on purpose:
 * the JSON is the contract emitted by the LLM and is immutable per turn;
 * state is per-mount, user-driven, and lives only in the client. The
 * `textField` defaults declared in the JSON seed the map on mount; from
 * then on the user owns it.
 *
 * `refreshTick` is a monotonically increasing counter bumped by buttons
 * with action `refresh`. `useRows` depends on it, so a bump re-fires
 * every binding using whatever's currently in the state map. State
 * changes alone do NOT trigger refetches — the button is the explicit
 * "go", matching the conventional form-submit pattern.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TextFieldNode, UINode } from "../spec";

export type StateValue = string;

export interface DashboardStateContextValue {
  /** Read the current value for a state slot. Returns `""` when unset. */
  getValue: (key: string) => StateValue;
  /** Write a value to a state slot. Does NOT trigger a refetch on its own. */
  setValue: (key: string, value: StateValue) => void;
  /** Bump the refresh tick — every `useRows` re-fires against the latest state. */
  refreshAll: () => void;
  /** Subscribe to refresh bumps (the value increases monotonically). */
  refreshTick: number;
}

const DashboardStateContext = createContext<DashboardStateContextValue | null>(null);

export function useDashboardState(): DashboardStateContextValue {
  const ctx = useContext(DashboardStateContext);
  if (!ctx) {
    throw new Error(
      "useDashboardState must be used inside <DashboardStateProvider>.",
    );
  }
  return ctx;
}

/** Subscribe to the value at a single key — re-renders when that key changes. */
export function useStateSlot(key: string): [StateValue, (value: StateValue) => void] {
  const { getValue, setValue } = useDashboardState();
  return [getValue(key), useCallback((v) => setValue(key, v), [setValue, key])];
}

/**
 * Walk the dashboard UI tree and collect every `textField` so we can
 * seed the state map with declared defaults on mount. Returns the
 * `{ stateKey -> defaultValue }` map.
 */
function collectTextFieldDefaults(root: UINode): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (n: UINode) => {
    switch (n.type) {
      case "textField": {
        const tf = n as TextFieldNode;
        if (!(tf.stateKey in out)) out[tf.stateKey] = tf.defaultValue ?? "";
        return;
      }
      case "row":
      case "column":
      case "list":
        n.children.forEach(visit);
        return;
      case "card":
        visit(n.child);
        return;
      case "tabs":
        n.tabs.forEach((t) => visit(t.child));
        return;
      case "button":
        visit(n.child);
        return;
      case "table":
        n.columns.forEach((c) => c.cell && visit(c.cell));
        return;
      case "text":
      case "icon":
        return;
    }
  };
  visit(root);
  return out;
}

interface DashboardStateProviderProps {
  /** The dashboard root — walked to discover textField defaults. */
  root: UINode;
  children: ReactNode;
}

export function DashboardStateProvider({
  root,
  children,
}: DashboardStateProviderProps) {
  // The values map is mutable via setValue. A separate `version` bumps
  // on every write so subscribers re-render; using a ref + counter (vs
  // useState<Map>) keeps writes O(1) without cloning on every keystroke.
  const valuesRef = useRef<Map<string, string>>(new Map());
  const [version, setVersion] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Seed defaults additively. Each patch returns a fresh `root`, but the
  // user's typed values persist — only newly-introduced stateKeys pick
  // up their declared default. Stale slots from removed textFields are
  // left in the map; nothing reads them so they're harmless.
  const defaults = collectTextFieldDefaults(root);
  for (const [k, v] of Object.entries(defaults)) {
    if (!valuesRef.current.has(k)) valuesRef.current.set(k, v);
  }

  const getValue = useCallback(
    (key: string) => valuesRef.current.get(key) ?? "",
    // version is read implicitly: callers that depend on the value should
    // also depend on context identity, which recomputes on `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
  const setValue = useCallback((key: string, value: string) => {
    if (valuesRef.current.get(key) === value) return;
    valuesRef.current.set(key, value);
    setVersion((v) => v + 1);
  }, []);
  const refreshAll = useCallback(() => setRefreshTick((t) => t + 1), []);

  const ctx = useMemo<DashboardStateContextValue>(
    () => ({ getValue, setValue, refreshAll, refreshTick }),
    [getValue, setValue, refreshAll, refreshTick],
  );

  return (
    <DashboardStateContext.Provider value={ctx}>
      {children}
    </DashboardStateContext.Provider>
  );
}
