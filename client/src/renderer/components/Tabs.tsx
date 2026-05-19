/**
 * Tabs container — switcher between several titled child views.
 *
 * Mirrors a2ui's basic-catalog Tabs: a horizontal tab strip plus a panel
 * showing the active tab's child. Active-tab state lives locally in the
 * renderer — the spec only describes the structure, not which tab is
 * selected.
 *
 * Tab strip uses MUI's `Tabs`/`Tab`; only the active panel is mounted,
 * so a heavy table inside an inactive tab won't fetch until the user
 * switches to it.
 */

import { useState } from "react";
import Box from "@mui/material/Box";
import MuiTab from "@mui/material/Tab";
import MuiTabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { TabsNode } from "../../spec";

export function TabsRenderer({ node, dashboard }: NodeRendererProps<TabsNode>) {
  const safeTabs = node.tabs.length > 0 ? node.tabs : null;
  const [index, setIndex] = useState(0);

  if (!safeTabs) {
    return (
      <Typography variant="body2" color="text.secondary">
        (no tabs)
      </Typography>
    );
  }

  const clamped = Math.min(index, safeTabs.length - 1);
  const active = safeTabs[clamped]!;

  return (
    <Box sx={{ width: "100%" }}>
      {node.title && (
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {node.title}
        </Typography>
      )}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <MuiTabs
          value={clamped}
          onChange={(_, v: number) => setIndex(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {safeTabs.map((tab, i) => (
            <MuiTab key={`${tab.child.id}-${i}`} label={tab.title} />
          ))}
        </MuiTabs>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <NodeRenderer node={active.child} dashboard={dashboard} />
      </Box>
    </Box>
  );
}
