/**
 * OpenAI integration for dashboard generation.
 *
 * Uses Chat Completions with strict JSON-schema structured outputs.
 *
 * OpenAI strict mode disallows open-ended object maps (no
 * `additionalProperties: true`) and discourages recursive `$ref` shapes,
 * so the LLM emits an *intermediate* shape where every layer is a flat
 * array of `{ id, value }` entries:
 *
 *   - `componentEntries[]` — every UI node (table / row / column / list)
 *     in a flat array. Layout containers reference their children by id
 *     via `childIds`. The server resolves this into the nested tree shape
 *     used by the renderer.
 *   - `dataEntries[]`     — bindings (id -> binding).
 *   - `endpointEntries[]` — endpoint invocations (id -> call).
 *
 * The public Dashboard contract is unchanged: `ui` is the resolved tree
 * with inline `children: UINode[]`, and `data`/`endpoints` are
 * `Record<string, ...>` maps.
 *
 * Iterating on a dashboard: the client may pass a `currentDashboard`
 * and `history` of prior turns. The system prompt instructs the model
 * to patch the existing JSON (preserving ids) rather than rewriting,
 * matching the "patches, not rewrites" rule in AGENTS.md.
 *
 * Model choice: `gpt-5-mini`. The output is small structured JSON, the
 * prompt is interactive (latency-sensitive), and the model needs enough
 * reasoning to honor the spec + endpoint catalog without drifting.
 * gpt-5 is overkill for ~1 KB of JSON; gpt-5-nano is unreliable on
 * schema discipline; non-reasoning models need more prompt scaffolding.
 */

import OpenAI from "openai";
import type { Dashboard } from "./spec/dashboard.js";
import type { UINode } from "./spec/ui.js";
import { githubCatalog } from "./catalog/github.js";

export const MODEL = "gpt-5-mini";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const JUSTIFY_VALUES = [
  "start",
  "center",
  "end",
  "spaceBetween",
  "spaceAround",
  "spaceEvenly",
] as const;
const ALIGN_VALUES = ["start", "center", "end", "stretch"] as const;
const DIRECTION_VALUES = ["vertical", "horizontal"] as const;

type IntermediateJustify = (typeof JUSTIFY_VALUES)[number];
type IntermediateAlign = (typeof ALIGN_VALUES)[number];
type IntermediateDirection = (typeof DIRECTION_VALUES)[number];

interface IntermediateTableColumn {
  id: string;
  header: string;
  /** Dotted path into the row, used when `cellId` is null. */
  field: string | null;
  /** Optional id of a component (in `componentEntries`) rendered inside each cell. */
  cellId: string | null;
}

interface IntermediateTableComponent {
  type: "table";
  id: string;
  title: string | null;
  rows: string;
  columns: IntermediateTableColumn[];
  /** Action dispatched on row click. Null when rows are inert. */
  onRowClick: IntermediateAction | null;
}

interface IntermediateBarChartComponent {
  type: "barChart";
  id: string;
  title: string | null;
  rows: string;
  categoryField: string;
  valueField: string;
  /** Dotted path used to group rows into named series; null for single-series. */
  seriesField: string | null;
}

interface IntermediateRowComponent {
  type: "row";
  id: string;
  title: string | null;
  childIds: string[];
  justify: IntermediateJustify | null;
  align: IntermediateAlign | null;
}

interface IntermediateColumnComponent {
  type: "column";
  id: string;
  title: string | null;
  childIds: string[];
  justify: IntermediateJustify | null;
  align: IntermediateAlign | null;
}

interface IntermediateListComponent {
  type: "list";
  id: string;
  title: string | null;
  childIds: string[];
  direction: IntermediateDirection | null;
  align: IntermediateAlign | null;
}

interface IntermediateCardComponent {
  type: "card";
  id: string;
  title: string | null;
  childId: string;
}

interface IntermediateTabsTab {
  title: string;
  childId: string;
}

interface IntermediateTabsComponent {
  type: "tabs";
  id: string;
  title: string | null;
  tabs: IntermediateTabsTab[];
}

const TEXT_VARIANT_VALUES = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "caption",
  "body",
] as const;
type IntermediateTextVariant = (typeof TEXT_VARIANT_VALUES)[number];

interface IntermediateTextComponent {
  type: "text";
  id: string;
  text: string | null;
  field: string | null;
  variant: IntermediateTextVariant | null;
}

const ICON_NAME_VALUES = [
  "accountCircle",
  "add",
  "arrowBack",
  "arrowForward",
  "calendarToday",
  "check",
  "close",
  "delete",
  "download",
  "edit",
  "error",
  "favorite",
  "folder",
  "help",
  "home",
  "info",
  "lock",
  "lockOpen",
  "mail",
  "menu",
  "person",
  "refresh",
  "search",
  "send",
  "settings",
  "share",
  "star",
  "upload",
  "visibility",
  "visibilityOff",
  "warning",
] as const;
type IntermediateIconName = (typeof ICON_NAME_VALUES)[number];

interface IntermediateIconComponent {
  type: "icon";
  id: string;
  name: IntermediateIconName;
}

const TEXTFIELD_VARIANT_VALUES = [
  "shortText",
  "longText",
  "number",
  "obscured",
] as const;
type IntermediateTextFieldVariant = (typeof TEXTFIELD_VARIANT_VALUES)[number];

interface IntermediateTextFieldComponent {
  type: "textField";
  id: string;
  label: string;
  stateKey: string;
  defaultValue: string | null;
  placeholder: string | null;
  variant: IntermediateTextFieldVariant | null;
}

const BUTTON_VARIANT_VALUES = ["default", "primary", "borderless"] as const;
type IntermediateButtonVariant = (typeof BUTTON_VARIANT_VALUES)[number];

const ACTION_KIND_VALUES = ["refresh", "setStateAndRefresh"] as const;
type IntermediateActionKind = (typeof ACTION_KIND_VALUES)[number];

/**
 * Action in the LLM-emitted form. `stateKey` and `valueField` are
 * non-null only when `kind === "setStateAndRefresh"`; for `"refresh"`
 * both are null. The server flattens this into the public `Action`
 * union in `toAction` below.
 */
