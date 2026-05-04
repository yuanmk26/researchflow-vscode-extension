import * as path from "path";

import { AgentBoundaryPolicy, AgentContextItem } from "./agentTypes";

const DENIED_PATH_NAMES = [".git", "node_modules", "out", ".vscode-test"];

export function createDefaultBoundaryPolicy(
  workspaceRoot: string,
  contextItems: readonly AgentContextItem[]
): AgentBoundaryPolicy {
  const readableRoots = Array.from(new Set([workspaceRoot, ...contextItems.map((item) => item.path)]));
  const deniedPaths = DENIED_PATH_NAMES.map((name) => path.join(workspaceRoot, name));

  return {
    approvalPolicy: "diff-before-write",
    readableRoots,
    writableRoots: [workspaceRoot],
    deniedPaths,
    allowedCommands: ["git status", "npm run compile", "npm test"]
  };
}
