import { useState } from "react";

// ---------------------------------------------------------------------------
// Modal model — which analysis / import wizard is open.
// ---------------------------------------------------------------------------

export interface ModalModel {
  /** Non-null = the markdown-analysis modal is open for this graph type. */
  analyzeModalType: string | null;
  showCodeModal: boolean;
  showWorkspaceModal: boolean;
  openMarkdown: (graphType: string) => void;
  closeMarkdown: () => void;
  openCode: () => void;
  closeCode: () => void;
  openWorkspace: () => void;
  closeWorkspace: () => void;
}

export function useModalModel(): ModalModel {
  const [analyzeModalType, setAnalyzeModalType] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  return {
    analyzeModalType,
    showCodeModal,
    showWorkspaceModal,
    openMarkdown: setAnalyzeModalType,
    closeMarkdown: () => setAnalyzeModalType(null),
    openCode: () => setShowCodeModal(true),
    closeCode: () => setShowCodeModal(false),
    openWorkspace: () => setShowWorkspaceModal(true),
    closeWorkspace: () => setShowWorkspaceModal(false),
  };
}