interface IntermediateAction {
  kind: IntermediateActionKind;
  stateKey: string | null;
  valueField: string | null;
}

interface IntermediateButtonComponent {
  type: "button";
  id: string;
  childId: string;
  variant: IntermediateButtonVariant | null;
  action: IntermediateAction;
}

type IntermediateComponent =
  | IntermediateTableComponent
  | IntermediateBarChartComponent
  | IntermediateRowComponent
  | IntermediateColumnComponent
  | IntermediateListComponent
  | IntermediateCardComponent
  | IntermediateTabsComponent
  | IntermediateTextComponent
  | IntermediateIconComponent
  | IntermediateTextFieldComponent
  | IntermediateButtonComponent;

interface IntermediateRowsBinding {
  type: "rows";
  endpoint: string;
  rowsPath: string | null;
}

const FILTER_OP_VALUES = ["containsIgnoreCase"] as const;
type IntermediateFilterOp = (typeof FILTER_OP_VALUES)[number];

/**
 * Filter binding in the LLM-emitted form. `value` and `stateKey` use
 * the same exactly-one-non-null discipline as endpoint params — the
 * server flattens them into the public `string | number | boolean |
 * StateRef` union in `toDashboard` below.
 */
interface IntermediateFilterBinding {
  type: "filter";
  source: string;
  field: string;
  op: IntermediateFilterOp;
  value: string | number | boolean | null;
  stateKey: string | null;
}

/**
 * Limit binding in the LLM-emitted form. Truncates `source` rows to at
 * most `count` entries — the "top N" primitive. `count` is a
 * non-negative integer literal.
 */
interface IntermediateLimitBinding {
  type: "limit";
  source: string;
  count: number;
}

const SORT_DIRECTION_VALUES = ["asc", "desc"] as const;
type IntermediateSortDirection = (typeof SORT_DIRECTION_VALUES)[number];

/**
 * Sort binding in the LLM-emitted form. Reorders `source` rows by a
 * single `field` in the given `direction`. Chain with `limit` for
 * "top N by X".
 */
interface IntermediateSortBinding {
  type: "sort";
  source: string;
  field: string;
  direction: IntermediateSortDirection;
}

/**
 * Union binding in the LLM-emitted form. Concatenates rows from several
 * other bindings, stamping each row with the source's `tag` under
 * `tagField`. Downstream consumers (typically a `barChart` with
 * `seriesField` pointing at `tagField`) read the tag back to tell rows
 * apart by origin.
 */
interface IntermediateUnionBinding {
  type: "union";
  sources: { source: string; tag: string }[];
  tagField: string;
}

const GROUP_OP_VALUES = ["count"] as const;
type IntermediateGroupOp = (typeof GROUP_OP_VALUES)[number];

/**
 * Group binding in the LLM-emitted form. Buckets `source` rows by the
 * flat field `groupBy` and emits one output row per distinct key,
 * carrying the key (under `groupBy`) plus the aggregated value (under
 * `as`). Output rows preserve first-seen key order, so the natural
 * "compare N entities by count" pipeline is union → group, with the
 * union's `tagField` doubling as the group's `groupBy`.
 */
interface IntermediateGroupBinding {
  type: "group";
  source: string;
  groupBy: string;
  op: IntermediateGroupOp;
  as: string;
}

type IntermediateBinding =
  | IntermediateRowsBinding
  | IntermediateFilterBinding
  | IntermediateLimitBinding
  | IntermediateSortBinding
  | IntermediateUnionBinding
  | IntermediateGroupBinding;

/**
 * Endpoint param value carried in the LLM-emitted intermediate form.
 *
 * Exactly one of `value` and `stateKey` is non-null:
 *   - `value` set, `stateKey` null  → literal scalar
 *   - `value` null, `stateKey` set → reads the named state slot at fetch
 *                                    time (must match a textField stateKey)
 *
 * Both forms are flattened into the public `EndpointParamValue` union by
 * `toDashboard` below.
 */
interface IntermediateParam {
  name: string;
  value: string | number | boolean | null;
  stateKey: string | null;
}

interface IntermediateCall {
  endpointId: string;
  params: IntermediateParam[];
  refresh: { kind: "manual" | "on-mount" };
}

interface IntermediateDashboard {
  version: "0.1";
  title: string;
  /** Id of the root component in `componentEntries`. */
  uiRootId: string;
  componentEntries: { id: string; component: IntermediateComponent }[];
  dataEntries: { id: string; binding: IntermediateBinding }[];
  endpointEntries: { id: string; call: IntermediateCall }[];
}

interface IntermediateResponse {
  /** Always present — the assistant's chat reply, shown verbatim to the user. */
  reply: string;
  /**
   * The dashboard spec for this turn, or null when the model declined to
   * produce one (e.g. the request was ambiguous, off-topic, or required
   * primitives or endpoints not in the catalog). When null, the previous
   * dashboard remains in place.
   */
  dashboard: IntermediateDashboard | null;
}

function actionSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "stateKey", "valueField"],
    properties: {
      kind: { type: "string", enum: [...ACTION_KIND_VALUES] },
      stateKey: { type: ["string", "null"] },
      valueField: { type: ["string", "null"] },
    },
  };
}

function tableComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "rows", "columns", "onRowClick"],
    properties: {
      type: { type: "string", enum: ["table"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      rows: { type: "string" },
      columns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "header", "field", "cellId"],
          properties: {
            id: { type: "string" },
            header: { type: "string" },
            field: { type: ["string", "null"] },
            cellId: { type: ["string", "null"] },
          },
        },
      },
      onRowClick: { anyOf: [{ type: "null" }, actionSchema()] },
    },
  };
}

function barChartComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "rows", "categoryField", "valueField", "seriesField"],
    properties: {
      type: { type: "string", enum: ["barChart"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      rows: { type: "string" },
      categoryField: { type: "string" },
      valueField: { type: "string" },
      seriesField: { type: ["string", "null"] },
    },
  };
}

