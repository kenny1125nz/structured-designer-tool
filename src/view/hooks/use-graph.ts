// Hook for loading and persisting the active graph document

import { useCallback, useEffect, useState } from "react";
import type { Node } from "@/model/types";
import {
  listGraphs,
  loadGraph,
  saveGraph,
  createGraph,
  removeGraph,
  importGraph as importGraphService,
} from "@/model/services/graph-service";

export interface UseGraphReturn {
  graphs: Node[];
  activeGraph: Node | null;
  loading: boolean;
  selectGraph: (id: string) => Promise<void>;
  newGraph: (label: string, type: string) => Promise<void>;
  updateGraph: (graph: Node) => Promise<void>;
  deleteGraph: (id: string) => Promise<void>;
  importGraph: (node: Node) => Promise<void>;
}

export function useGraph(): UseGraphReturn {
  const [graphs, setGraphs] = useState<Node[]>([]);
  const [activeGraph, setActiveGraph] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listGraphs()
      .then(setGraphs)
      .finally(() => setLoading(false));
  }, []);

  const selectGraph = useCallback(async (id: string) => {
    const graph = await loadGraph(id);
    setActiveGraph(graph ?? null);
  }, []);

  const newGraph = useCallback(async (label: string, type: string) => {
    const graph = await createGraph(label, type);
    setGraphs((prev) => [...prev, graph]);
    setActiveGraph(graph);
  }, []);

  const updateGraph = useCallback(async (graph: Node) => {
    await saveGraph(graph);
    setGraphs((prev) => prev.map((g) => (g.id === graph.id ? graph : g)));
    setActiveGraph((prev) => (prev?.id === graph.id ? graph : prev));
  }, []);

  const deleteGraph = useCallback(async (id: string) => {
    await removeGraph(id);
    setGraphs((prev) => prev.filter((g) => g.id !== id));
    setActiveGraph((prev) => (prev?.id === id ? null : prev));
  }, []);

  const importGraph = useCallback(async (node: Node) => {
    const graph = await importGraphService(node);
    setGraphs((prev) => [...prev, graph]);
    setActiveGraph(graph);
  }, []);

  return {
    graphs,
    activeGraph,
    loading,
    selectGraph,
    newGraph,
    updateGraph,
    deleteGraph,
    importGraph,
  };
}
