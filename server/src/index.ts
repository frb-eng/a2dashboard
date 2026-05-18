import express, { type Request, type Response } from "express";
import cors from "cors";
import { generateDashboard, type GenerateRequest } from "./generate.js";
import { githubCatalog } from "./catalog/github.js";
import { isLLMConfigured, MODEL } from "./llm.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, llm: isLLMConfigured() ? MODEL : null });
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
  try {
    const out = await generateDashboard({ prompt: body.prompt });
    res.json(out);
  } catch (err) {
    console.error("generateDashboard failed:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Dashboard generation failed.",
    });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  if (isLLMConfigured()) {
    console.log(`a2dashboard server listening on http://localhost:${port}  (LLM: ${MODEL})`);
  } else {
    console.log(
      `a2dashboard server listening on http://localhost:${port}  ` +
        `(LLM: not configured — set OPENAI_API_KEY in .env to enable; falling back to stub)`,
    );
  }
});
