export type AgentTaskStatus =
  | "queued"
  | "running"
  | "waitingApproval"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentContextKind = "file";

export interface AgentContextItem {
  label: string;
  path: string;
  kind: AgentContextKind;
}

export interface AgentBoundaryPolicy {
  approvalPolicy: "diff-before-write";
  readableRoots: string[];
  writableRoots: string[];
  deniedPaths: string[];
  allowedCommands: string[];
}

export interface AgentTaskRequest {
  goal: string;
  workspaceRoot: string;
  activeFile?: string;
  contextItems: readonly AgentContextItem[];
  boundary: AgentBoundaryPolicy;
  model?: AgentModelSelection;
}

export interface AgentTask {
  id: string;
  goal: string;
  status: AgentTaskStatus;
}

export interface AgentPatchProposal {
  id: string;
  title: string;
  summary: string;
  patch: string;
}

export type AgentTaskEvent =
  | { type: "status"; taskId: string; status: AgentTaskStatus }
  | { type: "assistantText"; taskId: string; text: string }
  | { type: "toolLog"; taskId: string; message: string }
  | { type: "patchReady"; taskId: string; patch: AgentPatchProposal }
  | { type: "approvalRequired"; taskId: string; patchId: string }
  | { type: "verification"; taskId: string; success: boolean; output: string }
  | { type: "error"; taskId: string; message: string };

export type AgentPatchApproval = "approved" | "rejected";

export interface AgentModelSelection {
  provider: "deepseek";
  id: string;
}