function flexComponentSchema(typeLiteral: "row" | "column"): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "childIds", "justify", "align"],
    properties: {
      type: { type: "string", enum: [typeLiteral] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      childIds: { type: "array", items: { type: "string" } },
      justify: { type: ["string", "null"], enum: [...JUSTIFY_VALUES, null] },
      align: { type: ["string", "null"], enum: [...ALIGN_VALUES, null] },
    },
  };
}

function listComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "childIds", "direction", "align"],
    properties: {
      type: { type: "string", enum: ["list"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      childIds: { type: "array", items: { type: "string" } },
      direction: { type: ["string", "null"], enum: [...DIRECTION_VALUES, null] },
      align: { type: ["string", "null"], enum: [...ALIGN_VALUES, null] },
    },
  };
}

function cardComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "childId"],
    properties: {
      type: { type: "string", enum: ["card"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      childId: { type: "string" },
    },
  };
}

function tabsComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "tabs"],
    properties: {
      type: { type: "string", enum: ["tabs"] },
      id: { type: "string" },
      title: { type: ["string", "null"] },
      tabs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "childId"],
          properties: {
            title: { type: "string" },
            childId: { type: "string" },
          },
        },
      },
    },
  };
}

function textComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "text", "field", "variant"],
    properties: {
      type: { type: "string", enum: ["text"] },
      id: { type: "string" },
      text: { type: ["string", "null"] },
      field: { type: ["string", "null"] },
      variant: { type: ["string", "null"], enum: [...TEXT_VARIANT_VALUES, null] },
    },
  };
}

function iconComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "name"],
    properties: {
      type: { type: "string", enum: ["icon"] },
      id: { type: "string" },
      name: { type: "string", enum: [...ICON_NAME_VALUES] },
    },
  };
}

function textFieldComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "label", "stateKey", "defaultValue", "placeholder", "variant"],
    properties: {
      type: { type: "string", enum: ["textField"] },
      id: { type: "string" },
      label: { type: "string" },
      stateKey: { type: "string" },
      defaultValue: { type: ["string", "null"] },
      placeholder: { type: ["string", "null"] },
      variant: { type: ["string", "null"], enum: [...TEXTFIELD_VARIANT_VALUES, null] },
    },
  };
}

function buttonComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "childId", "variant", "action"],
    properties: {
      type: { type: "string", enum: ["button"] },
      id: { type: "string" },
      childId: { type: "string" },
      variant: { type: ["string", "null"], enum: [...BUTTON_VARIANT_VALUES, null] },
      action: actionSchema(),
    },
  };
}

function componentSchema(): Record<string, unknown> {
  return {
    anyOf: [
      tableComponentSchema(),
      barChartComponentSchema(),
      flexComponentSchema("row"),
      flexComponentSchema("column"),
      listComponentSchema(),
      cardComponentSchema(),
      tabsComponentSchema(),
      textComponentSchema(),
      iconComponentSchema(),
      textFieldComponentSchema(),
      buttonComponentSchema(),
    ],
  };
}

function rowsBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "endpoint", "rowsPath"],
    properties: {
      type: { type: "string", enum: ["rows"] },
      endpoint: { type: "string" },
      rowsPath: { type: ["string", "null"] },
    },
  };
}

function filterBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "source", "field", "op", "value", "stateKey"],
    properties: {
      type: { type: "string", enum: ["filter"] },
      source: { type: "string" },
      field: { type: "string" },
      op: { type: "string", enum: [...FILTER_OP_VALUES] },
      value: { type: ["string", "number", "boolean", "null"] },
      stateKey: { type: ["string", "null"] },
    },
  };
}

function limitBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "source", "count"],
    properties: {
      type: { type: "string", enum: ["limit"] },
      source: { type: "string" },
      count: { type: "integer", minimum: 0 },
    },
  };
}

function sortBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "source", "field", "direction"],
    properties: {
      type: { type: "string", enum: ["sort"] },
      source: { type: "string" },
      field: { type: "string" },
      direction: { type: "string", enum: [...SORT_DIRECTION_VALUES] },
    },
  };
}

function unionBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "sources", "tagField"],
    properties: {
      type: { type: "string", enum: ["union"] },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["source", "tag"],
          properties: {
            source: { type: "string" },
            tag: { type: "string" },
          },
        },
      },
      tagField: { type: "string" },
    },
  };
}

function groupBindingSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "source", "groupBy", "op", "as"],
    properties: {
      type: { type: "string", enum: ["group"] },
      source: { type: "string" },
      groupBy: { type: "string" },
      op: { type: "string", enum: [...GROUP_OP_VALUES] },
      as: { type: "string" },
    },
  };
}

function bindingSchema(): Record<string, unknown> {
  return {
    anyOf: [
      rowsBindingSchema(),
      filterBindingSchema(),
      limitBindingSchema(),
      sortBindingSchema(),
      unionBindingSchema(),
      groupBindingSchema(),
    ],
  };
}

function dashboardObjectSchema(): Record<string, unknown> {
  const endpointIds = githubCatalog.map((e) => e.id);
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "title",
      "uiRootId",
      "componentEntries",
      "dataEntries",
      "endpointEntries",
    ],
    properties: {
      version: { type: "string", enum: ["0.1"] },
      title: { type: "string" },
      uiRootId: { type: "string" },
      componentEntries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "component"],
          properties: {
            id: { type: "string" },
            component: componentSchema(),
          },
        },
      },
      dataEntries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "binding"],
          properties: {
            id: { type: "string" },
            binding: bindingSchema(),
          },
        },
      },
      endpointEntries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "call"],
          properties: {
            id: { type: "string" },
            call: {
              type: "object",
              additionalProperties: false,
              required: ["endpointId", "params", "refresh"],
              properties: {
                endpointId: { type: "string", enum: endpointIds },
                params: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "value", "stateKey"],
                    properties: {
                      name: { type: "string" },
                      value: { type: ["string", "number", "boolean", "null"] },
                      stateKey: { type: ["string", "null"] },
                    },
                  },
                },
                refresh: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind"],
                  properties: {
                    kind: { type: "string", enum: ["manual", "on-mount"] },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function responseSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["reply", "dashboard"],
    properties: {
      reply: { type: "string" },
      dashboard: {
        anyOf: [{ type: "null" }, dashboardObjectSchema()],
      },
    },
  };
}

