import * as vscode from "vscode";

import { AgentRuntime } from "../agent/agentRuntime";
import { AgentContextItem, AgentPatchApproval, AgentTask, AgentTaskEvent } from "../agent/agentTypes";
import { createDefaultBoundaryPolicy } from "../agent/boundaryPolicy";
import { LocalAgentWorkerClient } from "../agent/localAgentWorkerClient";

export type ResearchFlowAgentContextItem = AgentContextItem;

const DEEPSEEK_API_KEY_SECRET = "researchflow.deepseek.apiKey";
const DEEPSEEK_MODEL_KEY = "researchflow.deepseek.model";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export class ResearchFlowAgentService implements vscode.Disposable {
  private readonly runtime: AgentRuntime & vscode.Disposable;
  private readonly workerClient?: LocalAgentWorkerClient;

  public constructor(private readonly context: vscode.ExtensionContext, runtime?: AgentRuntime & vscode.Disposable) {
    if (runtime) {
      this.runtime = runtime;
      return;
    }
    this.workerClient = new LocalAgentWorkerClient(context.extensionUri);
    this.runtime = this.workerClient;
  }

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
    const deepSeekConfig = await this.getDeepSeekConfig();

    if (!deepSeekConfig.apiKey) {
      throw new Error("DeepSeek API key is not configured. Click Configure API Key in ResearchFlow Chat to set it.");
    }

    this.workerClient?.setWorkerEnvironment({
      DEEPSEEK_API_KEY: deepSeekConfig.apiKey
    });

    return this.runtime.createTask({
      goal: text,
      workspaceRoot: workspaceFolder.uri.fsPath,
      activeFile,
      contextItems,
      boundary,
      model: {
        provider: "deepseek",
        id: deepSeekConfig.model
      }
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

  public async configureDeepSeekApiKey(): Promise<string | undefined> {
    const currentApiKey = await this.context.secrets.get(DEEPSEEK_API_KEY_SECRET);
    const apiKey = await vscode.window.showInputBox({
      title: "Configure DeepSeek API Key",
      prompt: currentApiKey ? "Enter a new DeepSeek API key, or leave empty to keep the current key." : "Enter a DeepSeek API key.",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!currentApiKey && value.trim().length === 0) {
          return "DeepSeek API key is required.";
        }
        return undefined;
      }
    });

    if (apiKey === undefined) {
      return undefined;
    }

    const trimmedApiKey = apiKey.trim();
    if (trimmedApiKey.length > 0) {
      await this.context.secrets.store(DEEPSEEK_API_KEY_SECRET, trimmedApiKey);
      this.workerClient?.setWorkerEnvironment({ DEEPSEEK_API_KEY: trimmedApiKey });
    }

    const currentModel = this.getDeepSeekModel();
    const model = await vscode.window.showInputBox({
      title: "Configure DeepSeek Model",
      prompt: "Enter the DeepSeek model id.",
      value: currentModel,
      placeHolder: DEFAULT_DEEPSEEK_MODEL,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (value.trim().length === 0) {
          return "DeepSeek model id is required.";
        }
        return undefined;
      }
    });

    if (model === undefined) {
      return undefined;
    }

    const trimmedModel = model.trim();
    await this.context.globalState.update(DEEPSEEK_MODEL_KEY, trimmedModel);

    return `DeepSeek API key configured. Model: ${trimmedModel}`;
  }

  public dispose(): void {
    this.runtime.dispose();
  }

  private async getDeepSeekConfig(): Promise<{ apiKey: string | undefined; model: string }> {
    return {
      apiKey: await this.context.secrets.get(DEEPSEEK_API_KEY_SECRET),
      model: this.getDeepSeekModel()
    };
  }

  private getDeepSeekModel(): string {
    return this.context.globalState.get<string>(DEEPSEEK_MODEL_KEY, DEFAULT_DEEPSEEK_MODEL);
  }
}
