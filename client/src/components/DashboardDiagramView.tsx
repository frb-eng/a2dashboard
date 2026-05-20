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
import { buildGraph, type DiagramLayer } from "../diagram/buildGraph";

cytoscape.use(dagre);

const dagreLayout = (opts: DagreLayoutOptions): cytoscape.LayoutOptions =>
  opts as unknown as cytoscape.LayoutOptions;

type ShapeKind = "round-rectangle" | "ellipse" | "rectangle" | "diamond";

interface LayerStyle {
  shape: ShapeKind;
  fill: string;
  border: string;
  text: string;
  label: string;
  hint: string;
}

const LAYER_STYLES: Record<DiagramLayer, LayerStyle> = {
  ui: {
    shape: "round-rectangle",
    fill: "#eef5ff",
    border: "#0366d6",
    text: "#022c54",
    label: "UI",
    hint: "renderable component",
  },
  data: {
    shape: "ellipse",
    fill: "#f4ffeb",
    border: "#52a300",
    text: "#274a00",
    label: "Data",
    hint: "binding (rows / filter / sort / limit / union / group)",
  },
  endpoint: {
    shape: "rectangle",
    fill: "#fff5eb",
    border: "#d67a00",
    text: "#4a2a00",
    label: "Endpoint",
    hint: "REST call from the catalog",
  },
  state: {
    shape: "diamond",
    fill: "#faf0ff",
    border: "#8a2be2",
    text: "#2a004a",
    label: "State",
    hint: "shared state slot (stateKey)",
  },
};

const EDGE_SOLID = { line: "#8a94a6", text: "#445063" };
const EDGE_DOTTED = { line: "#b25fe2", text: "#5a1880" };

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
    },
  },
  ...(Object.entries(LAYER_STYLES) as [DiagramLayer, LayerStyle][]).map(
    ([layer, s]) => ({
      selector: `node[layer = "${layer}"]`,
      style: {
        shape: s.shape,
        "background-color": s.fill,
        "border-color": s.border,
        color: s.text,
      },
    }),
  ),
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": EDGE_SOLID.line,
      "target-arrow-color": EDGE_SOLID.line,
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 10,
      "font-family":
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      color: EDGE_SOLID.text,
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
      "line-color": EDGE_DOTTED.line,
      "target-arrow-color": EDGE_DOTTED.line,
      color: EDGE_DOTTED.text,
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

function NodeSwatch({ style }: { style: LayerStyle }) {
  const stroke = { fill: style.fill, stroke: style.border, strokeWidth: 1.5 };
  return (
    <svg width={28} height={18} viewBox="0 0 28 18" aria-hidden>
      {style.shape === "round-rectangle" && (
        <rect x={2} y={2} width={24} height={14} rx={4} ry={4} {...stroke} />
      )}
      {style.shape === "rectangle" && (
        <rect x={2} y={2} width={24} height={14} {...stroke} />
      )}
      {style.shape === "ellipse" && (
        <ellipse cx={14} cy={9} rx={12} ry={7} {...stroke} />
      )}
      {style.shape === "diamond" && (
        <polygon points="14,1 27,9 14,17 1,9" {...stroke} />
      )}
    </svg>
  );
}

function EdgeSwatch({
  color,
  dashed,
}: {
  color: string;
  dashed: boolean;
}) {
  return (
    <svg width={36} height={12} viewBox="0 0 36 12" aria-hidden>
      <line
        x1={2}
        y1={6}
        x2={28}
        y2={6}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <polygon points="28,2 34,6 28,10" fill={color} />
    </svg>
  );
}

function Legend() {
  const itemSx = {
    display: "flex",
    alignItems: "center",
    gap: 0.75,
  } as const;
  return (
    <Stack
      direction="row"
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      sx={{
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        rowGap: 0.75,
        columnGap: 2,
        bgcolor: "background.paper",
      }}
    >
      {(Object.values(LAYER_STYLES) as LayerStyle[]).map((s) => (
        <Box key={s.label} sx={itemSx} title={s.hint}>
          <NodeSwatch style={s} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {s.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {s.hint}
          </Typography>
        </Box>
      ))}
      <Box sx={itemSx} title="containment, rows, source, endpoint, union tag">
        <EdgeSwatch color={EDGE_SOLID.line} dashed={false} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Data flow
        </Typography>
        <Typography variant="caption" color="text.secondary">
          containment · rows · source · endpoint
        </Typography>
      </Box>
      <Box
        sx={itemSx}
        title="textField writes, setStateAndRefresh, filter / endpoint state refs"
      >
        <EdgeSwatch color={EDGE_DOTTED.line} dashed />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          State ref
        </Typography>
        <Typography variant="caption" color="text.secondary">
          writes · setState · param ref
        </Typography>
      </Box>
    </Stack>
  );
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
      <Legend />
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
