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
 *      straight to (1)+(2); `filter` / `sort` / `limit` / `group`
 *      recursively evaluate their single `source` (group buckets the
 *      upstream rows by a flat field and emits one output row per
 *      bucket with the aggregated value); `union` evaluates each of
 *      its multiple sources in parallel, stamps a per-source tag onto
 *      every row, and concatenates them into one stream. Cycles and
 *      dangling references are caught here; new operators (sum / avg /
 *      join) land as new switch arms.
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
  GroupBinding,
  LimitBinding,
  RowsBinding,
  SortBinding,
  UnionBinding,
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
 * Walk a binding tree down to every underlying `rows` binding it
 * eventually reads from. Used by the renderer to look up the endpoint
 * call(s) that ultimately back a (possibly filtered / sorted / limited /
 * unioned / grouped) binding — e.g. to decide whether the fetch should
 * be held on a required state slot being populated.
 *
 * Returns every `rows` binding reachable through `.source` chains and
 * `union.sources[]`. Dangling references and cycles are skipped here;
 * the fetch path surfaces those as errors, so the gate just lets the
 * fetch proceed and report the real problem.
 */
export function findRootRowsBindings(
  binding: Binding,
  dashboard: Dashboard,
): RowsBinding[] {
  const out: RowsBinding[] = [];
  const visiting = new Set<string>();
  const walk = (b: Binding | undefined): void => {
    if (!b) return;
    if (b.type === "rows") {
      out.push(b);
      return;
    }
    if (b.type === "union") {
      for (const { source } of b.sources) {
        if (visiting.has(source)) continue;
        visiting.add(source);
        try {
          walk(dashboard.data[source]);
        } finally {
          visiting.delete(source);
        }
      }
      return;
    }
    if (visiting.has(b.source)) return;
    visiting.add(b.source);
    try {
      walk(dashboard.data[b.source]);
    } finally {
      visiting.delete(b.source);
    }
  };
  walk(binding);
  return out;
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
  const extracted = binding.rowsPath ? readPath(body, binding.rowsPath) : body;

  if (Array.isArray(extracted)) {
    return extracted as Record<string, unknown>[];
  }
  // Single-object endpoints (e.g. `github.repo` → GET /repos/{owner}/{repo})
  // are wrapped as a 1-row stream so the same `rows` / `union` / `barChart`
  // vocabulary that works for array endpoints works here too — three
  // `github.repo` calls unioned together produces three rows, one per repo,
  // each carrying `stargazers_count` etc.
  if (!entry.responseIsArray && extracted != null && typeof extracted === "object") {
    return [extracted as Record<string, unknown>];
  }
  throw new Error(
    `Expected an array of rows from "${call.endpointId}"` +
      (binding.rowsPath ? ` at path "${binding.rowsPath}"` : "") +
      `, got ${typeof extracted}.`,
  );
}

function compareDefined(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number" &&
      Number.isFinite(a) && Number.isFinite(b)) {
    return a - b;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function applySort(
  rows: Record<string, unknown>[],
  binding: SortBinding,
): Record<string, unknown>[] {
  const sign = binding.direction === "desc" ? -1 : 1;
  return [...rows].sort((ra, rb) => {
    const va = readPath(ra, binding.field);
    const vb = readPath(rb, binding.field);
    // Missing values sort to the end regardless of direction — the
    // useful default for "top N by X" tables.
    const aMissing = va == null;
    const bMissing = vb == null;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return sign * compareDefined(va, vb);
  });
}

function applyLimit(
  rows: Record<string, unknown>[],
  binding: LimitBinding,
): Record<string, unknown>[] {
  if (!Number.isFinite(binding.count) || binding.count < 0) {
    throw new Error(
      `Limit binding count must be a non-negative number, got ${binding.count}.`,
    );
  }
  const n = Math.floor(binding.count);
  return rows.slice(0, n);
}

function applyGroup(
  rows: Record<string, unknown>[],
  binding: GroupBinding,
): Record<string, unknown>[] {
  // Map preserves insertion order in JS, so the first time each key is
  // seen sets its position in the output — downstream charts read the
  // buckets in the same order the input rows arrived (e.g. a `union`'s
  // source order).
  switch (binding.op) {
    case "count": {
      const counts = new Map<unknown, number>();
      for (const row of rows) {
        const key = row[binding.groupBy];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const out: Record<string, unknown>[] = [];
      for (const [key, count] of counts) {
        out.push({ [binding.groupBy]: key, [binding.as]: count });
      }
      return out;
    }
  }
}

async function applyUnion(
  binding: UnionBinding,
  dashboard: Dashboard,
  catalog: CatalogEntry[],
  resolveState: StateResolver | null,
  visiting: Set<string>,
): Promise<Record<string, unknown>[]> {
  // Sources evaluate in parallel; each branch gets its own copy of the
  // visiting set so a sibling adding a shared downstream binding doesn't
  // falsely trigger another sibling's cycle check. Real cycles still
  // surface because the inherited ancestor chain is preserved in each
  // copy, and the chain inside each branch grows independently.
  const results = await Promise.all(
    binding.sources.map(async ({ source, tag }) => {
      const src = dashboard.data[source];
      if (!src) {
        throw new Error(
          `Union binding references unknown source id "${source}".`,
        );
      }
      if (visiting.has(source)) {
        throw new Error(
          `Binding cycle detected at union source "${source}".`,
        );
      }
      const branchVisiting = new Set(visiting);
      branchVisiting.add(source);
      const upstream = await fetchRows(
        src,
        dashboard,
        catalog,
        resolveState,
        branchVisiting,
      );
      return upstream.map((row) => ({ ...row, [binding.tagField]: tag }));
    }),
  );
  const out: Record<string, unknown>[] = [];
  for (const rows of results) out.push(...rows);
  return out;
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
    case "limit": {
      const source = dashboard.data[binding.source];
      if (!source) {
        throw new Error(
          `Limit binding references unknown source id "${binding.source}".`,
        );
      }
      if (visiting.has(binding.source)) {
        throw new Error(
          `Binding cycle detected at limit source "${binding.source}".`,
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
        return applyLimit(upstream, binding);
      } finally {
        visiting.delete(binding.source);
      }
    }
    case "sort": {
      const source = dashboard.data[binding.source];
      if (!source) {
        throw new Error(
          `Sort binding references unknown source id "${binding.source}".`,
        );
      }
      if (visiting.has(binding.source)) {
        throw new Error(
          `Binding cycle detected at sort source "${binding.source}".`,
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
        return applySort(upstream, binding);
      } finally {
        visiting.delete(binding.source);
      }
    }
    case "union":
      return applyUnion(binding, dashboard, catalog, resolveState, visiting);
    case "group": {
      const source = dashboard.data[binding.source];
      if (!source) {
        throw new Error(
          `Group binding references unknown source id "${binding.source}".`,
        );
      }
      if (visiting.has(binding.source)) {
        throw new Error(
          `Binding cycle detected at group source "${binding.source}".`,
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
        return applyGroup(upstream, binding);
      } finally {
        visiting.delete(binding.source);
      }
    }
  }
}
