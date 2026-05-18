# a2dashboard

> Generic agentic dashboard server. Plug in any REST API, prompt an LLM, get a live declarative-JSON dashboard rendered as native UI. Adds data-binding and refresh primitives. Domain-agnostic.

## What it does

`a2dashboard` turns a plain-language description into a **working dashboard at runtime**, without anyone writing UI code.

1. The user describes the dashboard they want ("show me daily active users over the last 30 days, plus the top 5 endpoints by error rate").
2. An LLM picks the right endpoints from a hardcoded catalog of REST APIs, decides how the data should be aggregated, and emits a single JSON document.
3. The frontend interprets that JSON as a UI tree, fetches and aggregates the referenced data, and renders the live dashboard immediately.

No code generation, no build step, no deploy. The JSON *is* the dashboard.

## The JSON format

The generated document is layered, so each concern stays separable and the LLM can be steered one piece at a time:

- **a2UI** — a declarative UI tree (panels, charts, tables, KPIs, layout). Renderer-agnostic.
- **Data-aggregation extension** — bindings that describe *how* fields are derived from endpoint responses (filter, group, aggregate, join, time-bucket).
- **Endpoint-requirement extension** — for every binding, which endpoint(s) it depends on, query parameters, and refresh policy.

```jsonc
{
  "ui": { /* a2UI tree: panels, charts, tables, KPIs */ },
  "data": { /* aggregations: filter / group / agg / join */ },
  "endpoints": { /* which REST APIs feed which bindings */ }
}
```

Because the data and endpoint layers are extensions on top of a2UI, the same UI tree can be re-pointed at different data sources without touching the layout.

## High-level architecture

```mermaid
flowchart LR
    User([User])
    Prompt[/"Prompt:<br/>'Show DAU + top error endpoints'"/]
    LLM["LLM<br/>(spec generator)"]
    Catalog[("Hardcoded<br/>endpoint catalog")]
    Spec[/"Dashboard JSON<br/>a2UI + data + endpoints"/]
    Renderer["Dashboard renderer<br/>(a2UI interpreter)"]
    Aggregator["Data-aggregation<br/>engine"]
    APIs[("REST data<br/>endpoints")]
    Dashboard{{"Live dashboard"}}

    User -->|describes| Prompt
    Prompt --> LLM
    Catalog -.->|tool / context| LLM
    LLM --> Spec
    Spec --> Renderer
    Renderer --> Aggregator
    Aggregator -->|HTTP| APIs
    APIs --> Aggregator
    Aggregator --> Renderer
    Renderer --> Dashboard
    Dashboard --> User
```

## Runtime sequence

What happens when a user submits a prompt:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Frontend
    participant Server as a2dashboard server
    participant LLM as LLM
    participant Agg as Aggregation engine
    participant API as REST endpoints

    User->>UI: "Build me a dashboard for X"
    UI->>Server: POST /generate { prompt }
    Server->>LLM: prompt + endpoint catalog
    LLM-->>Server: dashboard JSON (a2UI + data + endpoints)
    Server-->>UI: dashboard JSON
    UI->>UI: parse a2UI tree, mount layout
    loop for each data binding
        UI->>Agg: resolve binding
        Agg->>API: GET /metrics, /events, ...
        API-->>Agg: raw rows
        Agg-->>UI: aggregated values
    end
    UI-->>User: live dashboard rendered
    Note over UI,Agg: refresh policy per binding<br/>drives subsequent polls
```

## Spec layers in one picture

How the three layers of the JSON spec relate to what the user sees:

```mermaid
flowchart TB
    subgraph SPEC["Generated dashboard JSON"]
        direction TB
        UI["a2UI layer<br/>panels • charts • tables • KPIs"]
        DATA["Data-aggregation layer<br/>filter • group • agg • join • time-bucket"]
        EP["Endpoint-requirement layer<br/>which API • params • refresh"]
        UI -. binds to .-> DATA
        DATA -. sourced from .-> EP
    end

    subgraph RUNTIME["Runtime"]
        direction TB
        R["Renderer"]
        A["Aggregator"]
        C[("Endpoint catalog<br/>(hardcoded)")]
    end

    UI --> R
    DATA --> A
    EP --> A
    A --> C
```

## Why declarative JSON, not generated code?

- **Safe** — no arbitrary code is shipped to the browser; the renderer only executes a fixed vocabulary of UI and aggregation primitives.
- **Iterable** — the user can refine the dashboard ("make the chart stacked", "add a 7-day moving average") and the LLM patches the JSON instead of rewriting an app.
- **Portable** — the same JSON can be rendered by any client that implements a2UI; the server doesn't care which.
- **Inspectable** — every panel is traceable back to an endpoint, a query, and an aggregation.

## MVP scope

The current implementation is deliberately narrow — just enough surface area to validate the three-layer model end-to-end. Everything else (charts, KPIs, aggregations, more endpoints, alternative renderers) lands as a named extension to this MVP, not by quietly widening it.

- **UI:** `table` only, rendered with React + MUI.
- **Aggregation:** none — bindings map endpoint response rows directly to table columns.
- **Endpoint catalog:** two GitHub REST API endpoints (`https://api.github.com`). Unauthenticated for public data (60 req/hour) or authenticated with a GitHub Personal Access Token via `Authorization: Bearer <token>` (5000 req/hour):
  - `GET /users/{username}/repos` — paginated list of a user's public repositories (`type`, `sort`, `direction`, `page`, `per_page`).
  - `GET /repos/{owner}/{repo}/issues` — paginated list of issues for a repository (`state`, `labels`, `sort`, `direction`, `since`, `page`, `per_page`).

In practice, an MVP dashboard JSON looks like a `table` UI node whose columns are bound to fields from one of those two endpoints, with pagination as the only data-side behavior.

## Status

Early prototype. The endpoint catalog is currently hardcoded — a future iteration will let users register their own REST APIs (OpenAPI ingest) so the catalog becomes per-tenant.
