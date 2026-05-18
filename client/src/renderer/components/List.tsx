/**
 * List layout container — flex with a configurable axis.
 *
 * Mirrors a2ui's basic-catalog List: when `direction === "horizontal"`
 * the list scrolls along the x-axis; otherwise children stack
 * vertically. Children are themselves UI nodes, dispatched through
 * `NodeRenderer`.
 */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { ListNode } from "../../spec";
import { mapAlign } from "./layout";

export function ListRenderer({ node, dashboard }: NodeRendererProps<ListNode>) {
  const horizontal = node.direction === "horizontal";

  const content = (
    <Box
      sx={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        gap: 1.5,
        alignItems: mapAlign(node.align),
        overflowX: horizontal ? "auto" : "hidden",
        overflowY: horizontal ? "hidden" : "visible",
        width: "100%",
      }}
    >
      {node.children.map((child) => (
        <Box
          key={child.id}
          sx={
            horizontal
              ? { flex: "0 0 auto", minWidth: 0 }
              : { width: "100%", minWidth: 0 }
          }
        >
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
