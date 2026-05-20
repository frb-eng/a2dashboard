/**
 * Deterministic dashboard → diagram graph.
 *
 * Walks a Dashboard JSON spec and produces a typed `{ nodes, edges }`
 * structure that the Cytoscape view renders directly. No LLM, no
 * intermediate string format — every node and edge corresponds to a
 * concrete construct in the spec, by code, so the picture is exactly
 * what's there.
 *
 * Four layers:
 *   - `ui`       — one node per UI component reached by walking `ui`.
 *   - `data`     — one node per entry in `data` (rows/filter/sort/limit/union/group).
 *   - `endpoint` — one node per entry in `endpoints`.
 *   - `state`    — one node per distinct stateKey referenced anywhere
 *                  (textField writes, endpoint param refs, filter value
 *                  refs, setStateAndRefresh actions).
 *
 * Node ids are prefixed by layer so a state slot and a binding can share
 * a name without colliding.
 */

import type {
  Action,
  Binding,
  Dashboard,
  EndpointCall,
  EndpointParamValue,
  StateRef,
  UINode,
} from "../spec";

export type DiagramLayer = "ui" | "data" | "endpoint" | "state";

export interface DiagramNode {
  id: string;
  layer: DiagramLayer;
  label: string;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style: "solid" | "dotted";
}

export interface DiagramGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const PREFIX: Record<DiagramLayer, string> = {
  ui: "ui:",
  data: "data:",
  endpoint: "ep:",
  state: "state:",
};

const nodeId = (layer: DiagramLayer, raw: string): string =>
  PREFIX[layer] + raw;

const isStateRef = (v: EndpointParamValue): v is StateRef =>
  typeof v === "object" && v !== null && "stateKey" in v;

function paramSummary(call: EndpointCall): string {
  const parts = Object.entries(call.params).map(([k, v]) =>
    isStateRef(v) ? `${k}={${v.stateKey}}` : `${k}=${String(v)}`,
  );
  return parts.join(", ");
}

function uiLabel(node: UINode): string {
  const head = `${node.type}: ${node.id}`;
  switch (node.type) {
    case "row":
    case "column":
    case "list":
    case "card":
    case "tabs":
    case "barChart":
      return node.title ? `${head}\n${node.title}` : head;
    case "table": {
      const lines = [head];
      if (node.title) lines.push(node.title);
      if (node.columns.length > 0) {
        lines.push(`columns: ${node.columns.map((c) => c.header).join(" · ")}`);
      }
      return lines.join("\n");
    }
    case "text":
      if (node.field) return `${head}\nfield: ${node.field}`;
      if (node.text) return `${head}\n${node.text}`;
      return head;
    case "icon":
      return `${head}\n${node.name}`;
    case "textField":
      return `${head}\n${node.label}`;
    case "button": {
      const child = node.child;
      if (child.type === "text" && child.text) return `${head}\n${child.text}`;
      if (child.type === "icon") return `${head}\n${child.name}`;
      return head;
    }
  }
}

function dataLabel(id: string, b: Binding): string {
  const head = `${b.type}: ${id}`;
  switch (b.type) {
    case "rows":
      return `${head}\nendpoint: ${b.endpoint}`;
    case "filter": {
      const value = isStateRef(b.value)
        ? `{stateKey:${b.value.stateKey}}`
        : String(b.value);
      return `${head}\nfield=${b.field}, op=${b.op}, value=${value}`;
    }
    case "sort":
      return `${head}\nfield=${b.field}, dir=${b.direction}`;
    case "limit":
      return `${head}\ncount=${b.count}`;
    case "union":
      return `${head}\ntagField=${b.tagField}`;
    case "group":
      return `${head}\ngroupBy=${b.groupBy}, op=${b.op}, as=${b.as}`;
  }
}

function endpointLabel(entryId: string, call: EndpointCall): string {
  const lines = [entryId, call.endpointId];
  const params = paramSummary(call);
  if (params) lines.push(params);
  return lines.join("\n");
}

interface Ctx {
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  edgeSeq: number;
}

function ensureNode(ctx: Ctx, node: DiagramNode): void {
  if (!ctx.nodes.has(node.id)) ctx.nodes.set(node.id, node);
}

