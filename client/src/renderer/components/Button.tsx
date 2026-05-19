/**
 * Button — clickable wrapper that dispatches a declared `action`.
 *
 * Mirrors a2ui's basic-catalog Button: holds a single child UI node
 * (typically a `text` label or an `icon`) and a `variant` style hint
 * ("default" | "primary" | "borderless"). The renderer never executes
 * arbitrary code from the spec — the only actions it knows about are
 * the ones registered in `dispatchAction` below.
 *
 * MVP action: `refresh` — bump the shared dashboard refresh tick so
 * every `useRows` hook re-fires its endpoint against the latest
 * `textField` state. New actions land here as new switch arms.
 */

import MuiButton from "@mui/material/Button";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { ButtonAction, ButtonNode, ButtonVariant } from "../../spec";
import { useDashboardState } from "../DashboardStateContext";

function muiVariant(variant: ButtonVariant | undefined): "contained" | "outlined" | "text" {
  switch (variant) {
    case "primary":
      return "contained";
    case "borderless":
      return "text";
    case "default":
    case undefined:
    default:
      return "outlined";
  }
}

function muiColor(variant: ButtonVariant | undefined): "primary" | "inherit" {
  return variant === "primary" ? "primary" : "inherit";
}

export function ButtonRenderer({ node, dashboard }: NodeRendererProps<ButtonNode>) {
  const { refreshAll } = useDashboardState();

  const dispatchAction = (action: ButtonAction) => {
    switch (action.kind) {
      case "refresh":
        refreshAll();
        return;
    }
  };

  return (
    <MuiButton
      variant={muiVariant(node.variant)}
      color={muiColor(node.variant)}
      onClick={() => dispatchAction(node.action)}
      size="small"
    >
      <NodeRenderer node={node.child} dashboard={dashboard} />
    </MuiButton>
  );
}