function catalogForPrompt(): string {
  return githubCatalog
    .map((e) => {
      const params = e.params
        .map(
          (p) =>
            `    - ${p.name} (${p.in}, ${p.required ? "required" : "optional"}): ${p.description}`,
        )
        .join("\n");
      const fields = e.rowFields.map((f) => `    - ${f.name}: ${f.type}`).join("\n");
      return `  ${e.id}
    ${e.method} ${e.urlTemplate}
    ${e.description}
    Params:
${params}
    Row fields:
${fields}`;
    })
    .join("\n\n");
}

function systemPrompt(current: Dashboard | null): string {
  const iteration = current
    ? `

YOU ARE ITERATING ON AN EXISTING DASHBOARD. The current spec is shown below. Treat the latest user message as a refinement and PATCH this spec — do not rewrite from scratch.
  - Preserve existing ids (uiRootId, componentEntries[*].id, column ids inside table components, dataEntries[*].id, endpointEntries[*].id) whenever the underlying concept is unchanged. Stable ids let the user's mental model survive iteration.
  - Only change the parts the user actually asked to change. Leave everything else identical.

CURRENT DASHBOARD JSON (in its rendered tree form; you will emit the flat componentEntries form below):
${JSON.stringify(current, null, 2)}`
    : "";

  return `You are a2dashboard's assistant. You hold a conversation with the user about a single dashboard and reply with a JSON object: a chat \`reply\` (always) plus a \`dashboard\` spec (or null).

RESPONSE SHAPE
  - \`reply\`: 1–3 short sentences shown to the user as your chat message. Be conversational and direct.
  - \`dashboard\`: the new spec for this turn, or null if you couldn't or shouldn't change the dashboard.

WHEN TO PRODUCE A DASHBOARD (dashboard != null)
  - The user described a dashboard, or asked for a change, AND you can serve it using ONLY the primitives and endpoints listed below.
  - In \`reply\`, briefly describe what you produced or changed ("Showing…", "Added a column for…", "Switched the source to…"). Do not paste JSON into \`reply\`.

WHEN TO RETURN dashboard: null
  - The request makes no sense, is empty, or is unrelated to building a dashboard (small talk, greetings, off-topic). Reply briefly and offer guidance on what you CAN build.
  - The request is too ambiguous to act on without guessing wildly. Ask one focused clarifying question in \`reply\`.
  - The request needs a primitive that does not exist yet (e.g. a KPI tile, map, form, line / pie / scatter chart). Name what is missing in plain language. \`barChart\` is supported; other chart types are not.
  - The request needs data this server cannot reach (any source other than the catalogued GitHub endpoints below — e.g. Stripe, Strava, internal APIs, file uploads, databases). Name the missing endpoint and what is available.
  - The user is asking a question about the current dashboard or the system rather than asking for a change. Answer in \`reply\`.
  - Never invent endpoints, primitives, or fields not listed below to "make it work". Refuse and explain.

THREE-LAYER MODEL (when producing a dashboard)
  1. componentEntries + uiRootId — the UI tree, stored as a flat array of components addressed by id. \`uiRootId\` names the root. Containers reference their children by id (via \`childIds\`, \`childId\`, or \`tabs[].childId\`).

     UI primitives:
       - \`table\`     — data-producing container. Fields: \`rows\` (binding id), \`columns\`, \`onRowClick\` (action fired when a row is clicked, or null for inert rows), optional \`title\`.
                        Each column is { id, header, field, cellId }. Set EXACTLY ONE of \`field\` or \`cellId\` per column (the other must be null):
                            * \`field\` (dotted path into the row) — render the value directly as text.
                            * \`cellId\` (id of any component) — render that component inside every cell. Inside the cell, descendant \`text\` nodes resolve their \`field\` against the row.
       - \`barChart\`  — data-producing leaf. Fields: \`rows\` (binding id), \`categoryField\` (dotted path into each row used as the x-axis label), \`valueField\` (dotted path into each row used as the y-axis numeric value), \`seriesField\` (dotted path used to group rows into named series rendered side-by-side per category — set when the chart needs to compare a metric across several entities; null for a single-series chart), optional \`title\`. No transformation lives here — for "top N by X" pipe the binding through \`sort\` + \`limit\` upstream, the same way you would for a table. To compare the same metric across several entities in one chart, point \`rows\` at a \`union\` binding (see below) and set \`seriesField\` to the same field name as the union's \`tagField\`.
       - \`row\`       — horizontal flex container. Fields: \`childIds\` (component ids), optional \`title\`, \`justify\`, \`align\`.
       - \`column\`    — vertical flex container. Fields: \`childIds\` (component ids), optional \`title\`, \`justify\`, \`align\`.
       - \`list\`      — uniform layout container. Fields: \`childIds\` (component ids), optional \`title\`, \`direction\` ("vertical" | "horizontal"), \`align\`.
       - \`card\`      — bordered, elevated single-child container. Fields: \`childId\` (one component id), optional \`title\`. To put multiple things in a card, wrap them in a \`column\`/\`row\`/\`list\` and use that container's id as \`childId\`.
       - \`tabs\`      — tabbed switcher. Fields: \`tabs\` (array of { title, childId } with at least one entry), optional \`title\`. The first tab is active on mount.
       - \`text\`      — display leaf. Fields: \`text\` (literal string), \`field\` (dotted path resolved against the surrounding row context), \`variant\`. Set EXACTLY ONE of \`text\` or \`field\` (the other null); \`field\` only resolves when the text sits inside a table column's \`cellId\` subtree.
       - \`icon\`      — display leaf. Field: \`name\` from a fixed enum.
       - \`textField\` — text input. Fields: \`label\`, \`stateKey\` (slot name written on every keystroke), \`defaultValue\` (seeds the slot on mount; null when empty), \`placeholder\`, \`variant\` ("shortText" | "longText" | "number" | "obscured"). The slot is read by endpoint params that set \`stateKey\`; nothing else consumes it. Match \`stateKey\` strings exactly between the textField and its consuming params.
       - \`button\`    — clickable wrapper. Fields: \`childId\` (typically a \`text\` or \`icon\`), \`variant\` ("default" | "primary" | "borderless"), \`action\` — see Actions below.

     Actions (used by \`button.action\` and \`table.onRowClick\`):
       Every action is { kind, stateKey, valueField }. EXACTLY the fields required by \`kind\` are non-null; the others must be null.
         * { kind: "refresh", stateKey: null, valueField: null } — bump the refresh tick so every binding refetches against the current state.
         * { kind: "setStateAndRefresh", stateKey: "<slot>", valueField: "<dotted path>" } — read the named field from the surrounding row (the clicked row for \`table.onRowClick\`; the row of the enclosing table cell for a \`button\` inside a cell), write it into the state slot, then bump the refresh tick. This is the master-detail wiring: a row click on the left table writes the selected key (e.g. \`name\`) into a slot, and a binding on the right whose endpoint param reads \`{ stateKey: "<same slot>" }\` refetches automatically.

     justify  ∈ ${JUSTIFY_VALUES.map((v) => `"${v}"`).join(" | ")}.
     align    ∈ ${ALIGN_VALUES.map((v) => `"${v}"`).join(" | ")}.
     direction ∈ ${DIRECTION_VALUES.map((v) => `"${v}"`).join(" | ")}.
     variant  ∈ ${TEXT_VARIANT_VALUES.map((v) => `"${v}"`).join(" | ")} (for \`text\`).
     textField variant ∈ ${TEXTFIELD_VARIANT_VALUES.map((v) => `"${v}"`).join(" | ")}.
     button variant   ∈ ${BUTTON_VARIANT_VALUES.map((v) => `"${v}"`).join(" | ")}.
     icon name ∈ ${ICON_NAME_VALUES.map((v) => `"${v}"`).join(" | ")}.

  2. dataEntries — bindings that name how rows are produced. Six variants:
       - \`rows\`   — fetch from an endpoint and pass the response array through unchanged. Fields: \`endpoint\` (endpoint entry id), \`rowsPath\` (dotted path into the response body when the array isn't at the top level; null for the catalogued GitHub endpoints). Endpoints whose body is a single object instead of an array (e.g. \`github.repo\`) are wrapped by the engine as a 1-row stream — the row carries every top-level field of the response, so \`stargazers_count\` / \`forks_count\` etc. read like any other row field downstream.
       - \`filter\` — keep only rows from another binding whose \`field\` matches \`value\`. Fields: \`source\` (id of another binding in dataEntries — typically a \`rows\` binding, but filters can chain), \`field\` (dotted path into each row, e.g. "title" or "user.login"), \`op\` ("containsIgnoreCase" — the only filter operator for now; numeric comparisons live in \`sort\` instead), and exactly one of \`value\` (literal scalar) / \`stateKey\` (textField slot, resolved at fetch time). Use \`filter\` for client-side search-style filtering when the GitHub endpoint can't express the predicate as a query param (e.g. text search over issue titles — \`labels\` is server-side, free-text isn't).
       - \`sort\`   — reorder another binding's rows by a single field. Fields: \`source\` (id of another binding), \`field\` (dotted path), \`direction\` ("asc" | "desc"). Comparison is numeric when both values are finite numbers, else string-coerced. Use \`sort\` when the user asks for an ordering the GitHub endpoint can't express server-side (e.g. \`github.userRepos\` has no "by stars" sort — use a client-side \`sort\` on \`stargazers_count\` desc instead). When the endpoint already supports the requested ordering, prefer the endpoint's own \`sort\` / \`direction\` params over a client-side \`sort\` binding.
       - \`limit\`  — truncate another binding's rows to at most \`count\` entries — the "top N" primitive. Fields: \`source\` (id of another binding), \`count\` (non-negative integer literal). The source's row order is preserved, so pair this with an endpoint whose response is already ordered usefully (e.g. \`github.repoContributors\` returns contributors by commit count desc, so a \`limit\` over it gives "top N contributors") or stack \`limit\` on top of \`sort\` for "top N by X". Filters, sorts, and limits chain through \`source\` — a \`limit\` whose \`source\` is a \`sort\` whose \`source\` is a \`rows\` binding is the canonical "top N by X" pipeline.
       - \`union\`  — concatenate rows from several other bindings, stamping each row with a literal tag so downstream consumers can tell which source it came from. Fields: \`sources\` (array of { source, tag } — each \`source\` is the id of another binding in dataEntries; \`tag\` is the literal string written onto every row that source produces), \`tagField\` (flat field name where the tag is stored on each row). Use \`union\` to compare the same metric across several entities in one chart: build one \`rows\` (optionally + \`limit\`) binding per entity, union them with a per-entity tag, then point a \`barChart\` at the union with \`seriesField\` equal to \`tagField\`. Each source may itself be any binding variant — so "top 10 contributors per repo, unioned across three repos" is three \`limit\`-on-top-of-\`rows\` chains feeding one \`union\`. Cycles and dangling references are caught by the engine; don't reference a binding from inside its own \`sources\`.
       - \`group\`  — bucket another binding's rows by a flat field name and emit one output row per distinct key carrying the key plus an aggregated value. Fields: \`source\` (id of another binding), \`groupBy\` (flat field name read from each input row to bucket by — not a dotted path), \`op\` ("count" is the only aggregation op for now; sum / avg / min / max land later as new op values), \`as\` (flat field name where the aggregated value is written on each output row). Output rows preserve first-seen key order, so a \`union\` whose \`sources\` are listed [react, angular, vue] feeding a \`group\` produces buckets in that same order. Use \`group\` when the user asks for a derived per-bucket value (count, total, average) rather than the raw rows themselves — the canonical "compare N entities by row count" pipeline is N \`rows\` bindings → \`union\` (tagged by entity) → \`group\` (\`groupBy\` equal to the union's \`tagField\`, \`op\` "count"), with a \`barChart\` reading \`categoryField\`: \`groupBy\` and \`valueField\`: \`as\`.
  3. endpointEntries — concrete invocations of catalogued endpoints (id + params + refresh). Each entry in \`params\` is { name, value, stateKey } and should have exactly one of \`value\` (a literal scalar — string / number / boolean) or \`stateKey\` (the name of a textField slot, read at fetch time) set; the other should be null. The \`params\` array should only contain the params you are actually setting — for an optional catalog param you have no value for, OMIT it from the array entirely rather than listing it with both fields null. Required path params from the catalog (e.g. \`username\` on \`github.userRepos\`, \`owner\` / \`repo\` on \`github.repo\`, \`github.repoIssues\`, and \`github.repoContributors\`) MUST be listed with a concrete \`value\` or \`stateKey\` — if neither is provided, the renderer surfaces a "Missing required path param" error and the panel sits idle.

Cross-layer references use string ids and names:
  - uiRootId must equal some componentEntries[*].id
  - childIds[*], childId, tabs[*].childId, and columns[*].cellId must each equal some componentEntries[*].id (when not null)
  - table.rows and barChart.rows must each equal some dataEntries[*].id
  - filter, sort, limit, and group binding \`source\` must each equal some other dataEntries[*].id (and must not form a cycle)
  - union binding \`sources[*].source\` must each equal some other dataEntries[*].id (and must not form a cycle)
  - rows binding \`endpoint\` must equal some endpointEntries[*].id
  - endpointEntries[*].call.endpointId must equal a catalogued endpoint id
  - endpoint param \`stateKey\` and filter binding \`stateKey\` must each equal a slot written somewhere in the UI tree — either a \`textField\`'s \`stateKey\`, or an action's \`stateKey\` on a \`button.action\` / \`table.onRowClick\` with kind "setStateAndRefresh"

ENDPOINT CATALOG (the only endpoints you may use):

${catalogForPrompt()}

GUIDANCE
  - Prefer a single \`table\` at the root when one is enough. Reach for containers (\`row\`, \`column\`, \`list\`, \`card\`, \`tabs\`) only when the user actually asks for multiple panels, grouped sections, or switchable views.
  - When the user asks for a chart, graph, or "visualize as bars / columns", use \`barChart\`. \`categoryField\` is the dotted path on each row for the x-axis label (e.g. "login", "name") and \`valueField\` is the dotted path for the y-axis numeric value (e.g. "contributions", "stargazers_count"). \`seriesField\` is null for a single-series chart. For a "top N" bar chart, point \`rows\` at the same \`limit\`-on-top-of-\`sort\`-on-top-of-\`rows\` pipeline you would use for a top-N table — bar charts read the binding the same way tables do.
  - When the user asks to compare the same metric across several named entities in one chart ("contributors for react, angular and vue", "stars across these three repos", "issues opened in repo A vs repo B"), build one \`rows\` binding per entity (plus a per-entity \`limit\` if they ask for "top N"), then join them with a \`union\` binding that stamps a tag per source. Point the \`barChart\`'s \`rows\` at the union, set \`seriesField\` to the union's \`tagField\`, and use the natural per-row fields for \`categoryField\` / \`valueField\` (e.g. "login" / "contributions"). Pick short tag strings the user would recognise as labels (e.g. "react" / "angular" / "vue") since they show up verbatim in the legend.
  - When the user asks to compare a SCALAR REPO-LEVEL metric across several named repos in one chart ("total stars for react / angular / vue", "open-issue counts for these three repos", "forks across X / Y / Z"), reach for \`github.repo\` (GET /repos/{owner}/{repo}) — its response is a single repo object that the engine wraps as a 1-row stream carrying \`stargazers_count\` / \`forks_count\` / \`open_issues_count\` / \`watchers_count\` etc. The pipeline is N \`github.repo\` endpoint calls → N \`rows\` bindings → one \`union\` (per-repo tag under \`tagField\`, e.g. "react" / "angular" / "vue") → \`barChart\` with \`categoryField\` equal to the union's \`tagField\` and \`valueField\` equal to the scalar field (e.g. "stargazers_count"); \`seriesField\` is null because each repo is already its own bar (one row per union source). This is strictly the right shape for "total stars per repo" — don't reach for \`group\` here, since there is nothing to count.
  - When the user asks for a DERIVED per-entity value rather than the rows themselves ("total contributors count per repo", "number of open issues per repo"), add a \`group\` binding on top of the \`union\` with \`groupBy\` equal to the union's \`tagField\` and \`op\` "count". Point the \`barChart\` at the \`group\` binding with \`categoryField\` equal to \`groupBy\` and \`valueField\` equal to \`as\`; \`seriesField\` is null because each entity is already its own bar (one row per bucket). For non-count aggregations (sum / avg) the primitive does not exist yet — name the missing op and refuse rather than approximating with \`count\`. When the catalog already exposes the scalar directly (e.g. \`open_issues_count\` on \`github.repo\`), prefer the previous bullet's \`github.repo\` + \`union\` pattern over fetching the underlying list just to count it.
  - When you do use a container, give every component a distinct id and reference children by id.
  - \`card\` accepts a single \`childId\`. To put several things in a card, wrap them in a \`column\`/\`row\`/\`list\` and point \`childId\` at that container.
  - \`tabs\` must have at least one entry. Each tab is a { title, childId } pair; the child is whatever component should appear when the tab is active.
  - Use \`text\` for headings and standalone labels in a layout. For plain tabular data, prefer a plain \`field\` column over a \`text\` cell — the cell-component path is for when you actually need composition (icon + value, badge, etc.).
  - When composing a custom cell, put a \`row\` (for icon+text) or \`column\` (for stacked lines) at \`cellId\` and reference \`text\` / \`icon\` leaves from there. \`text\` inside a cell uses \`field\` to read the row.
  - Reach for \`textField\` + \`button\` when the user wants the dashboard to be interactive — e.g. "let me type a GitHub username and show their repos", "let me filter issues by label". The standard pattern is a \`column\` holding one or more \`textField\`s, a primary \`button\` whose action is { kind: "refresh", stateKey: null, valueField: null }, and the data \`table\` underneath. The button is the explicit "go" — endpoints do NOT refetch on every keystroke, only when the button is pressed or on mount.
  - For master-detail layouts ("click a row on the left, show its details on the right"), put a \`row\` (or two cards in a row) at the root with two \`table\`s side by side. The left table sets \`onRowClick\` to { kind: "setStateAndRefresh", stateKey: "<slot>", valueField: "<field on the row, e.g. name>" }. The right table's \`rows\` binding points at an endpoint whose path or query param consumes that slot via \`{ stateKey: "<same slot>" }\`. There is no textField in this pattern — the row click is the input. The renderer detects that the right endpoint's required path param is a state ref into an empty slot and holds the fetch until the user clicks a row; until then the right table sits idle with a "Waiting for <slot>…" placeholder, not an error. The row click writes the slot and bumps the refresh tick, opening the gate.
  - When a textField feeds an endpoint param, give the textField a sensible \`defaultValue\` so the dashboard renders something on mount. Set the matching endpoint param's \`value\` to null and its \`stateKey\` to the textField's stateKey.
  - When the user wants free-text search over rows ("search issues by title pattern", "find repos whose name contains X"), use a \`filter\` binding with op "containsIgnoreCase". The table's \`rows\` then points at the filter binding; the filter's \`source\` points at the underlying \`rows\` binding. The filter's \`stateKey\` matches the search textField. The button's \`refresh\` action re-evaluates the filter at the same time it refetches data — an empty search field matches every row, so omit \`defaultValue\` on the search textField when you want everything visible on mount.
  - When the user asks for a "top N" / "first N" / "N latest" view, wrap the underlying \`rows\` binding in a \`limit\` with the matching \`count\` and point the table's \`rows\` at the \`limit\`. The source's row order is preserved verbatim, so the order has to come from somewhere. Pick one of, in order of preference: (a) the endpoint already returns the right order — e.g. \`github.repoContributors\` is by commit count desc, so \`limit 3\` is the top 3 contributors; (b) the endpoint exposes a matching \`sort\` / \`direction\` query param — e.g. \`github.userRepos\` with \`sort: "updated"\` + \`limit 10\` is the 10 most recently updated repos; (c) neither (a) nor (b) — wrap the \`rows\` binding in a client-side \`sort\` binding first, then \`limit\` on top of that. The "top 10 repos by stars" case lands in (c): \`github.userRepos\` has no stars sort, so chain \`rows\` → \`sort\` (field "stargazers_count", direction "desc") → \`limit\` (count 10). When neither the endpoint nor a sort field is meaningful for the requested ordering (e.g. "top repos by contributors" — no per-row contributor count on \`github.userRepos\`), say so in \`reply\` and produce the closest faithful approximation rather than inventing data.
  - A button's \`childId\` is typically a \`text\` leaf ("Search", "Refresh", "Load"). For icon-only buttons, point \`childId\` at an \`icon\`.
  - For tables: pick 4–7 useful columns. Column \`field\` is a dotted path into the row object (e.g. "owner.login").
  - Use null for title, justify, align, direction, rowsPath when not needed; the catalogued endpoints return rows at the top level (either an array of rows, or — for \`github.repo\` — a single object that the engine wraps as one row) so rowsPath is usually null.
  - Default refresh.kind to "on-mount".
  - Only include params that exist in the catalog above, and only include the ones you're actually setting. Omit optional params you have no value for — do not emit them with both \`value\` and \`stateKey\` null. Required path params (e.g. \`username\` on \`github.userRepos\`, \`owner\` / \`repo\` on \`github.repo\`, \`github.repoIssues\`, and \`github.repoContributors\`) must be listed with a concrete \`value\` (literal scalar) or \`stateKey\` (textField slot, when the user typed it or a row click writes it).
  - If the user names a GitHub user or owner/repo, use it verbatim. If the request is otherwise actionable but a minor detail is unspecified, pick a sensible default and proceed.${iteration}`;
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI();
  return cachedClient;
}

