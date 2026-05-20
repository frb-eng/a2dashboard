/**
 * Cytoscape-based diagram of the dashboard spec.
 *
 * The graph is computed deterministically by `buildGraph(dashboard)`
 * and rendered directly with Cytoscape, so what you see is exactly
 * what's in the JSON. Layout is `dagre` (layered DAG, left-to-right):
 * the dashboard graph is genuinely layered — UI → data → endpoint →
 * state — with cross-layer arrows for `rows`, `source`, `endpoint`,
 * state writes, and param refs.
 */

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type StylesheetJson,
} from "cytoscape";
import dagre, { type DagreLayoutOptions } from "cytoscape-dagre";

import type { Dashboard } from "../spec";
import { buildGraph } from "../diagram/buildGraph";

cytoscape.use(dagre);

const dagreLayout = (opts: DagreLayoutOptions): cytoscape.LayoutOptions =>
  opts as unknown as cytoscape.LayoutOptions;

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "240px",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-family":
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "line-height": 1.3,
      width: "label",
      height: "label",
      padding: "10px",
      "border-width": 1.5,
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[layer = "ui"]',
    style: {
      "background-color": "#eef5ff",
      "border-color": "#0366d6",
      color: "#022c54",
    },
  },
  {
    selector: 'node[layer = "data"]',
    style: {
      "background-color": "#f4ffeb",
      "border-color": "#52a300",
      color: "#274a00",
      shape: "ellipse",
    },
  },
  {
    selector: 'node[layer = "endpoint"]',
    style: {
      "background-color": "#fff5eb",
      "border-color": "#d67a00",
      color: "#4a2a00",
      shape: "rectangle",
    },
  },
  {
    selector: 'node[layer = "state"]',
    style: {
      "background-color": "#faf0ff",
      "border-color": "#8a2be2",
      color: "#2a004a",
      shape: "diamond",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#8a94a6",
      "target-arrow-color": "#8a94a6",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 10,
      "font-family":
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      color: "#445063",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
      "text-rotation": "autorotate",
    },
  },
  {
    selector: 'edge[style = "dotted"]',
    style: {
      "line-style": "dashed",
      "line-color": "#b25fe2",
      "target-arrow-color": "#b25fe2",
      color: "#5a1880",
    },
  },
];

function toElements(dashboard: Dashboard): ElementDefinition[] {
  const graph = buildGraph(dashboard);
  const nodes: ElementDefinition[] = graph.nodes.map((n) => ({
    data: { id: n.id, label: n.label, layer: n.layer },
  }));
  const edges: ElementDefinition[] = graph.edges.map((e) => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? "",
      style: e.style,
    },
  }));
  return [...nodes, ...edges];
}

interface Props {
  dashboard: Dashboard;
}

export function DashboardDiagramView({ dashboard }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(dashboard),
      style: STYLE,
      layout: dagreLayout({
        name: "dagre",
        rankDir: "LR",
        nodeSep: 30,
        rankSep: 80,
        edgeSep: 12,
        fit: true,
        padding: 24,
      }),
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [dashboard]);

  const fit = () => cyRef.current?.fit(undefined, 24);

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Dashboard diagram
        </Typography>
        <Button size="small" onClick={fit}>
          Fit
        </Button>
      </Stack>
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "70vh",
          minHeight: 360,
          bgcolor: "background.default",
        }}
      />
    </Paper>
  );
}
