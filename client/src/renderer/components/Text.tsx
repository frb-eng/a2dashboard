/**
 * Text display leaf.
 *
 * Mirrors a2ui's basic-catalog Text variant hint, mapped onto MUI's
 * `Typography` variants. When `field` is set and a `RowContext` is
 * available (i.e. this text sits inside a table cell), the row value at
 * that dotted path is shown instead of the literal `text`.
 *
 * Kept deliberately simple: no markdown, no template interpolation —
 * one variant, one resolved value.
 */

import Typography from "@mui/material/Typography";
import type { TypographyProps } from "@mui/material/Typography";

import type { NodeRendererProps } from "../registry";
import type { TextNode, TextVariant } from "../../spec";
import { readPath } from "../data";
import { useRowContext } from "../RowContext";

function muiVariant(variant: TextVariant | undefined): TypographyProps["variant"] {
  switch (variant) {
    case "h1":
      return "h5";
    case "h2":
      return "h6";
    case "h3":
      return "subtitle1";
    case "h4":
      return "subtitle2";
    case "h5":
      return "body1";
    case "caption":
      return "caption";
    case "body":
    default:
      return "body2";
  }
}

function isPrintable(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

export function TextRenderer({ node }: NodeRendererProps<TextNode>) {
  const row = useRowContext();
  let content: string;
  if (node.field && row) {
    const v = readPath(row, node.field);
    content = isPrintable(v) ? String(v) : v == null ? "" : JSON.stringify(v);
  } else {
    content = node.text ?? "";
  }
  return <Typography variant={muiVariant(node.variant)}>{content}</Typography>;
}
