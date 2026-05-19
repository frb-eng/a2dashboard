/**
 * TextField — text input that writes to a named state slot.
 *
 * Mirrors a2ui's basic-catalog TextField: a labeled input with a
 * `variant` hint ("shortText" | "longText" | "number" | "obscured").
 * The user-typed value flows into the dashboard's shared state map
 * keyed by `stateKey`; endpoint params declared with that same
 * `stateKey` consume it at the next refresh.
 *
 * Writes do NOT auto-refresh data. A `button` with action `refresh` is
 * the explicit "go" — matching the conventional form-submit pattern
 * and avoiding a fetch storm on every keystroke.
 */

import MuiTextField from "@mui/material/TextField";

import type { NodeRendererProps } from "../registry";
import type { TextFieldNode, TextFieldVariant } from "../../spec";
import { useStateSlot } from "../DashboardStateContext";

function muiType(variant: TextFieldVariant | undefined): string | undefined {
  switch (variant) {
    case "number":
      return "number";
    case "obscured":
      return "password";
    case "shortText":
    case "longText":
    case undefined:
    default:
      return undefined;
  }
}

export function TextFieldRenderer({ node }: NodeRendererProps<TextFieldNode>) {
  const [value, setValue] = useStateSlot(node.stateKey);
  const multiline = node.variant === "longText";

  return (
    <MuiTextField
      label={node.label}
      placeholder={node.placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      type={muiType(node.variant)}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      size="small"
      fullWidth
    />
  );
}
