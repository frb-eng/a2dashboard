/**
 * Thin client for the a2dashboard server.
 *
 * The Dashboard type mirrors the server contract; see `spec.ts`.
 */

import type { Dashboard } from "./spec";

export interface GenerateResponse {
  dashboard: Dashboard;
  prompt: string;
  model: string;
}

export async function generate(prompt: string): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server returned ${res.status}: ${text}`);
  }
  return (await res.json()) as GenerateResponse;
}
