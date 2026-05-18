/**
 * Dashboard generator orchestrator.
 *
 * Forwards the prompt — plus prior conversation history and an optional
 * current dashboard — to OpenAI and returns the assistant's chat reply
 * along with a (possibly null) new dashboard spec. A null dashboard
 * means the model declined to change anything this turn — typically
 * because the request was unclear, off-topic, or needed primitives or
 * endpoints that don't exist yet. The LLM is required — there is no
 * stub path.
 */

import type { Dashboard } from "./spec/dashboard.js";
import { generateDashboardViaLLM, MODEL, type HistoryTurn } from "./llm.js";

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
  /** Echoed back so the client can show what was interpreted. */
  prompt: string;
  /** Model that produced the response. */
  model: string;
}

export async function generateDashboard(
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const prompt = req.prompt.trim();
  const { dashboard, reply } = await generateDashboardViaLLM(
    prompt,
    req.history ?? [],
    req.current ?? null,
  );
  return { dashboard, reply, prompt, model: MODEL };
}
