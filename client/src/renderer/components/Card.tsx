/**
 * Card container — bordered, elevated single-child wrapper.
 *
 * Mirrors a2ui's basic-catalog Card: exactly one child, surrounded by a
 * panel with padding and a subtle shadow. To put multiple elements in a
 * card, the spec is expected to wrap them in a `row`/`column`/`list`
 * first; the renderer doesn't try to recover from a multi-child card.
 */

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { CardNode } from "../../spec";

export function CardRenderer({ node, dashboard }: NodeRendererProps<CardNode>) {
  return (
    <Paper variant="outlined" sx={{ p: 2, width: "100%" }}>
      {node.title && (
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          {node.title}
        </Typography>
      )}
      <Box sx={{ minWidth: 0 }}>
        <NodeRenderer node={node.child} dashboard={dashboard} />
      </Box>
    </Paper>
  );
}
