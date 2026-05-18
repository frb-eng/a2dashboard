/**
 * CSS mappings shared by the layout containers (Row, Column, List).
 *
 * Lifted from the equivalent helpers in Google's a2ui React renderer so
 * a dashboard spec that uses the same vocabulary (start / center / end /
 * spaceBetween / …) maps to flexbox the same way.
 */

import type { CSSProperties } from "react";
import type { LayoutAlign, LayoutJustify } from "../../spec";

export function mapJustify(j?: LayoutJustify): CSSProperties["justifyContent"] {
  switch (j) {
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "spaceAround":
      return "space-around";
    case "spaceBetween":
      return "space-between";
    case "spaceEvenly":
      return "space-evenly";
    case "start":
    default:
      return "flex-start";
  }
}

export function mapAlign(a?: LayoutAlign): CSSProperties["alignItems"] {
  switch (a) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "stretch":
    default:
      return "stretch";
  }
}
