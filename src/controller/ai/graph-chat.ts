// Generic LLM chat engine for graph adjustment.
//
// Each graph type registers a ChatStrategy in the graph-types registry.
// This module contains only the interface definition and the dispatch loop —
// all type-specific prompts and serialisation live inside their respective
// graph-type folders.

import type { Node } from "@/model/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Options controlling what extra context is sent to the LLM. */
export interface ChatOptions {
  /**
   * When true the strategy includes the "source" input as additional context:
   *   - code graphs  → AST version
   *   - architecture → source documents (Docs version)
   * Defaults to false; the LLM only sees the current editable graph.
   */
  includeSource?: boolean;
}

/**
 * A graph-type-specific plug-in that tells the generic engine how to talk to
 * the LLM for that type.
 *
 * Implement this interface in  src/graph-types/<type>/chat-strategy.ts  and
 * register the instance in  src/graph-types/registry.ts.
 */
export interface ChatStrategy {
  /** The system prompt for this graph type. */
  systemPrompt: string;

  /**
   * Serialises the current root Node into a user-turn context string that is
   * prepended to the conversation before the real user messages.
   */
  buildContext(root: Node, options?: ChatOptions): string;

  /**
   * Converts the raw parsed LLM JSON response back into an updated root Node.
   * Should merge persisted positions/sizes from `original` where possible.
   */
  applyResult(result: unknown, original: Node): Node;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Adjusts `root` based on the conversation `messages` using the strategy
 * registered for its graph type.
 *
 * Throws if no strategy is registered for `root.type`.
 */
export async function chatAdjustGraph(
  messages: ChatMessage[],
  root: Node,
  options?: ChatOptions,
): Promise<Node> {
  const [{ callAiMultiTurn }, { CHAT_STRATEGY_REGISTRY }] = await Promise.all([
    import("@/controller/ai/client"),
    import("@/graph-types/registry"),
  ]);

  const strategy: ChatStrategy | undefined = CHAT_STRATEGY_REGISTRY[root.type];
  if (!strategy) {
    throw new Error(
      `No chat strategy registered for graph type "${root.type}". ` +
        `Add one in src/graph-types/${root.type}/chat-strategy.ts and register it in the registry.`,
    );
  }

  const context = strategy.buildContext(root, options);

  const fullMessages: ChatMessage[] = [
    { role: "user", content: context },
    { role: "assistant", content: "Understood. What would you like to change?" },
    ...messages,
  ];

  const result = await callAiMultiTurn<unknown>(strategy.systemPrompt, fullMessages);
  return strategy.applyResult(result, root);
}
