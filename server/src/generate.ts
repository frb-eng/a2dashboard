/**
 * Dashboard generator orchestrator.
 *
 * Routes to OpenAI when OPENAI_API_KEY is configured; otherwise returns
 * a deterministic stub so the rest of the stack stays usable in
 * environments without an API key.
 */

import type { Dashboard } from "./spec/dashboard.js";
import { generateDashboardViaLLM, isLLMConfigured, MODEL } from "./llm.js";

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  dashboard: Dashboard;
  /** Echoed back so the client can show what was interpreted. */
  prompt: string;
  /** True when no LLM is wired up and a hardcoded stub was returned. */
  stubbed: boolean;
  /** Model name when the LLM was used; null when stubbed. */
  model: string | null;
}

function userReposDashboard(username: string): Dashboard {
  return {
    version: "0.1",
    title: `Repositories for @${username}`,
    ui: {
      type: "table",
      id: "repos-table",
      title: `@${username}'s repositories`,
      rows: "repos",
      columns: [
        { id: "name",  header: "Name",    field: "name" },
        { id: "desc",  header: "Description", field: "description" },
        { id: "lang",  header: "Language", field: "language" },
        { id: "stars", header: "Stars",    field: "stargazers_count" },
        { id: "issues", header: "Open issues", field: "open_issues_count" },
        { id: "updated", header: "Updated", field: "updated_at" },
      ],
    },
    data: {
      repos: { type: "rows", endpoint: "reposCall" },
    },
    endpoints: {
      reposCall: {
        endpointId: "github.userRepos",
        params: { username, sort: "updated", per_page: 30 },
        refresh: { kind: "on-mount" },
      },
    },
  };
}

function repoIssuesDashboard(owner: string, repo: string): Dashboard {
  return {
    version: "0.1",
    title: `Issues in ${owner}/${repo}`,
    ui: {
      type: "table",
      id: "issues-table",
      title: `Open issues in ${owner}/${repo}`,
      rows: "issues",
      columns: [
        { id: "number",   header: "#",        field: "number" },
        { id: "title",    header: "Title",    field: "title" },
        { id: "state",    header: "State",    field: "state" },
        { id: "author",   header: "Author",   field: "user.login" },
        { id: "comments", header: "Comments", field: "comments" },
        { id: "updated",  header: "Updated",  field: "updated_at" },
      ],
    },
    data: {
      issues: { type: "rows", endpoint: "issuesCall" },
    },
    endpoints: {
      issuesCall: {
        endpointId: "github.repoIssues",
        params: { owner, repo, state: "open", per_page: 30 },
        refresh: { kind: "on-mount" },
      },
    },
  };
}

function stubDashboard(prompt: string): Dashboard {
  const lower = prompt.toLowerCase();
  const ownerRepoMatch = prompt.match(/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/);
  const owner = ownerRepoMatch?.[1];
  const repo = ownerRepoMatch?.[2];
  if (lower.includes("issue") && owner && repo) {
    return repoIssuesDashboard(owner, repo);
  }
  const userMatch = prompt.match(/@([A-Za-z0-9-]+)/);
  const username = userMatch?.[1] ?? "anthropics";
  return userReposDashboard(username);
}

export async function generateDashboard(
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const prompt = req.prompt.trim();

  if (isLLMConfigured()) {
    const dashboard = await generateDashboardViaLLM(prompt);
    return { dashboard, prompt, stubbed: false, model: MODEL };
  }

  return {
    dashboard: stubDashboard(prompt),
    prompt,
    stubbed: true,
    model: null,
  };
}
