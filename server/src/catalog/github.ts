/**
 * Hardcoded endpoint catalog — MVP scope.
 *
 * Three GitHub REST endpoints. The catalog is narrow on purpose: a future
 * iteration will swap this for OpenAPI ingest per tenant, so the
 * interface stays minimal (id, url template, params, response shape).
 */

export type ParamLocation = "path" | "query";

export interface EndpointParam {
  name: string;
  in: ParamLocation;
  required: boolean;
  description: string;
}

export interface EndpointDefinition {
  id: string;
  method: "GET";
  /** URL template with `{name}` placeholders for path params. */
  urlTemplate: string;
  /** Short description for the LLM-facing catalog dump. */
  description: string;
  params: EndpointParam[];
  /** Whether the response body is itself an array of rows. */
  responseIsArray: boolean;
  /** A short list of fields available on each row, for LLM grounding. */
  rowFields: { name: string; type: string }[];
}

export const githubCatalog: EndpointDefinition[] = [
  {
    id: "github.userRepos",
    method: "GET",
    urlTemplate: "https://api.github.com/users/{username}/repos",
    description: "Paginated list of a user's public repositories.",
    params: [
      { name: "username",  in: "path",  required: true,  description: "GitHub username." },
      { name: "type",      in: "query", required: false, description: "all | owner | member" },
      { name: "sort",      in: "query", required: false, description: "created | updated | pushed | full_name" },
      { name: "direction", in: "query", required: false, description: "asc | desc" },
      { name: "page",      in: "query", required: false, description: "Page number (1-based)." },
      { name: "per_page",  in: "query", required: false, description: "Results per page (max 100)." },
    ],
    responseIsArray: true,
    rowFields: [
      { name: "name",             type: "string" },
      { name: "full_name",        type: "string" },
      { name: "html_url",         type: "string" },
      { name: "description",      type: "string | null" },
      { name: "stargazers_count", type: "number" },
      { name: "forks_count",      type: "number" },
      { name: "open_issues_count", type: "number" },
      { name: "language",         type: "string | null" },
      { name: "updated_at",       type: "string (iso)" },
      { name: "owner.login",      type: "string" },
    ],
  },
  {
    id: "github.repoIssues",
    method: "GET",
    urlTemplate: "https://api.github.com/repos/{owner}/{repo}/issues",
    description: "Paginated list of issues for a repository.",
    params: [
      { name: "owner",     in: "path",  required: true,  description: "Repository owner (user or org)." },
      { name: "repo",      in: "path",  required: true,  description: "Repository name." },
      { name: "state",     in: "query", required: false, description: "open | closed | all" },
      { name: "labels",    in: "query", required: false, description: "Comma-separated label names." },
      { name: "sort",      in: "query", required: false, description: "created | updated | comments" },
      { name: "direction", in: "query", required: false, description: "asc | desc" },
      { name: "since",     in: "query", required: false, description: "ISO 8601 timestamp." },
      { name: "page",      in: "query", required: false, description: "Page number (1-based)." },
      { name: "per_page",  in: "query", required: false, description: "Results per page (max 100)." },
    ],
    responseIsArray: true,
    rowFields: [
      { name: "number",        type: "number" },
      { name: "title",         type: "string" },
      { name: "state",         type: "string" },
      { name: "html_url",      type: "string" },
      { name: "user.login",    type: "string" },
      { name: "comments",      type: "number" },
      { name: "created_at",    type: "string (iso)" },
      { name: "updated_at",    type: "string (iso)" },
    ],
  },
  {
    id: "github.repoContributors",
    method: "GET",
    urlTemplate: "https://api.github.com/repos/{owner}/{repo}/contributors",
    description:
      "Paginated list of contributors to a repository, ordered by number of commits (descending).",
    params: [
      { name: "owner",    in: "path",  required: true,  description: "Repository owner (user or org)." },
      { name: "repo",     in: "path",  required: true,  description: "Repository name." },
      { name: "anon",     in: "query", required: false, description: "Set to \"1\" or \"true\" to include anonymous contributors (matched by email)." },
      { name: "page",     in: "query", required: false, description: "Page number (1-based)." },
      { name: "per_page", in: "query", required: false, description: "Results per page (max 100)." },
    ],
    responseIsArray: true,
    rowFields: [
      { name: "login",         type: "string (absent for anonymous contributors)" },
      { name: "id",            type: "number (absent for anonymous contributors)" },
      { name: "avatar_url",    type: "string (absent for anonymous contributors)" },
      { name: "html_url",      type: "string (absent for anonymous contributors)" },
      { name: "type",          type: "string (User | Bot | Anonymous)" },
      { name: "contributions", type: "number" },
      { name: "name",          type: "string (anonymous contributors only)" },
      { name: "email",         type: "string (anonymous contributors only)" },
    ],
  },
];

export function getEndpoint(id: string): EndpointDefinition | undefined {
  return githubCatalog.find((e) => e.id === id);
}
