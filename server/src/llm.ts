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

function dashboardSchema(): Record<string, unknown> {
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

function systemPrompt(): string {
  return `You are a2dashboard's spec generator. Convert the user's plain-language description into a Dashboard JSON document.

THREE-LAYER MODEL (kept separable on purpose):
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
  - If the user names a GitHub user or owner/repo, use it verbatim. If unspecified, make a reasonable choice and proceed — do not ask follow-up questions.`;
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI();
  return cachedClient;
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

export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateDashboardViaLLM(prompt: string): Promise<Dashboard> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "dashboard",
        schema: dashboardSchema(),
        strict: true,
      },
    },
    reasoning_effort: "low",
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("OpenAI returned an empty completion.");
  const parsed = JSON.parse(content) as IntermediateDashboard;
  return toDashboard(parsed);
}
