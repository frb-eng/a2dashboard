/**
 * Thin client for the a2dashboard server.
 *
 * The client does not yet model the Dashboard JSON — for the MVP we
 * simply display it. The server owns the schema; when the renderer is
 * added it will import shared types instead of duplicating them here.
 */

export interface GenerateResponse {
  dashboard: unknown;
  prompt: string;
  stubbed: boolean;
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
