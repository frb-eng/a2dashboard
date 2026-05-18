/**
 * Dashboard generator orchestrator.
 *
 * Forwards the prompt — plus prior conversation history and an optional
 * current dashboard — to OpenAI and returns the parsed Dashboard along
 * with a short summary the client uses as the assistant's chat reply.
 * The LLM is required — there is no stub path.
 */

import type { Dashboard } from "./spec/dashboard.js";
import { generateDashboardViaLLM, MODEL, type HistoryTurn } from "./llm.js";

export interface GenerateRequest {
  prompt: string;
  history?: HistoryTurn[];
  current?: Dashboard | null;
}

export interface GenerateResponse {
  dashboard: Dashboard;
  /** Short LLM-written description of this turn. Shown as the assistant message. */
  summary: string;
  /** Echoed back so the client can show what was interpreted. */
  prompt: string;
  /** Model that produced the dashboard. */
  model: string;
}

export async function generateDashboard(
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const prompt = req.prompt.trim();
  const { dashboard, summary } = await generateDashboardViaLLM(
    prompt,
    req.history ?? [],
    req.current ?? null,
  );
  return { dashboard, summary, prompt, model: MODEL };
}
