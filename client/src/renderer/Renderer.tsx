/**
 * Dashboard renderer entry point.
 *
 * Looks up the root `ui` node's `type` in the component registry and
 * dispatches. Mirrors the a2ui React renderer's `ComponentNode` pattern:
 * the renderer holds no per-primitive logic — that lives in the
 * registered components.
 */

import Alert from "@mui/material/Alert";
import type { Dashboard } from "../spec";
import { get, register } from "./registry";
import { TableRenderer } from "./components/Table";

register("table", TableRenderer);

interface RendererProps {
  dashboard: Dashboard;
}

export function Renderer({ dashboard }: RendererProps) {
  const node = dashboard.ui;
  const Component = get(node.type);
  if (!Component) {
    return (
      <Alert severity="error">
        Unknown UI primitive: <code>{node.type}</code>.
      </Alert>
    );
  }
  return <Component node={node} dashboard={dashboard} />;
}
