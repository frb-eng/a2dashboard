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
import { RowRenderer } from "./components/Row";
import { ColumnRenderer } from "./components/Column";
import { ListRenderer } from "./components/List";
import { CardRenderer } from "./components/Card";
import { TabsRenderer } from "./components/Tabs";

register("table", TableRenderer);
register("row", RowRenderer);
register("column", ColumnRenderer);
register("list", ListRenderer);
register("card", CardRenderer);
register("tabs", TabsRenderer);

interface RendererProps {
  dashboard: Dashboard;
}

export function Renderer({ dashboard }: RendererProps) {
  return <NodeRenderer node={dashboard.ui} dashboard={dashboard} />;
}
