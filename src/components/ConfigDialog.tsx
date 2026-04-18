import { useState } from "react";
import { loadAiConfig, saveAiConfig } from "@/config/ai-config";

interface ConfigDialogProps {
  onClose: () => void;
}

export function ConfigDialog({ onClose }: ConfigDialogProps) {
  const [config, setConfig] = useState(() => loadAiConfig());
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveAiConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">AI Configuration</h2>
          <button
            className="text-lg leading-none text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                API Endpoint
              </label>
              <input
                type="url"
                className="text-xs border rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                value={config.endpoint}
                onChange={(e) => setConfig((c) => ({ ...c, endpoint: e.target.value }))}
                placeholder="https://api.openai.com/v1/chat/completions"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                API Key
              </label>
              <input
                type="password"
                className="text-xs border rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                value={config.apiKey}
                onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="sk-…"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Model
              </label>
              <input
                type="text"
                className="text-xs border rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                value={config.model}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                placeholder="gpt-4o"
                spellCheck={false}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70">
            Settings are stored in your browser's local storage and never sent anywhere except the configured endpoint.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button
            className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 min-w-[60px]"
            onClick={handleSave}
          >
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
