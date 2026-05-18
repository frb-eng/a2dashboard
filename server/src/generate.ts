/**
 * Dashboard generator.
 *
 * MVP: the real LLM call is deferred. This module returns a hand-crafted
 * Dashboard JSON that satisfies the spec types and exercises both
 * catalogued endpoints depending on a keyword in the prompt. The shape is
 * what the LLM will eventually produce — so the client can be built and
 * iterated against the same contract.
 */

import type { Dashboard } from "./spec/dashboard.js";

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  dashboard: Dashboard;
  /** Echoed back so the client can show what was interpreted. */
  prompt: string;
  /** True while the LLM is stubbed; clients can show a banner. */
  stubbed: true;
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

/**
 * Pick a stub dashboard based on simple keyword matching. Real LLM
 * integration will replace this function; the response shape will not
 * change.
 */
export function generateDashboard(req: GenerateRequest): GenerateResponse {
  const prompt = req.prompt.trim();
  const lower = prompt.toLowerCase();

  const ownerRepoMatch = prompt.match(/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/);
  const owner = ownerRepoMatch?.[1];
  const repo = ownerRepoMatch?.[2];
  if (lower.includes("issue") && owner && repo) {
    return {
      dashboard: repoIssuesDashboard(owner, repo),
      prompt,
      stubbed: true,
    };
  }

  const userMatch = prompt.match(/@([A-Za-z0-9-]+)/);
  const username = userMatch?.[1] ?? "anthropics";
  return {
    dashboard: userReposDashboard(username),
    prompt,
    stubbed: true,
  };
}