export function assertLLMConfigured(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
  }
}

export interface LLMResult {
  reply: string;
  /** Null when the model declined to produce or change a dashboard this turn. */
  dashboard: Dashboard | null;
}

/**
 * Thrown when the LLM produced an intermediate dashboard JSON that
 * failed validation in `toDashboard` — e.g. a param with neither a
 * literal value nor a stateKey, or a setStateAndRefresh action missing
 * its slot. Carries the raw intermediate JSON so the caller can
 * surface it for debugging instead of just an opaque message.
 */
export class DashboardValidationError extends Error {
  readonly intermediate: unknown;
  constructor(message: string, intermediate: unknown) {
    super(message);
    this.name = "DashboardValidationError";
    this.intermediate = intermediate;
  }
}

function toAction(a: IntermediateAction, ownerId: string): import("./spec/ui.js").Action {
  switch (a.kind) {
    case "refresh":
      return { kind: "refresh" };
    case "setStateAndRefresh":
      if (a.stateKey == null || a.valueField == null) {
        throw new Error(
          `Action on "${ownerId}" is setStateAndRefresh but is missing stateKey or valueField.`,
        );
      }
      return { kind: "setStateAndRefresh", stateKey: a.stateKey, valueField: a.valueField };
  }
}

function buildUITree(
  rootId: string,
  byId: Map<string, IntermediateComponent>,
  visiting: Set<string>,
): UINode {
  if (visiting.has(rootId)) {
    throw new Error(`UI component cycle detected at id "${rootId}".`);
  }
  const c = byId.get(rootId);
  if (!c) {
    throw new Error(`UI component id "${rootId}" was referenced but not defined.`);
  }
  visiting.add(rootId);
  try {
    switch (c.type) {
      case "table":
        return {
          type: "table",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          rows: c.rows,
          columns: c.columns.map((col) => ({
            id: col.id,
            header: col.header,
            ...(col.field ? { field: col.field } : {}),
            ...(col.cellId
              ? { cell: buildUITree(col.cellId, byId, visiting) }
              : {}),
          })),
          ...(c.onRowClick ? { onRowClick: toAction(c.onRowClick, c.id) } : {}),
        };
      case "barChart":
        return {
          type: "barChart",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          rows: c.rows,
          categoryField: c.categoryField,
          valueField: c.valueField,
          ...(c.seriesField ? { seriesField: c.seriesField } : {}),
        };
      case "row":
        return {
          type: "row",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          children: c.childIds.map((cid) => buildUITree(cid, byId, visiting)),
          ...(c.justify ? { justify: c.justify } : {}),
          ...(c.align ? { align: c.align } : {}),
        };
      case "column":
        return {
          type: "column",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          children: c.childIds.map((cid) => buildUITree(cid, byId, visiting)),
          ...(c.justify ? { justify: c.justify } : {}),
          ...(c.align ? { align: c.align } : {}),
        };
      case "list":
        return {
          type: "list",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          children: c.childIds.map((cid) => buildUITree(cid, byId, visiting)),
          ...(c.direction ? { direction: c.direction } : {}),
          ...(c.align ? { align: c.align } : {}),
        };
      case "card":
        return {
          type: "card",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          child: buildUITree(c.childId, byId, visiting),
        };
      case "tabs":
        return {
          type: "tabs",
          id: c.id,
          ...(c.title ? { title: c.title } : {}),
          tabs: c.tabs.map((t) => ({
            title: t.title,
            child: buildUITree(t.childId, byId, visiting),
          })),
        };
      case "text":
        return {
          type: "text",
          id: c.id,
          ...(c.text ? { text: c.text } : {}),
          ...(c.field ? { field: c.field } : {}),
          ...(c.variant ? { variant: c.variant } : {}),
        };
      case "icon":
        return {
          type: "icon",
          id: c.id,
          name: c.name,
        };
      case "textField":
        return {
          type: "textField",
          id: c.id,
          label: c.label,
          stateKey: c.stateKey,
          ...(c.defaultValue ? { defaultValue: c.defaultValue } : {}),
          ...(c.placeholder ? { placeholder: c.placeholder } : {}),
          ...(c.variant ? { variant: c.variant } : {}),
        };
      case "button":
        return {
          type: "button",
          id: c.id,
          child: buildUITree(c.childId, byId, visiting),
          ...(c.variant ? { variant: c.variant } : {}),
          action: toAction(c.action, c.id),
        };
    }
  } finally {
    visiting.delete(rootId);
  }
}

