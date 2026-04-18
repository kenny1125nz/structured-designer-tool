import { useState, useRef, useCallback } from "react";
import type { AnalysisResult } from "@/graph-types/code/analyzer";
import { FileEntry } from "@/graph-types/registry";

// ---------------------------------------------------------------------------
// Source state
// ---------------------------------------------------------------------------

type CodeSource =
    | { kind: "zip"; file: File }
    | { kind: "folder-entry"; entry: FileSystemDirectoryEntry; name: string }
    | { kind: "folder-files"; files: File[]; name: string };

function sourceName(src: CodeSource): string {
    return src.kind === "zip" ? src.file.name : src.name;
}

function sourceLabel(src: CodeSource): string {
    return src.kind === "zip" ? "zip archive" : "folder";
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function DropZone({
    onSource,
    disabled,
}: {
    onSource: (src: CodeSource) => void;
    disabled: boolean;
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const zipInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Element)) {
            setIsDragOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const items = Array.from(e.dataTransfer.items);
        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (!entry) continue;

            if (entry.isDirectory) {
                onSource({ kind: "folder-entry", entry: entry as FileSystemDirectoryEntry, name: entry.name });
                return;
            }
            if (entry.isFile && entry.name.toLowerCase().endsWith(".zip")) {
                const file = item.getAsFile();
                if (file) { onSource({ kind: "zip", file }); return; }
            }
        }
    }, [onSource]);

    const handleZipInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onSource({ kind: "zip", file });
        e.target.value = "";
    }, [onSource]);

    const handleFolderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        // Snapshot into a plain array BEFORE clearing the input — FileList is a
        // live reference and becomes empty once e.target.value is reset.
        const files = Array.from(fileList);
        const root = files[0].webkitRelativePath.split("/")[0] ?? "project";
        onSource({ kind: "folder-files", files, name: root });
        e.target.value = "";
    }, [onSource]);

    return (
        <div
            className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-default select-none transition-colors ${isDragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30"
                } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <p className="text-sm text-muted-foreground text-center">
                Drop a <span className="font-medium text-foreground">.zip archive</span> or a{" "}
                <span className="font-medium text-foreground">project folder</span>
            </p>
            <p className="text-xs text-muted-foreground/60 text-center">
                node_modules, dist, build, .git and other generated directories are excluded
            </p>

            <div className="flex gap-3 mt-1">
                <button
                    className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
                    onClick={() => zipInputRef.current?.click()}
                    type="button"
                >
                    Browse zip…
                </button>
                <button
                    className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
                    onClick={() => folderInputRef.current?.click()}
                    type="button"
                >
                    Browse folder…
                </button>
            </div>

            <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={handleZipInput}
            />
            <input
                ref={folderInputRef}
                type="file"
                /* @ts-expect-error — webkitdirectory is not in React's typings */
                webkitdirectory=""
                className="hidden"
                onChange={handleFolderInput}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Selected source display
// ---------------------------------------------------------------------------

function SourceCard({
    source,
    onClear,
    disabled,
}: {
    source: CodeSource;
    onClear: () => void;
    disabled: boolean;
}) {
    const icon = source.kind === "zip" ? "📦" : "📁";
    const size =
        source.kind === "zip"
            ? source.file.size < 1024 * 1024
                ? `${(source.file.size / 1024).toFixed(1)} KB`
                : `${(source.file.size / (1024 * 1024)).toFixed(1)} MB`
            : null;

    return (
        <div className="border rounded-lg px-3 py-2.5 flex items-center gap-2 text-xs">
            <span className="text-base leading-none">{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="font-mono truncate text-foreground/80">{sourceName(source)}</p>
                <p className="text-muted-foreground/70 mt-0.5">
                    {sourceLabel(source)}
                    {size ? ` · ${size}` : ""}
                </p>
            </div>
            <button
                className="shrink-0 px-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                onClick={onClear}
                disabled={disabled}
                title="Remove"
            >
                ×
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface AnalyzeCodeModalProps {
    onClose: () => void;
    onAnalyze: (result: AnalysisResult) => Promise<void>;
}

export function AnalyzeCodeModal({ onClose, onAnalyze }: AnalyzeCodeModalProps) {
    const [source, setSource] = useState<CodeSource | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleAnalyze() {
        if (!source || isAnalyzing) return;
        setError(null);
        setIsAnalyzing(true);

        try {
            const { analyzeFiles, extractFolderFromEntry, extractFolderFromFileList } =
                await import("@/graph-types/code/analyzer");

            let files: Map<string, string>;
            let name: string;

            if (source.kind === "zip") {
                setProgress("Extracting zip…");
                const { extractZip } = await import("@/graph-types/code/analyzer/zip-extractor");
                files = await extractZip(source.file);
                name = source.file.name.replace(/\.zip$/i, "");
            } else if (source.kind === "folder-entry") {

                setProgress("Reading folder…");
                files = await extractFolderFromEntry(source.entry);
                name = source.name;
            } else {
                setProgress("Reading folder…");
                files = await extractFolderFromFileList(source.files);
                name = source.name;
            }

            setProgress(`Analysing ${files.size} source file${files.size !== 1 ? "s" : ""}…`);
            const result = await analyzeFiles(files, name);
            await onAnalyze(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed.");
        } finally {
            setIsAnalyzing(false);
            setProgress(null);
        }
    }

    function handleBackdropClick(e: React.MouseEvent) {
        if (e.target === e.currentTarget && !isAnalyzing) onClose();
    }

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-sm font-semibold">Analyze Codebase</h2>
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
                <div className="p-4 flex flex-col gap-3">
                    {source ? (
                        <SourceCard source={source} onClear={() => setSource(null)} disabled={isAnalyzing} />
                    ) : (
                        <DropZone onSource={setSource} disabled={isAnalyzing} />
                    )}

                    {progress && (
                        <p className="text-xs text-muted-foreground animate-pulse">{progress}</p>
                    )}
                    {error && (
                        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
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
                        disabled={!source || isAnalyzing}
                    >
                        {isAnalyzing ? "Analyzing…" : "Analyze"}
                    </button>
                </div>
            </div>
        </div>
    );
}
