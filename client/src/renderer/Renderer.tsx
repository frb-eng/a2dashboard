/**
 * Dashboard renderer entry point.
 *
 * Registers every primitive in the registry, then dispatches the root
 * `ui` node through `NodeRenderer`. Mirrors a2ui's React renderer
 * pattern: the entry point holds no per-primitive logic — that lives in
 * the registered components — and layout containers re-enter the same
 * `NodeRenderer` to render their children.
 */

import type { Dashboard } from "../spec";
import { NodeRenderer, register } from "./registry";
import { TableRenderer } from "./components/Table";
import { BarChartRenderer } from "./components/BarChart";
import { RowRenderer } from "./components/Row";
import { ColumnRenderer } from "./components/Column";
import { ListRenderer } from "./components/List";
import { CardRenderer } from "./components/Card";
import { TabsRenderer } from "./components/Tabs";
import { TextRenderer } from "./components/Text";
import { IconRenderer } from "./components/Icon";
import { TextFieldRenderer } from "./components/TextField";
import { ButtonRenderer } from "./components/Button";
import { DashboardStateProvider } from "./DashboardStateContext";

register("table", TableRenderer);
register("barChart", BarChartRenderer);
register("row", RowRenderer);
register("column", ColumnRenderer);
register("list", ListRenderer);
register("card", CardRenderer);
register("tabs", TabsRenderer);
register("text", TextRenderer);
register("icon", IconRenderer);
register("textField", TextFieldRenderer);
register("button", ButtonRenderer);

interface RendererProps {
  dashboard: Dashboard;
}

export function Renderer({ dashboard }: RendererProps) {
  // The provider holds the textField slot map and refresh tick. Slots
  // persist across turn-by-turn patches so the user's typed values
  // survive iteration; the parent (DashboardView) keys this whole subtree
  // by session id so switching sessions does reset state.
  return (
    <DashboardStateProvider root={dashboard.ui}>
      <NodeRenderer node={dashboard.ui} dashboard={dashboard} />
    </DashboardStateProvider>
  );
}
