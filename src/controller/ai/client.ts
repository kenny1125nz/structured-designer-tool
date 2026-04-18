// Minimal OpenAI-compatible HTTP client.
// No SDK dependency — single endpoint, configurable via runtime config.

import { loadAiConfig } from "@/config/ai-config";

function getConfig() {
  return loadAiConfig();
}

// ---------------------------------------------------------------------------
// JSON extraction — strips markdown code fences if the model wrapped its output
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  // ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

interface PatchRequest {
  kind: "node" | "reference";
  target: unknown;
}

/** Generic AI call — returns the parsed JSON response body as T. */
export async function callAi<T>(
  systemPrompt: string,
  userMessage: string,
): Promise<T> {
  const config = getConfig();

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `AI request failed: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Empty response from AI provider.");
  return JSON.parse(extractJson(content)) as T;
}

/** Multi-turn AI call — accepts a full conversation history. */
export async function callAiMultiTurn<T>(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<T> {
  const config = getConfig();

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `AI request failed: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Empty response from AI provider.");
  return JSON.parse(extractJson(content)) as T;
}

export async function generatePatch<T>(
  prompt: string,
  request: PatchRequest,
): Promise<T> {
  const config = getConfig();

  const systemPrompt =
    `You are an assistant that edits graph ${request.kind} content. ` +
    `Respond ONLY with a JSON object containing the fields to patch (label, type, metadata). ` +
    `Do not modify structure. Current ${request.kind}: ${JSON.stringify(request.target)}`;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `AI request failed: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Empty response from AI provider.");

  return JSON.parse(extractJson(content)) as T;
}
