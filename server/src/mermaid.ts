/**
 * Mermaid diagram generator for a dashboard spec.
 *
 * Forwards the full Dashboard JSON to the LLM and asks for a single
 * mermaid `flowchart` source string that visualises every component in
 * the spec — UI nodes, bindings, endpoint calls, and state slots —
 * together with the cross-layer references between them. The diagram is
 * a debugging aid: the user toggles to it when the rendered dashboard
 * isn't behaving and they want to see how the primitives are wired.
 *
 * Structured output (a single `{ mermaid: string }` field) keeps parsing
 * deterministic — the model can't drop prose around the diagram.
 */
import OpenAI from "openai";
import type { Dashboard } from "./spec/dashboard.js";
import { githubCatalog } from "./catalog/github.js";
import { MODEL } from "./llm.js";

interface MermaidResponse {
  mermaid: string;
}

function responseSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mermaid"],
    properties: {
      mermaid: { type: "string" },
    },
  };
}

function catalogSummary(): string {
  return githubCatalog
    .map((e) => `  - ${e.id}: ${e.method} ${e.urlTemplate}`)
    .join("\n");
}

function systemPrompt(): string {
  return `You convert an a2dashboard JSON spec into a single Mermaid \`flowchart LR\` source string. The diagram is a debugging aid — it must show every primitive in the spec and the references between them so the user can see at a glance how their dashboard is wired.

OUTPUT
  - Return JSON: { "mermaid": "<the full mermaid source, including the leading \\"flowchart LR\\" line>" }.
  - No code fences, no prose, no explanation — just the mermaid source string inside the JSON field.
  - Use \`flowchart LR\` (left-to-right). Group nodes into \`subgraph\` blocks: one per layer — "UI", "Data bindings", "Endpoints", "State slots". Omit a subgraph only when that layer is empty.

EVERY COMPONENT IN THE SPEC MUST APPEAR AS A NODE
  - UI layer: every node in \`ui\` — table, barChart, row, column, list, card, tabs (one node per tab title), text, icon, textField, button — including layout containers and leaves like text/icon with no data binding. Use a stable node id derived from the component's \`id\` (prefix with \`ui_\`). The label should read \`<type>: <id>\` on the first line and, when present, the component's title / text / label / icon name / button child text on the second line. Suggested shapes:
      * table       — \`ui_<id>["table: <id><br/><title>"]\`
      * barChart    — \`ui_<id>["barChart: <id><br/><title>"]\`
      * row/column/list — \`ui_<id>{{"<type>: <id>"}}\` (hex shape, distinguishes containers)
      * card        — \`ui_<id>[["card: <id><br/><title>"]]\`
      * tabs        — \`ui_<id>[/"tabs: <id>"/]\` and one child node per tab labelled with the tab title
      * text        — \`ui_<id>("text: <id><br/>&quot;<text>&quot;")\` (or \`field: <field>\` when field is set)
      * icon        — \`ui_<id>("icon: <name>")\`
      * textField   — \`ui_<id>[/"textField: <id><br/><label>"/]\`
      * button      — \`ui_<id>(["button: <id><br/><child text>"])\`
  - Data bindings: every entry in \`data\` — rows, filter, sort, limit, union, group. Node id prefixed with \`bind_\`. Label \`<type>: <id>\` plus the key fields on a second line (\`endpoint: <id>\` for rows, \`source: <id>\` for filter/sort/limit/group, \`sources: a,b,c\` for union, plus the field/op/count/direction/groupBy/as/tagField that applies). Shape: \`bind_<id>([...])\` (stadium).
  - Endpoints: every entry in \`endpoints\`. Node id prefixed with \`ep_\`. Label \`<entryId><br/><endpointId>\` and a third line summarising the resolved params (e.g. \`owner=facebook, repo=react\` for literals, \`username={stateKey:user}\` for state refs). Shape: \`ep_<id>[(...)]\` (cylinder).
  - State slots: collect every distinct \`stateKey\` referenced anywhere in the spec — every textField's \`stateKey\`, every endpoint param \`{ stateKey }\`, every filter binding \`{ stateKey }\`, every \`setStateAndRefresh\` action's \`stateKey\`. One node per slot, id prefixed with \`state_\`. Label is just the slot name. Shape: \`state_<key>(("<key>"))\` (circle).

EDGES — show every cross-layer reference
  - UI → Data: for every \`table\` and \`barChart\`, add \`ui_<id> -- "rows" --> bind_<rowsId>\`.
  - UI containment: layout containers (\`row\`, \`column\`, \`list\`, \`card\`, \`tabs\`, \`button\`, and table column \`cell\` subtrees) → their children. Use a plain arrow \`ui_<parent> --> ui_<child>\` (no edge label) so the UI tree is visible without crowding.
  - For \`tabs\`, also draw one labelled edge per tab from the tabs node to the tab child: \`ui_<tabs> -- "<tab title>" --> ui_<child>\`.
  - For \`table.onRowClick\` with kind \`setStateAndRefresh\`: \`ui_<table> -. "setState <valueField>" .-> state_<stateKey>\` (dotted arrow — it's a write triggered on click, not a data flow).
  - For \`button.action\`: kind \`refresh\` → no edge needed; kind \`setStateAndRefresh\` → \`ui_<button> -. "setState <valueField>" .-> state_<stateKey>\`.
  - For \`textField\`: \`ui_<textField> -. "writes" .-> state_<stateKey>\`.
  - Data → Data: for every \`filter\`, \`sort\`, \`limit\`, \`group\` binding draw \`bind_<id> -- "source" --> bind_<sourceId>\`. For every \`union\` draw one edge per source: \`bind_<id> -- "<tag>" --> bind_<sourceId>\`.
  - Data → Endpoint: for every \`rows\` binding draw \`bind_<id> -- "endpoint" --> ep_<endpointId>\`.
  - Endpoint → State: for every endpoint param whose value is \`{ stateKey }\`, draw \`ep_<id> -. "<paramName}" .-> state_<stateKey>\`.
  - Filter → State: when a \`filter\` binding's value is \`{ stateKey }\`, draw \`bind_<id> -. "value" .-> state_<stateKey>\`.

LABEL HYGIENE
  - Wrap every label in double quotes so spaces, colons, and special characters are safe.
  - Inside labels, use \`<br/>\` for line breaks. Escape any literal double-quote in the source data as \`&quot;\`.
  - Node ids must be alphanumeric / underscores only — sanitise the component / binding / endpoint / state ids by replacing any non-\`[A-Za-z0-9_]\` character with \`_\`. Always keep the layer prefix (\`ui_\` / \`bind_\` / \`ep_\` / \`state_\`).
  - When a component has no title / text / label, omit the second line — never emit empty \`<br/>\` or the literal word \`null\`.

STYLING (optional but encouraged)
  - At the bottom of the diagram, add \`classDef\` blocks and \`class\` assignments to colour each layer subtly — UI nodes one tint, bindings another, endpoints another, state slots another. Pick light backgrounds so labels stay readable.

DO NOT
  - Do not invent components, bindings, endpoints, or state slots that aren't in the input JSON.
  - Do not skip layout containers or "decorative" nodes — every component in the spec must appear.
  - Do not collapse bindings or chains — each binding is its own node.
  - Do not return anything except valid mermaid source inside the \`mermaid\` JSON field.

ENDPOINT CATALOG (for reference when labelling endpoints):
${catalogSummary()}`;
}

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI();
  return cachedClient;
}

export async function generateMermaidViaLLM(
  dashboard: Dashboard,
): Promise<string> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `Produce a mermaid flowchart that includes every component, binding, endpoint, and state slot in this dashboard spec:\n\n${JSON.stringify(dashboard, null, 2)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mermaid_response",
        schema: responseSchema(),
        strict: true,
      },
    },
    reasoning_effort: "low",
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("OpenAI returned an empty completion.");
  const parsed = JSON.parse(content) as MermaidResponse;
  if (!parsed.mermaid || typeof parsed.mermaid !== "string") {
    throw new Error("Model did not return a mermaid string.");
  }
  return parsed.mermaid;
}
