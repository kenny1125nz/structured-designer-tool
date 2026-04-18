import { useRef, useState, useEffect } from "react";
import { NODE_TYPES } from "@/graph-types/registry";

const TYPE_LABELS: Record<string, string> = {
    document: "Document",
    architecture: "Architecture",
    code: "Code",
    workspace: "Workspace",
};

interface NewGraphMenuProps {
    onAnalyzeFromMarkdown: (type: string) => void;
    onAnalyzeCode: () => void;
    onAnalyzeWorkspace: () => void;
}

export function NewGraphMenu({ onAnalyzeFromMarkdown, onAnalyzeCode, onAnalyzeWorkspace }: NewGraphMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    function handleSelect(type: string) {
        setOpen(false);
        if (type === "code") onAnalyzeCode();
        else if (type === "workspace") onAnalyzeWorkspace();
        else onAnalyzeFromMarkdown(type);
    }

    return (
        <div ref={ref} className="relative">
            <button
                className="text-xs px-2 py-1 rounded border hover:bg-muted"
                onClick={() => setOpen((v) => !v)}
            >
                + New
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded border bg-white shadow-md py-1">
                    {NODE_TYPES.map((nt) => (
                        <button
                            key={nt.id}
                            className="w-full text-left text-xs px-3 py-1.5 hover:bg-muted"
                            onClick={() => handleSelect(nt.id)}
                        >
                            {TYPE_LABELS[nt.id] ?? nt.id}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
