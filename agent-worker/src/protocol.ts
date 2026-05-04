export type AgentTaskStatus =
  | "queued"
  | "running"
  | "waitingApproval"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentContextItem {
  label: string;
  path: string;
  kind: "file";
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

export interface AgentWorkerRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: number;
  method: "agent.createTask" | "agent.cancelTask" | "agent.approvePatch";
  params: TParams;
}

export interface AgentWorkerResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: TResult;
  error?: {
    message: string;
  };
}

export interface AgentWorkerNotification<TParams = unknown> {
  jsonrpc: "2.0";
  method: "agent.event";
  params: TParams;
}

export interface AgentCreateTaskParams {
  request: AgentTaskRequest;
}

export interface AgentCancelTaskParams {
  taskId: string;
}

export interface AgentApprovePatchParams {
  taskId: string;
  patchId: string;
  approval: AgentPatchApproval;
}