function ensureStateNode(ctx: Ctx, stateKey: string): void {
  ensureNode(ctx, {
    id: nodeId("state", stateKey),
    layer: "state",
    label: stateKey,
  });
}

function addEdge(
  ctx: Ctx,
  source: string,
  target: string,
  style: "solid" | "dotted",
  label?: string,
): void {
  ctx.edges.push({
    id: `e${ctx.edgeSeq++}`,
    source,
    target,
    style,
    label,
  });
}

function actionWritesState(action: Action | undefined): action is {
  kind: "setStateAndRefresh";
  stateKey: string;
  valueField: string;
} {
  return action !== undefined && action.kind === "setStateAndRefresh";
}

function walkUI(node: UINode, ctx: Ctx, parentId?: string): void {
  const id = nodeId("ui", node.id);
  ensureNode(ctx, { id, layer: "ui", label: uiLabel(node) });
  if (parentId) addEdge(ctx, parentId, id, "solid");

  switch (node.type) {
    case "row":
    case "column":
    case "list":
      for (const c of node.children) walkUI(c, ctx, id);
      return;
    case "card":
      walkUI(node.child, ctx, id);
      return;
    case "tabs":
      for (const t of node.tabs) {
        walkUI(t.child, ctx, id);
        addEdge(ctx, id, nodeId("ui", t.child.id), "solid", t.title);
      }
      return;
    case "button":
      walkUI(node.child, ctx, id);
      if (actionWritesState(node.action)) {
        ensureStateNode(ctx, node.action.stateKey);
        addEdge(
          ctx,
          id,
          nodeId("state", node.action.stateKey),
          "dotted",
          `setState ${node.action.valueField}`,
        );
      }
      return;
    case "table":
      for (const col of node.columns) {
        if (col.cell) walkUI(col.cell, ctx, id);
      }
      addEdge(ctx, id, nodeId("data", node.rows), "solid", "rows");
      if (actionWritesState(node.onRowClick)) {
        ensureStateNode(ctx, node.onRowClick.stateKey);
        addEdge(
          ctx,
          id,
          nodeId("state", node.onRowClick.stateKey),
          "dotted",
          `onRowClick ${node.onRowClick.valueField}`,
        );
      }
      return;
    case "barChart":
      addEdge(ctx, id, nodeId("data", node.rows), "solid", "rows");
      return;
    case "textField":
      ensureStateNode(ctx, node.stateKey);
      addEdge(
        ctx,
        id,
        nodeId("state", node.stateKey),
        "dotted",
        "writes",
      );
      return;
    case "text":
    case "icon":
      return;
  }
}

export function buildGraph(d: Dashboard): DiagramGraph {
  const ctx: Ctx = { nodes: new Map(), edges: [], edgeSeq: 0 };

  walkUI(d.ui, ctx);

  for (const [bid, b] of Object.entries(d.data)) {
    const id = nodeId("data", bid);
    ensureNode(ctx, { id, layer: "data", label: dataLabel(bid, b) });
    switch (b.type) {
      case "rows":
        addEdge(ctx, id, nodeId("endpoint", b.endpoint), "solid", "endpoint");
        break;
      case "filter":
        addEdge(ctx, id, nodeId("data", b.source), "solid", "source");
        if (isStateRef(b.value)) {
          ensureStateNode(ctx, b.value.stateKey);
          addEdge(
            ctx,
            id,
            nodeId("state", b.value.stateKey),
            "dotted",
            "value",
          );
        }
        break;
      case "sort":
      case "limit":
      case "group":
        addEdge(ctx, id, nodeId("data", b.source), "solid", "source");
        break;
      case "union":
        for (const s of b.sources) {
          addEdge(ctx, id, nodeId("data", s.source), "solid", s.tag);
        }
        break;
    }
  }

  for (const [eid, call] of Object.entries(d.endpoints)) {
    const id = nodeId("endpoint", eid);
    ensureNode(ctx, { id, layer: "endpoint", label: endpointLabel(eid, call) });
    for (const [paramName, v] of Object.entries(call.params)) {
      if (isStateRef(v)) {
        ensureStateNode(ctx, v.stateKey);
        addEdge(ctx, id, nodeId("state", v.stateKey), "dotted", paramName);
      }
    }
  }

  return {
    nodes: Array.from(ctx.nodes.values()),
    edges: ctx.edges,
  };
}
