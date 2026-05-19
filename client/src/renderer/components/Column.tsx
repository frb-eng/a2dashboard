/**
 * Column layout container — vertical flex.
 *
 * Mirrors a2ui's basic-catalog Column: children laid out top-to-bottom
 * with configurable main-axis (`justify`) and cross-axis (`align`)
 * placement. Children are themselves UI nodes, dispatched through
 * `NodeRenderer`.
 */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { ColumnNode } from "../../spec";
import { mapAlign, mapJustify } from "./layout";

export function ColumnRenderer({ node, dashboard }: NodeRendererProps<ColumnNode>) {
  const content = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        justifyContent: mapJustify(node.justify),
        alignItems: mapAlign(node.align),
        width: "100%",
      }}
    >
      {node.children.map((child) => (
        <Box key={child.id} sx={{ width: "100%", minWidth: 0 }}>
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
