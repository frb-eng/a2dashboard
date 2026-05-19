/**
 * Top-level Dashboard JSON — the contract between the LLM and the client.
 * Three layers, kept separable so the LLM can be steered one at a time
 * and so each layer can grow its own vocabulary independently.
 */

import type { UINode } from "./ui.js";
import type { Binding } from "./data.js";
import type { EndpointCall } from "./endpoint.js";

export interface Dashboard {
  /** Spec version. Bumped when the JSON contract changes shape. */
  version: "0.1";
  /** Human-readable title shown above the dashboard. */
  title: string;
  /** a2UI layer: the visible tree. */
  ui: UINode;
  /** Data-aggregation layer: id -> binding. */
  data: Record<string, Binding>;
  /** Endpoint-requirement layer: id -> concrete endpoint invocation. */
  endpoints: Record<string, EndpointCall>;
}

export type {
  UINode,
  TableNode,
  TableColumn,
  RowNode,
  ColumnNode,
  ListNode,
  CardNode,
  TabsNode,
  TabsTab,
  TextNode,
  TextVariant,
  IconNode,
  IconName,
  TextFieldNode,
  TextFieldVariant,
  ButtonNode,
  ButtonVariant,
  Action,
  LayoutJustify,
  LayoutAlign,
  ListDirection,
} from "./ui.js";
export type { Binding, RowsBinding, FilterBinding, FilterOp } from "./data.js";
export type {
  EndpointCall,
  RefreshPolicy,
  EndpointParamValue,
  StateRef,
} from "./endpoint.js";
