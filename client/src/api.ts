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

export async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server returned ${res.status}: ${text}`);
  }
  return (await res.json()) as GenerateResponse;
}
