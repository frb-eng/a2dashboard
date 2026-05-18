/**
 * Dashboard generator orchestrator.
 *
 * Forwards the prompt to OpenAI and returns the parsed Dashboard. The
 * LLM is required — there is no stub path.
 */

import type { Dashboard } from "./spec/dashboard.js";
import { generateDashboardViaLLM, MODEL } from "./llm.js";

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  dashboard: Dashboard;
  /** Echoed back so the client can show what was interpreted. */
  prompt: string;
  /** Model that produced the dashboard. */
  model: string;
}

export async function generateDashboard(
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const prompt = req.prompt.trim();
  const dashboard = await generateDashboardViaLLM(prompt);
  return { dashboard, prompt, model: MODEL };
}
