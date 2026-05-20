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
  - Use \`flowchart LR\` (left-to-right). Group nodes into \`subgraph\` blocks: one per layer — \`UI\`, \`Data\`, \`Endpoints\`, \`State\`. Omit a subgraph only when that layer is empty. Use single-word subgraph ids (no quotes, no spaces) — \`subgraph UI\` not \`subgraph "UI"\`.

NODE SHAPES — USE EXACTLY THESE, NOTHING ELSE
  Mermaid's bracket grammar is strict. Pick ONE shape per layer and do not mix or nest brackets. Any deviation (e.g. \`[/(...)/]\`, \`([(...)])\`, \`[[(...)]]\`) is a parse error.
  - UI nodes:      \`ui_<id>["<label>"]\`             (rectangle)
  - Data bindings: \`bind_<id>(["<label>"])\`          (stadium)
  - Endpoints:     \`ep_<id>[("<label>")]\`            (cylinder)
  - State slots:   \`state_<key>(("<label>"))\`        (circle)

  Every label MUST be wrapped in straight double quotes immediately inside the brackets. Do NOT add extra parentheses, slashes, braces, or backticks inside the brackets. Each node declaration occupies its own line. The opening and closing bracket sequences must match exactly as shown above.

EVERY COMPONENT IN THE SPEC MUST APPEAR AS A NODE
  - UI layer: emit one rectangle for every node found by walking the \`ui\` tree — \`table\`, \`barChart\`, \`row\`, \`column\`, \`list\`, \`card\`, \`tabs\`, \`text\`, \`icon\`, \`textField\`, \`button\`. Recurse into \`children\`, \`child\`, \`tabs[].child\`, and every table column's \`cell\` subtree. The label has two lines:
      * line 1: \`<type>: <id>\`
      * line 2 (when present): the most identifying field — \`title\` for table/barChart/card/tabs/row/column/list; \`text\` (or \`field: <field>\`) for text; \`name\` for icon; \`label\` for textField; the button's child text for button.
    Table columns themselves are NOT UI components — do NOT emit a node per column. Instead include the column headers as extra lines on the parent table label, e.g. \`table: issues<br/>columns: # · title · state\`. The column's \`cell\` subtree, when set, IS a UI node and is emitted as usual under the table.
  - Data layer: emit one stadium for every entry in \`data\` (\`rows\`, \`filter\`, \`sort\`, \`limit\`, \`union\`, \`group\`). Label is two lines:
      * line 1: \`<type>: <id>\`
      * line 2: the key fields — for \`rows\` \`endpoint: <id>\`; for \`filter\` \`field=<field>, op=<op>, value=<literal or {stateKey:<key>}>\`; for \`sort\` \`field=<field>, dir=<direction>\`; for \`limit\` \`count=<n>\`; for \`union\` \`tagField=<tagField>\`; for \`group\` \`groupBy=<groupBy>, op=<op>, as=<as>\`.
  - Endpoints layer: emit one cylinder for every entry in \`endpoints\`. Label is three lines:
      * \`<entryId>\`
      * \`<endpointId>\` (e.g. \`github.repoIssues\`)
      * a comma-separated summary of resolved params: literals as \`name=<value>\`, state refs as \`name={stateKey:<key>}\`.
  - State layer: collect every distinct \`stateKey\` referenced anywhere — \`textField.stateKey\`, endpoint param \`{ stateKey }\`, filter binding \`{ stateKey }\`, action \`setStateAndRefresh.stateKey\`. Emit one circle per slot, labelled with the slot name.

EDGES — show every cross-layer reference
  - UI containment: for every layout parent (\`row\`, \`column\`, \`list\`, \`card\`, \`tabs\`, \`button\`, table column \`cell\` subtrees) emit one plain arrow per child: \`ui_<parent> --> ui_<child>\`. No edge label, so the tree stays legible.
  - Tabs: in addition to the plain containment arrow per tab, emit one labelled arrow per tab: \`ui_<tabs> -- "<tab title>" --> ui_<child>\`.
  - UI → Data: for every \`table\` and \`barChart\`, emit \`ui_<id> -- "rows" --> bind_<rowsId>\`.
  - UI → State writes (dotted arrows):
      * \`textField\`: \`ui_<id> -. "writes" .-> state_<stateKey>\`
      * \`button\` with \`action.kind === "setStateAndRefresh"\`: \`ui_<id> -. "setState <valueField>" .-> state_<stateKey>\`
      * \`table\` with \`onRowClick.kind === "setStateAndRefresh"\`: \`ui_<id> -. "onRowClick <valueField>" .-> state_<stateKey>\`
      * \`button\` with \`action.kind === "refresh"\`: no edge needed.
  - Data → Data: every \`filter\`/\`sort\`/\`limit\`/\`group\` binding emits \`bind_<id> -- "source" --> bind_<sourceId>\`. Every \`union\` emits one edge per entry in \`sources\`: \`bind_<id> -- "<tag>" --> bind_<sourceId>\`.
  - Data → Endpoint: every \`rows\` binding emits \`bind_<id> -- "endpoint" --> ep_<endpointId>\`.
  - Endpoint → State (dotted): for every endpoint param whose value is \`{ stateKey }\`, emit \`ep_<id> -. "<paramName>" .-> state_<stateKey>\`.
  - Filter → State (dotted): when a \`filter\` binding's value is \`{ stateKey }\`, emit \`bind_<id> -. "value" .-> state_<stateKey>\`.

LABEL HYGIENE
  - Every label is wrapped in straight \`"\` quotes immediately inside the shape brackets. No backticks, no smart quotes, no markdown-string syntax.
  - Inside a label, use \`<br/>\` for line breaks. Escape any literal \`"\` inside the source data as \`&quot;\`. Escape \`#\` (which mermaid treats as an entity prefix) as \`&#35;\` — e.g. a column header \`#\` becomes \`&#35;\`. Avoid square brackets / round brackets / curly braces inside labels; if you must include them, write them as \`&#91;\` / \`&#93;\` / \`&#40;\` / \`&#41;\` / \`&#123;\` / \`&#125;\`.
  - When a field is absent, omit that line entirely — never emit empty \`<br/>\`, the word \`null\`, or \`undefined\`.
  - Node ids and subgraph ids must be alphanumeric / underscore only. Sanitise component / binding / endpoint / state ids by replacing every non-\`[A-Za-z0-9_]\` character with \`_\`. Always keep the layer prefix (\`ui_\` / \`bind_\` / \`ep_\` / \`state_\`).
  - Edge labels MUST be wrapped in double quotes — \`-- "rows" -->\` and \`-. "writes" .->\`.

STYLING (optional)
  - At the bottom you MAY add classDef + class assignments to tint each layer. Use one classDef per layer (e.g. \`classDef ui fill:#eef5ff,stroke:#0366d6\`) and one \`class a,b,c ui\` assignment listing every UI node id, etc. Keep colours light so text stays readable. Skip styling entirely if it would crowd the output.

DO NOT
  - Do not invent components, bindings, endpoints, or state slots that aren't in the input JSON.
  - Do not skip layout containers, leaves, or "decorative" nodes — every UI component in the spec must appear as a node.
  - Do not collapse binding chains — each binding entry is its own node.
  - Do not nest or mix shape brackets. Do not use parallelogram (\`[/.../]\`), trapezoid, hex (\`{{...}}\`), subroutine (\`[[...]]\`), rhombus (\`{...}\`), or any other shape — ONLY the four listed above.
  - Do not return code fences, prose, or anything except the mermaid source string inside the \`mermaid\` JSON field.

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
