/**
 * Thin client for the a2dashboard server.
 *
 * The Dashboard type mirrors the server contract; see `spec.ts`.
 */

import type { Dashboard } from "./spec";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  prompt: string;
  history?: HistoryTurn[];
  current?: Dashboard | null;
}

export interface GenerateResponse {
  /** Always present: the assistant's chat reply. */
  reply: string;
  /** Null when no dashboard was produced or changed this turn. */
  dashboard: Dashboard | null;
  prompt: string;
  model: string;
}

/**
 * Thrown by `generate` when the server returned a non-2xx. Carries the
 * raw intermediate dashboard JSON (in the LLM-emitted flat form) when
 * the failure was a validation rejection — so the caller can show it
 * for debugging instead of just an opaque error string.
 */
export class GenerateError extends Error {
  readonly rawDashboard?: unknown;
  constructor(message: string, rawDashboard?: unknown) {
    super(message);
    this.name = "GenerateError";
    this.rawDashboard = rawDashboard;
  }
}

export interface MermaidResponse {
  mermaid: string;
  model: string;
}

export async function generateMermaid(dashboard: Dashboard): Promise<MermaidResponse> {
  const res = await fetch("/api/mermaid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dashboard }),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) detail = parsed.error;
    } catch {
      // fall through to plain-text body
    }
    throw new Error(`Server returned ${res.status}: ${detail}`);
  }
  return (await res.json()) as MermaidResponse;
}

export async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: { error?: string; rawDashboard?: unknown } | null = null;
    try {
      parsed = JSON.parse(text) as { error?: string; rawDashboard?: unknown };
    } catch {
      // Response wasn't JSON — fall through to the plain-text message.
    }
    const detail = parsed?.error ?? text;
    throw new GenerateError(
      `Server returned ${res.status}: ${detail}`,
      parsed?.rawDashboard,
    );
  }
  return (await res.json()) as GenerateResponse;
}
