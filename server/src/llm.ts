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
  field: string;
}

interface IntermediateTableComponent {
  type: "table";
  id: string;
  title: string | null;
  rows: string;
  columns: IntermediateTableColumn[];
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

type IntermediateComponent =
  | IntermediateTableComponent
  | IntermediateRowComponent
  | IntermediateColumnComponent
  | IntermediateListComponent
  | IntermediateCardComponent
  | IntermediateTabsComponent;

interface IntermediateBinding {
  type: "rows";
  endpoint: string;
  rowsPath: string | null;
}

interface IntermediateParam {
  name: string;
  value: string | number | boolean;
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

function tableComponentSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "rows", "columns"],
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
          required: ["id", "header", "field"],
          properties: {
            id: { type: "string" },
            header: { type: "string" },
            field: { type: "string" },
          },
        },
      },
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

function componentSchema(): Record<string, unknown> {
  return {
    anyOf: [
      tableComponentSchema(),
      flexComponentSchema("row"),
      flexComponentSchema("column"),
      listComponentSchema(),
      cardComponentSchema(),
      tabsComponentSchema(),
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
            binding: {
              type: "object",
              additionalProperties: false,
              required: ["type", "endpoint", "rowsPath"],
              properties: {
                type: { type: "string", enum: ["rows"] },
                endpoint: { type: "string" },
                rowsPath: { type: ["string", "null"] },
              },
            },
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
                    required: ["name", "value"],
                    properties: {
                      name: { type: "string" },
                      value: { type: ["string", "number", "boolean"] },
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
  - The request needs a primitive that does not exist yet (e.g. a chart, KPI tile, map, form). Name what is missing in plain language ("I can only render tables and layout containers right now — charts aren't supported yet.").
  - The request needs data this server cannot reach (any source other than the catalogued GitHub endpoints below — e.g. Stripe, Strava, internal APIs, file uploads, databases). Name the missing endpoint and what is available.
  - The user is asking a question about the current dashboard or the system rather than asking for a change. Answer in \`reply\`.
  - Never invent endpoints, primitives, or fields not listed below to "make it work". Refuse and explain.

THREE-LAYER MODEL (when producing a dashboard)
  1. componentEntries + uiRootId — the UI tree, stored as a flat array of components addressed by id. \`uiRootId\` names the root. Containers reference their children by id (via \`childIds\`, \`childId\`, or \`tabs[].childId\`).

     UI primitives:
       - \`table\`  — data-producing leaf. Fields: \`rows\` (binding id), \`columns\` (array of { id, header, field }), optional \`title\`.
       - \`row\`    — horizontal flex container. Fields: \`childIds\` (component ids), optional \`title\`, \`justify\`, \`align\`.
       - \`column\` — vertical flex container. Fields: \`childIds\` (component ids), optional \`title\`, \`justify\`, \`align\`.
       - \`list\`   — uniform layout container. Fields: \`childIds\` (component ids), optional \`title\`, \`direction\` ("vertical" | "horizontal"), \`align\`.
       - \`card\`   — bordered, elevated single-child container. Fields: \`childId\` (one component id), optional \`title\`. To put multiple things in a card, wrap them in a \`column\`/\`row\`/\`list\` and use that container's id as \`childId\`.
       - \`tabs\`   — tabbed switcher. Fields: \`tabs\` (array of { title, childId } with at least one entry), optional \`title\`. The first tab is active on mount.

     justify ∈ ${JUSTIFY_VALUES.map((v) => `"${v}"`).join(" | ")}.
     align   ∈ ${ALIGN_VALUES.map((v) => `"${v}"`).join(" | ")}.
     direction ∈ ${DIRECTION_VALUES.map((v) => `"${v}"`).join(" | ")}.

  2. dataEntries — bindings that name how rows are produced. MVP: only \`rows\` bindings that pass an endpoint response through unchanged.
  3. endpointEntries — concrete invocations of catalogued endpoints (id + params + refresh).

Cross-layer references use string ids:
  - uiRootId must equal some componentEntries[*].id
  - childIds[*], childId, and tabs[*].childId must each equal some componentEntries[*].id
  - table.rows must equal some dataEntries[*].id
  - dataEntries[*].binding.endpoint must equal some endpointEntries[*].id
  - endpointEntries[*].call.endpointId must equal a catalogued endpoint id

ENDPOINT CATALOG (the only endpoints you may use):

${catalogForPrompt()}

GUIDANCE
  - Prefer a single \`table\` at the root when one is enough. Reach for containers (\`row\`, \`column\`, \`list\`, \`card\`, \`tabs\`) only when the user actually asks for multiple panels, grouped sections, or switchable views.
  - When you do use a container, give every component a distinct id and reference children by id.
  - \`card\` accepts a single \`childId\`. To put several things in a card, wrap them in a \`column\`/\`row\`/\`list\` and point \`childId\` at that container.
  - \`tabs\` must have at least one entry. Each tab is a { title, childId } pair; the child is whatever component should appear when the tab is active.
  - For tables: pick 4–7 useful columns. Column \`field\` is a dotted path into the row object (e.g. "owner.login").
  - Use null for title, justify, align, direction, rowsPath when not needed; the catalogued endpoints return arrays at the top level so rowsPath is usually null.
  - Default refresh.kind to "on-mount".
  - Only include params that exist in the catalog above. Required path params (e.g. username, owner, repo) must be present.
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
          columns: c.columns,
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
    }
  } finally {
    visiting.delete(rootId);
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
      i.dataEntries.map((e) => [
        e.id,
        {
          type: e.binding.type,
          endpoint: e.binding.endpoint,
          ...(e.binding.rowsPath ? { rowsPath: e.binding.rowsPath } : {}),
        },
      ]),
    ),
    endpoints: Object.fromEntries(
      i.endpointEntries.map((e) => [
        e.id,
        {
          endpointId: e.call.endpointId,
          params: Object.fromEntries(e.call.params.map((p) => [p.name, p.value])),
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
  return {
    reply: parsed.reply,
    dashboard: parsed.dashboard ? toDashboard(parsed.dashboard) : null,
  };
}