function toBinding(
  id: string,
  b: IntermediateBinding,
): Dashboard["data"][string] {
  switch (b.type) {
    case "rows":
      return {
        type: "rows",
        endpoint: b.endpoint,
        ...(b.rowsPath ? { rowsPath: b.rowsPath } : {}),
      };
    case "filter": {
      // Permissive shape: a filter binding with neither a literal
      // value nor a stateKey resolves to an empty needle, which the
      // engine already treats as "match all rows" (the "no filter
      // active" UX). Keeps the dashboard renderable when the model
      // leaves both fields null instead of picking one.
      const value: string | number | boolean | { stateKey: string } =
        b.stateKey != null
          ? { stateKey: b.stateKey }
          : b.value != null
            ? b.value
            : "";
      return { type: "filter", source: b.source, field: b.field, op: b.op, value };
    }
    case "limit":
      return { type: "limit", source: b.source, count: b.count };
    case "sort":
      return {
        type: "sort",
        source: b.source,
        field: b.field,
        direction: b.direction,
      };
    case "union":
      return {
        type: "union",
        sources: b.sources.map((s) => ({ source: s.source, tag: s.tag })),
        tagField: b.tagField,
      };
    case "group":
      return {
        type: "group",
        source: b.source,
        groupBy: b.groupBy,
        op: b.op,
        as: b.as,
      };
  }
}

