// Persisted AI provider configuration — stored in localStorage.
// Falls back to window globals injected at build/dev time, then hard defaults.

const LS_KEY = "ai-config";

export interface AiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

const DEFAULTS: AiConfig = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
};

export function loadAiConfig(): AiConfig {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AiConfig>;
      return {
        endpoint: parsed.endpoint || DEFAULTS.endpoint,
        apiKey: parsed.apiKey ?? DEFAULTS.apiKey,
        model: parsed.model || DEFAULTS.model,
      };
    }
  } catch {
    // corrupted storage — ignore and fall through
  }
  const win = window as unknown as Record<string, unknown>;
  return {
    endpoint: (win["__AI_ENDPOINT__"] as string | undefined) ?? DEFAULTS.endpoint,
    apiKey: (win["__AI_API_KEY__"] as string | undefined) ?? DEFAULTS.apiKey,
    model: (win["__AI_MODEL__"] as string | undefined) ?? DEFAULTS.model,
  };
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}
