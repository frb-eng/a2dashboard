import express, { type Request, type Response } from "express";
import cors from "cors";
import { generateDashboard, type GenerateRequest } from "./generate.js";
import { githubCatalog } from "./catalog/github.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", (_req, res) => {
  res.json({ endpoints: githubCatalog });
});

app.post("/api/generate", (req: Request, res: Response) => {
  const body = req.body as Partial<GenerateRequest> | undefined;
  if (!body || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    res.status(400).json({ error: "Body must be { prompt: string } with a non-empty prompt." });
    return;
  }
  const out = generateDashboard({ prompt: body.prompt });
  res.json(out);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`a2dashboard server listening on http://localhost:${port}`);
});
