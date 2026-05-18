/**
 * Endpoint resolution + fetch — the (currently minimal) aggregation engine.
 *
 * Two responsibilities:
 *   1. Take an `EndpointCall` (catalog id + params) and produce a concrete
 *      URL by substituting path params into the catalogued template and
 *      appending the rest as query string.
 *   2. Fetch that URL and pull rows out of the response, honoring the
 *      binding's optional `rowsPath`.
 *
 * The catalog is fetched from the server once per session (the server is
 * the source of truth for URL templates and param locations) and cached.
 */

import type {
  Binding,
  CatalogEntry,
  Dashboard,
  EndpointCall,
} from "../spec";

let catalogPromise: Promise<CatalogEntry[]> | null = null;

export function loadCatalog(): Promise<CatalogEntry[]> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/catalog")
      .then((r) => {
        if (!r.ok) throw new Error(`/api/catalog returned ${r.status}`);
        return r.json() as Promise<{ endpoints: CatalogEntry[] }>;
      })
      .then((j) => j.endpoints)
      .catch((e) => {
        catalogPromise = null;
        throw e;
      });
  }
  return catalogPromise;
}

export function buildUrl(entry: CatalogEntry, call: EndpointCall): string {
  let url = entry.urlTemplate;
  const query = new URLSearchParams();

  for (const param of entry.params) {
    const value = call.params[param.name];
    if (value === undefined || value === null) {
      if (param.required && param.in === "path") {
        throw new Error(`Missing required path param "${param.name}" for ${entry.id}.`);
      }
      continue;
    }
    if (param.in === "path") {
      url = url.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    } else {
      query.set(param.name, String(value));
    }
  }

  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Read a dotted path out of a value, returning undefined if any segment is missing. */
export function readPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Resolve a binding to an array of row objects.
 *
 * For MVP the only binding kind is `rows`: hit the endpoint, optionally
 * descend `rowsPath`, and return the resulting array.
 */
export async function fetchRows(
  binding: Binding,
  dashboard: Dashboard,
  catalog: CatalogEntry[],
): Promise<Record<string, unknown>[]> {
  const call = dashboard.endpoints[binding.endpoint];
  if (!call) {
    throw new Error(`Binding references unknown endpoint id "${binding.endpoint}".`);
  }
  const entry = catalog.find((e) => e.id === call.endpointId);
  if (!entry) {
    throw new Error(`Endpoint call references unknown catalog id "${call.endpointId}".`);
  }

  const url = buildUrl(entry, call);
  const res = await fetch(url, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as unknown;
  const rows = binding.rowsPath ? readPath(body, binding.rowsPath) : body;

  if (!Array.isArray(rows)) {
    throw new Error(
      `Expected an array of rows from "${call.endpointId}"` +
        (binding.rowsPath ? ` at path "${binding.rowsPath}"` : "") +
        `, got ${typeof rows}.`,
    );
  }
  return rows as Record<string, unknown>[];
}