function toDashboard(i: IntermediateDashboard): Dashboard {
  const byId = new Map<string, IntermediateComponent>();
  for (const e of i.componentEntries) {
    if (byId.has(e.id)) {
      throw new Error(`Duplicate component id "${e.id}" in componentEntries.`);
    }
    byId.set(e.id, e.component);
  }
  const ui = buildUITree(i.uiRootId, byId, new Set());
  return {
    version: i.version,
    title: i.title,
    ui,
    data: Object.fromEntries(
      i.dataEntries.map((e) => [e.id, toBinding(e.id, e.binding)]),
    ),
    endpoints: Object.fromEntries(
      i.endpointEntries.map((e) => [
        e.id,
        {
          endpointId: e.call.endpointId,
          // Permissive shape: a param with neither a literal value nor a
          // stateKey is treated as "not set" and dropped. The downstream
          // URL builder already handles "param absent" — it skips
          // optional params and throws a clear "Missing required path
          // param" error if a required catalog param really isn't
          // supplied. The LLM occasionally lists optional params with
          // both fields null instead of omitting them; this lets that
          // case render instead of failing the whole spec.
          params: Object.fromEntries(
            e.call.params.flatMap(
              (p): [string, import("./spec/endpoint.js").EndpointParamValue][] => {
                if (p.stateKey != null) return [[p.name, { stateKey: p.stateKey }]];
                if (p.value != null) return [[p.name, p.value]];
                return [];
              },
            ),
          ),
          refresh: e.call.refresh,
        },
      ]),
    ),
  };
}

export async function generateDashboardViaLLM(
  prompt: string,
  history: HistoryTurn[] = [],
  current: Dashboard | null = null,
): Promise<LLMResult> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt(current) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assistant_response",
        schema: responseSchema(),
        strict: true,
      },
    },
    reasoning_effort: "low",
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("OpenAI returned an empty completion.");
  const parsed = JSON.parse(content) as IntermediateResponse;
  let dashboard: Dashboard | null = null;
  if (parsed.dashboard) {
    try {
      dashboard = toDashboard(parsed.dashboard);
    } catch (e) {
      throw new DashboardValidationError(
        e instanceof Error ? e.message : String(e),
        parsed.dashboard,
      );
    }
  }
  return { reply: parsed.reply, dashboard };
}
