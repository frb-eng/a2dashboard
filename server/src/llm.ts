/**
 * OpenAI integration for dashboard generation.
 *
 * Uses Chat Completions with strict JSON-schema structured outputs.
 *
 * OpenAI strict mode disallows open-ended object maps (no
 * `additionalProperties: true`), so the LLM emits an *intermediate*
 * shape where `data` and `endpoints` are arrays of `{ id, value }`
 * entries plus `params` is an array of `{ name, value }` pairs. The
 * server converts those to the real `Record<string, …>` form before
 * returning, so the public Dashboard contract is unchanged.
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
import { githubCatalog } from "./catalog/github.js";

export const MODEL = "gpt-5-mini";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

interface IntermediateColumn {
  id: string;
  header: string;
  field: string;
}

interface IntermediateUI {
  type: "table";
  id: string;
  title: string | null;
  rows: string;
  columns: IntermediateColumn[];
}

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
  ui: IntermediateUI;
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

function dashboardObjectSchema(): Record<string, unknown> {
  const endpointIds = githubCatalog.map((e) => e.id);
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "title", "ui", "dataEntries", "endpointEntries"],
    properties: {
      version: { type: "string", enum: ["0.1"] },
      title: { type: "string" },
      ui: {
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
  - Preserve existing ids (ui node id, column ids, dataEntries[*].id, endpointEntries[*].id) whenever the underlying concept is unchanged. Stable ids let the user's mental model survive iteration.
  - Only change the parts the user actually asked to change. Leave everything else identical.

CURRENT DASHBOARD JSON:
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
  - The request needs a primitive that does not exist yet (e.g. a chart, KPI tile, map, form, multiple panels in one layout). Name what is missing in plain language ("I can only render a single table right now — charts aren't supported yet.").
  - The request needs data this server cannot reach (any source other than the catalogued GitHub endpoints below — e.g. Stripe, Strava, internal APIs, file uploads, databases). Name the missing endpoint and what is available.
  - The user is asking a question about the current dashboard or the system rather than asking for a change. Answer in \`reply\`.
  - Never invent endpoints, primitives, or fields not listed below to "make it work". Refuse and explain.

THREE-LAYER MODEL (when producing a dashboard)
  1. ui — declarative UI tree. MVP vocabulary: a single \`table\` primitive only.
  2. dataEntries — bindings that name how rows are produced. MVP: only \`rows\` bindings that pass an endpoint response through unchanged.
  3. endpointEntries — concrete invocations of catalogued endpoints (id + params + refresh).

Cross-layer references use string ids:
  - ui.rows must equal some dataEntries[*].id
  - dataEntries[*].binding.endpoint must equal some endpointEntries[*].id
  - endpointEntries[*].call.endpointId must equal a catalogued endpoint id

ENDPOINT CATALOG (the only endpoints you may use):

${catalogForPrompt()}

GUIDANCE
  - Pick 4–7 useful columns. Column \`field\` is a dotted path into the row object (e.g. "owner.login").
  - Use null for ui.title and binding.rowsPath when not needed; the catalogued endpoints return arrays at the top level so rowsPath is usually null.
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

function toDashboard(i: IntermediateDashboard): Dashboard {
  return {
    version: i.version,
    title: i.title,
    ui: {
      type: i.ui.type,
      id: i.ui.id,
      ...(i.ui.title ? { title: i.ui.title } : {}),
      rows: i.ui.rows,
      columns: i.ui.columns,
    },
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
