/**
 * Endpoint resolution + fetch + the aggregation engine.
 *
 * Three responsibilities:
 *   1. Take an `EndpointCall` (catalog id + params) and produce a concrete
 *      URL by substituting path params into the catalogued template and
 *      appending the rest as query string.
 *   2. Fetch that URL and pull rows out of the response, honoring the
 *      binding's optional `rowsPath`.
 *   3. Evaluate the data-aggregation binding tree: a `rows` binding goes
 *      straight to (1)+(2); a `filter` binding recursively evaluates its
 *      source and then keeps only the rows matching its predicate.
 *      Cycles and dangling references are caught here; new operators
 *      (group / agg / join) land as new switch arms.
 *
 * The catalog is fetched from the server once per session (the server is
 * the source of truth for URL templates and param locations) and cached.
 */

import type {
  Binding,
  CatalogEntry,
  Dashboard,
  EndpointCall,
  EndpointParamValue,
  FilterBinding,
  RowsBinding,
} from "../spec";

/**
 * Resolver for `{ stateKey }` references in endpoint params. Supplied by
 * the renderer at fetch time so the URL is built against whatever the
 * user has typed into the matching `textField`.
 */
export type StateResolver = (stateKey: string) => string;

function isStateRef(
  v: EndpointParamValue,
): v is { stateKey: string } {
  return typeof v === "object" && v !== null && "stateKey" in v;
}

function resolveParam(
  v: EndpointParamValue,
  resolve: StateResolver | null,
): string | number | boolean {
  if (isStateRef(v)) {
    if (!resolve) return "";
    return resolve(v.stateKey);
  }
  return v;
}

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

export function buildUrl(
  entry: CatalogEntry,
  call: EndpointCall,
  resolveState: StateResolver | null = null,
): string {
  let url = entry.urlTemplate;
  const query = new URLSearchParams();

  for (const param of entry.params) {
    const raw = call.params[param.name];
    if (raw === undefined || raw === null) {
      if (param.required && param.in === "path") {
        throw new Error(`Missing required path param "${param.name}" for ${entry.id}.`);
      }
      continue;
    }
    const resolved = resolveParam(raw, resolveState);
    // An empty string from an unfilled textField is treated like an
    // unset param so a required-path-param error surfaces clearly,
    // and so optional query params don't get serialized as "key=".
    if (resolved === "" || resolved === undefined || resolved === null) {
      if (param.required && param.in === "path") {
        throw new Error(`Missing required path param "${param.name}" for ${entry.id}.`);
      }
      continue;
    }
    if (param.in === "path") {
      url = url.replace(`{${param.name}}`, encodeURIComponent(String(resolved)));
    } else {
      query.set(param.name, String(resolved));
    }
  }

  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Walk a binding's `source` chain to its underlying `rows` binding. Used
 * by the renderer to look up the endpoint call that ultimately backs a
 * (possibly filtered) binding — e.g. to decide whether its refresh
 * policy gates the fetch on a state slot being populated.
 *
 * Returns null if the chain is broken (dangling source, cycle, or
 * unknown id); the existing fetch path surfaces those as errors, so the
 * gate just lets the fetch proceed and report the real problem.
 */
export function findRootRowsBinding(
  binding: Binding,
  dashboard: Dashboard,
): RowsBinding | null {
  const visiting = new Set<string>();
  let cur: Binding | undefined = binding;
  while (cur) {
    if (cur.type === "rows") return cur;
    if (visiting.has(cur.source)) return null;
    visiting.add(cur.source);
    cur = dashboard.data[cur.source];
  }
  return null;
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

async function fetchRowsBinding(
  binding: RowsBinding,
  dashboard: Dashboard,
  catalog: CatalogEntry[],
  resolveState: StateResolver | null,
): Promise<Record<string, unknown>[]> {
  const call = dashboard.endpoints[binding.endpoint];
  if (!call) {
    throw new Error(`Binding references unknown endpoint id "${binding.endpoint}".`);
  }
  const entry = catalog.find((e) => e.id === call.endpointId);
  if (!entry) {
    throw new Error(`Endpoint call references unknown catalog id "${call.endpointId}".`);
  }

  const url = buildUrl(entry, call, resolveState);
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

function applyFilter(
  rows: Record<string, unknown>[],
  binding: FilterBinding,
  resolveState: StateResolver | null,
): Record<string, unknown>[] {
  const needleRaw = resolveParam(binding.value, resolveState);
  const needle = String(needleRaw);
  // An empty needle matches everything — typical "no filter active" UX.
  if (needle === "") return rows;

  switch (binding.op) {
    case "containsIgnoreCase": {
      const n = needle.toLowerCase();
      return rows.filter((row) => {
        const v = readPath(row, binding.field);
        if (v == null) return false;
        return String(v).toLowerCase().includes(n);
      });
    }
  }
}

/**
 * Resolve a binding tree to an array of row objects. Dispatches on the
 * binding's `type` discriminator; `filter` recurses into its `source`.
 *
 * `visiting` guards against cycles in the binding graph — a `filter`
 * whose `source` (directly or transitively) names itself would otherwise
 * spin forever.
 */
export async function fetchRows(
  binding: Binding,
  dashboard: Dashboard,
  catalog: CatalogEntry[],
  resolveState: StateResolver | null = null,
  visiting: Set<string> = new Set(),
): Promise<Record<string, unknown>[]> {
  switch (binding.type) {
    case "rows":
      return fetchRowsBinding(binding, dashboard, catalog, resolveState);
    case "filter": {
      const source = dashboard.data[binding.source];
      if (!source) {
        throw new Error(
          `Filter binding references unknown source id "${binding.source}".`,
        );
      }
      if (visiting.has(binding.source)) {
        throw new Error(
          `Binding cycle detected at filter source "${binding.source}".`,
        );
      }
      visiting.add(binding.source);
      try {
        const upstream = await fetchRows(
          source,
          dashboard,
          catalog,
          resolveState,
          visiting,
        );
        return applyFilter(upstream, binding, resolveState);
      } finally {
        visiting.delete(binding.source);
      }
    }
  }
}
