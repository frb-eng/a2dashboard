/**
 * Component registry + recursive node dispatch.
 *
 * Maps a UI node's `type` discriminator to the React component that
 * renders it. Mirrors the registry pattern from Google's a2ui React
 * renderer: the renderer never imports concrete component files, it just
 * looks them up by name. Adding a new UI primitive means registering a
 * new entry here and a matching variant in the spec — nothing in the
 * dispatch path changes.
 *
 * `NodeRenderer` is exposed so layout containers can recursively render
 * their children without re-implementing dispatch.
 */

import type { ComponentType } from "react";
import Alert from "@mui/material/Alert";
import type { Dashboard, UINode } from "../spec";

export interface NodeRendererProps<N extends UINode = UINode> {
  node: N;
  dashboard: Dashboard;
}

type NodeOfType<T extends UINode["type"]> = Extract<UINode, { type: T }>;

const registry = new Map<string, ComponentType<NodeRendererProps>>();

export function register<T extends UINode["type"]>(
  type: T,
  component: ComponentType<NodeRendererProps<NodeOfType<T>>>,
): void {
  registry.set(type, component as ComponentType<NodeRendererProps>);
}

export function get(type: string): ComponentType<NodeRendererProps> | null {
  return registry.get(type) ?? null;
}

export function NodeRenderer({ node, dashboard }: NodeRendererProps) {
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
