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
  | { kind: "on-mount" };

/**
 * Param values are serialized into path or query slots by the
 * aggregation engine based on the catalog definition. The catalog owns
 * the path/query distinction; the call site just supplies values.
 */
export type EndpointParamValue = string | number | boolean;

export interface EndpointCall {
  /** Catalog entry id, e.g. `"github.userRepos"`. */
  endpointId: string;
  params: Record<string, EndpointParamValue>;
  refresh: RefreshPolicy;
}
