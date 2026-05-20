import express, { type Request, type Response } from "express";
import cors from "cors";
import { generateDashboard, type GenerateRequest } from "./generate.js";
import { githubCatalog } from "./catalog/github.js";
import { assertLLMConfigured, DashboardValidationError, MODEL } from "./llm.js";
import { generateMermaidViaLLM } from "./mermaid.js";
import type { Dashboard } from "./spec/dashboard.js";

try {
  assertLLMConfigured();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

app.get("/api/catalog", (_req, res) => {
  res.json({ endpoints: githubCatalog });
});

app.post("/api/generate", async (req: Request, res: Response) => {
  const body = req.body as Partial<GenerateRequest> | undefined;
  if (!body || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    res.status(400).json({ error: "Body must be { prompt: string } with a non-empty prompt." });
    return;
  }
  if (body.history !== undefined) {
    if (
      !Array.isArray(body.history) ||
      !body.history.every(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
    ) {
      res.status(400).json({
        error: "history must be an array of { role: 'user'|'assistant', content: string }.",
      });
      return;
    }
  }
  try {
    const out = await generateDashboard({
      prompt: body.prompt,
      history: body.history,
      current: body.current ?? null,
    });
    res.json(out);
  } catch (err) {
    console.error("generateDashboard failed:", err);
    if (err instanceof DashboardValidationError) {
      // Surface the LLM-emitted intermediate JSON so the client can
      // show it for debugging — otherwise the user only sees an opaque
      // "param X has neither value nor stateKey" with nothing to look at.
      res.status(502).json({
        error: err.message,
        rawDashboard: err.intermediate,
      });
      return;
    }
    res.status(502).json({
      error: err instanceof Error ? err.message : "Dashboard generation failed.",
    });
  }
});

app.post("/api/mermaid", async (req: Request, res: Response) => {
  const body = req.body as { dashboard?: Dashboard } | undefined;
  if (!body || !body.dashboard || typeof body.dashboard !== "object") {
    res.status(400).json({ error: "Body must be { dashboard: Dashboard }." });
    return;
  }
  try {
    const mermaid = await generateMermaidViaLLM(body.dashboard);
    res.json({ mermaid, model: MODEL });
  } catch (err) {
    console.error("generateMermaid failed:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Mermaid generation failed.",
    });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`a2dashboard server listening on http://localhost:${port}  (model: ${MODEL})`);
});
