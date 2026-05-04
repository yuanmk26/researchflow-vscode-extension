import * as vscode from "vscode";

import { AgentRuntime } from "../agent/agentRuntime";
import { AgentContextItem, AgentPatchApproval, AgentTask, AgentTaskEvent } from "../agent/agentTypes";
import { createDefaultBoundaryPolicy } from "../agent/boundaryPolicy";
import { MockAgentRuntime } from "../agent/mockAgentRuntime";

export type ResearchFlowAgentContextItem = AgentContextItem;

export class ResearchFlowAgentService implements vscode.Disposable {
  public constructor(private readonly runtime: AgentRuntime & vscode.Disposable = new MockAgentRuntime()) {}

  public async startTask(
    text: string,
    contextItems: readonly ResearchFlowAgentContextItem[] = []
  ): Promise<AgentTask> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before starting a ResearchFlow Agent task.");
    }

    const activeEditor = vscode.window.activeTextEditor;
    const activeFile = activeEditor?.document.uri.scheme === "file" ? activeEditor.document.uri.fsPath : undefined;
    const boundary = createDefaultBoundaryPolicy(workspaceFolder.uri.fsPath, contextItems);

    return this.runtime.createTask({
      goal: text,
      workspaceRoot: workspaceFolder.uri.fsPath,
      activeFile,
      contextItems,
      boundary
    });
  }

  public onTaskEvent(taskId: string, listener: (event: AgentTaskEvent) => void): vscode.Disposable {
    return this.runtime.onTaskEvent(taskId, listener);
  }

  public async cancelTask(taskId: string): Promise<void> {
    await this.runtime.cancelTask(taskId);
  }

  public async approveTaskPatch(taskId: string, patchId: string, approval: AgentPatchApproval): Promise<void> {
    await this.runtime.approveTaskPatch(taskId, patchId, approval);
  }

  public dispose(): void {
    this.runtime.dispose();
  }
}
