// Central registry — the only place that knows about all graph types.
// Everything outside graph-types/ imports from here, never from module internals.

import type { NodeType } from "@/model/types";
import type { Node } from "@/model/types";
import type { ChatStrategy } from "@/controller/ai/graph-chat";

import { DOCUMENT, analyzeMarkdowns } from "./document";
import { ARCHITECTURE, analyzeArchitectureMarkdown } from "./architecture";
import { CODE } from "./code";
import { WORKSPACE, analyzeWorkspace } from "./workspace";

import { documentChatStrategy } from "./document/chat-strategy";
import { architectureChatStrategy } from "./architecture/chat-strategy";
import { codeChatStrategy } from "./code/chat-strategy";
import { workspaceChatStrategy } from "./workspace/chat-strategy";

import { applyDocumentLayout } from "./document/layout";
import { applyArchitectureLayout } from "./architecture/layout";
import { applyCodeLayout } from "./code/layout";
import { applyWorkspaceLayout } from "./workspace/layout";


/** A single file entry passed to analyzer functions. */
export interface FileEntry {
  name: string;
  content: string;
}

/** Analyzer function contract — pure, no storage side effects. */
export type AnalyzerFn = (files: FileEntry[]) => Promise<Node>;

/**
 * Transform function contract — receives the raw Node tree and optional
 * expanded-subgraph id set (used by workspace), returns a layout-ready tree.
 */
export type GraphTransformFn = (root: Node, expandedIds?: Set<string>) => Node;

export const NODE_TYPES: NodeType[] = [DOCUMENT, ARCHITECTURE, CODE, WORKSPACE];



/**
 * Per-type layout transforms applied before calling setDocument on the canvas.
 * Workspace transform also accepts an optional set of expanded child ids.
 */
export const TRANSFORM_REGISTRY: Record<string, GraphTransformFn> = {
  [DOCUMENT.id]: (root) => applyDocumentLayout(root),
  [ARCHITECTURE.id]: (root) => applyArchitectureLayout(root),
  [CODE.id]: (root) => applyCodeLayout(root),
  [WORKSPACE.id]: (root, expandedIds) => applyWorkspaceLayout(root, expandedIds ?? new Set()),
};

export const ANALYZER_REGISTRY: Record<string, AnalyzerFn> = {
  [DOCUMENT.id]: analyzeMarkdowns,
  [ARCHITECTURE.id]: analyzeArchitectureMarkdown,
  [WORKSPACE.id]: analyzeWorkspace,
};

export const CHAT_STRATEGY_REGISTRY: Record<string, ChatStrategy> = {
  [DOCUMENT.id]: documentChatStrategy,
  [ARCHITECTURE.id]: architectureChatStrategy,
  [CODE.id]: codeChatStrategy,
  [WORKSPACE.id]: workspaceChatStrategy,
};
