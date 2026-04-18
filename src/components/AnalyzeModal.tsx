import { useState, useRef, useCallback } from "react";
import type { FileEntry } from "@/graph-types/registry";

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function DropZone({ onFilesAdded }: { onFilesAdded: (files: File[]) => void }) {
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        // Only clear when leaving the zone itself, not a child element.
        if (!e.currentTarget.contains(e.relatedTarget as Element)) {
            setIsDragOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFilesAdded(files);
    }, [onFilesAdded]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) onFilesAdded(files);
        e.target.value = "";
    }, [onFilesAdded]);

    return (
        <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer select-none transition-colors ${
                isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt,.yaml,.yml,.json,.rst"
                className="hidden"
                onChange={handleInputChange}
            />
            <p className="text-sm text-muted-foreground">
                Drop files here or click to browse
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
                Markdown, plain text, YAML, JSON — any text format
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// File list
// ---------------------------------------------------------------------------

function FileList({
    files,
    onRemove,
    disabled,
}: {
    files: File[];
    onRemove: (name: string) => void;
    disabled: boolean;
}) {
    if (files.length === 0) return null;

    return (
        <ul className="border rounded-lg divide-y text-xs">
            {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 truncate font-mono text-foreground/80">
                        {f.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground/60">
                        {f.size < 1024
                            ? `${f.size} B`
                            : `${(f.size / 1024).toFixed(1)} KB`}
                    </span>
                    <button
                        className="shrink-0 px-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                        onClick={() => onRemove(f.name)}
                        disabled={disabled}
                        title="Remove"
                    >
                        ×
                    </button>
                </li>
            ))}
        </ul>
    );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface AnalyzeModalProps {
    /** Display name of the graph type, e.g. "Architecture". */
    typeName: string;
    onClose: () => void;
    /** Called with the individual file entries. */
    onAnalyze: (files: FileEntry[]) => Promise<void>;
}

export function AnalyzeModal({ typeName, onClose, onAnalyze }: AnalyzeModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addFiles = useCallback((incoming: File[]) => {
        setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
        });
    }, []);

    const removeFile = useCallback((name: string) => {
        setFiles((prev) => prev.filter((f) => f.name !== name));
    }, []);

    async function handleAnalyze() {
        if (files.length === 0 || isAnalyzing) return;
        setError(null);
        setIsAnalyzing(true);
        try {
            const entries: FileEntry[] = await Promise.all(
                files.map(async (file) => ({
                    name: file.name,
                    content: await file.text(),
                })),
            );
            await onAnalyze(entries);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed.");
        } finally {
            setIsAnalyzing(false);
        }
    }

    function handleBackdropClick(e: React.MouseEvent) {
        if (e.target === e.currentTarget && !isAnalyzing) onClose();
    }

    const canAnalyze = files.length > 0 && !isAnalyzing;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-sm font-semibold">
                        Analyze {typeName} from files
                    </h2>
                    <button
                        className="text-lg leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
                        onClick={onClose}
                        disabled={isAnalyzing}
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
                    <DropZone onFilesAdded={addFiles} />
                    <FileList files={files} onRemove={removeFile} disabled={isAnalyzing} />
                    {error && (
                        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t shrink-0">
                    <span className="text-xs text-muted-foreground">
                        {files.length === 0
                            ? "No files selected"
                            : `${files.length} file${files.length !== 1 ? "s" : ""} selected`}
                    </span>
                    <div className="flex gap-2">
                        <button
                            className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-40"
                            onClick={onClose}
                            disabled={isAnalyzing}
                        >
                            Cancel
                        </button>
                        <button
                            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            onClick={handleAnalyze}
                            disabled={!canAnalyze}
                        >
                            {isAnalyzing ? "Analyzing…" : "Analyze"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
