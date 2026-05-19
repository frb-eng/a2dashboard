/**
 * Endpoint-requirement layer — which REST call backs each binding,
 * which params to send, and how often to refresh.
 *
 * Endpoints themselves are defined in the hardcoded catalog
 * (`catalog/github.ts`). An `EndpointCall` is an *invocation* of one
 * catalogued endpoint: a chosen endpoint id + concrete param values.
 */

export type RefreshPolicy =
  | { kind: "manual" }
  | { kind: "on-mount" }
  /**
   * Gate the fetch on the named state slots being populated. Until every
   * slot in `stateKeys` resolves to a non-empty value, the binding sits
   * idle — no fetch, no error. The slots are written by `textField`
   * keystrokes or by `setStateAndRefresh` actions; once they are set, the
   * normal refresh tick (bumped by `setStateAndRefresh` or `refresh`)
   * fires the fetch. Used for the master-detail right panel so it does
   * not blow up on mount with "missing path param" before the user has
   * picked a row.
   */
  | { kind: "when-state-set"; stateKeys: string[] };

/**
 * Reference to a value held in the dashboard's shared state map, written
 * by a `textField` node with a matching `stateKey`. Resolved at fetch
 * time — the URL is rebuilt every refresh against the current state.
 */
export interface StateRef {
  stateKey: string;
}

/**
 * Param values are serialized into path or query slots by the
 * aggregation engine based on the catalog definition. The catalog owns
 * the path/query distinction; the call site just supplies values.
 *
 * A value is either a literal scalar (the common case) or a `StateRef`
 * that defers to whatever the user has typed into the matching
 * `textField`. State refs make the dashboard interactive without
 * crossing the LLM→client boundary with arbitrary code.
 */
export type EndpointParamValue = string | number | boolean | StateRef;

export interface EndpointCall {
  /** Catalog entry id, e.g. `"github.userRepos"`. */
  endpointId: string;
  params: Record<string, EndpointParamValue>;
  refresh: RefreshPolicy;
}
