/**
 * Row layout container — horizontal flex.
 *
 * Mirrors a2ui's basic-catalog Row: children laid out left-to-right with
 * configurable main-axis (`justify`) and cross-axis (`align`) placement.
 * Children are themselves UI nodes, dispatched through `NodeRenderer`.
 */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { RowNode } from "../../spec";
import { mapAlign, mapJustify } from "./layout";

export function RowRenderer({ node, dashboard }: NodeRendererProps<RowNode>) {
  const content = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 2,
        justifyContent: mapJustify(node.justify),
        alignItems: mapAlign(node.align),
        width: "100%",
      }}
    >
      {node.children.map((child) => (
        <Box key={child.id} sx={{ flex: "1 1 0", minWidth: 0 }}>
          <NodeRenderer node={child} dashboard={dashboard} />
        </Box>
      ))}
    </Box>
  );

  if (!node.title) return content;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {node.title}
      </Typography>
      {content}
    </Box>
  );
}
