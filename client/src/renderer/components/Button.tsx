/**
 * Button — clickable wrapper that dispatches a declared `action`.
 *
 * Mirrors a2ui's basic-catalog Button: holds a single child UI node
 * (typically a `text` label or an `icon`) and a `variant` style hint
 * ("default" | "primary" | "borderless"). The renderer never executes
 * arbitrary code from the spec — the only actions it knows about are
 * the ones in `dispatchAction` (shared with `table.onRowClick`).
 *
 * When a button sits inside a table cell the dispatch picks up that
 * cell's row via `RowContext`, so a `setStateAndRefresh` action can
 * read its `valueField` from the row — e.g. a per-row "Select" button.
 */

import MuiButton from "@mui/material/Button";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { ButtonNode, ButtonVariant } from "../../spec";
import { useDashboardState } from "../DashboardStateContext";
import { useRowContext } from "../RowContext";
import { dispatchAction } from "../dispatchAction";

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
  const { setValue, refreshAll } = useDashboardState();
  const row = useRowContext();

  return (
    <MuiButton
      variant={muiVariant(node.variant)}
      color={muiColor(node.variant)}
      onClick={() => dispatchAction(node.action, { row, setValue, refreshAll })}
      size="small"
    >
      <NodeRenderer node={node.child} dashboard={dashboard} />
    </MuiButton>
  );
}
