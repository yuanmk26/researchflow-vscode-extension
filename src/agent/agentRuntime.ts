import * as vscode from "vscode";

import { AgentPatchApproval, AgentTask, AgentTaskEvent, AgentTaskRequest } from "./agentTypes";

export interface AgentRuntime {
  createTask(request: AgentTaskRequest): Promise<AgentTask>;
  onTaskEvent(taskId: string, listener: (event: AgentTaskEvent) => void): vscode.Disposable;
  cancelTask(taskId: string): Promise<void>;
  approveTaskPatch(taskId: string, patchId: string, approval: AgentPatchApproval): Promise<void>;
}
