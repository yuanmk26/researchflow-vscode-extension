import * as vscode from "vscode";

import { AgentPatchApproval, AgentTaskEvent } from "../agent/agentTypes";
import { ResearchFlowAgentContextItem, ResearchFlowAgentService } from "../services/researchFlowAgentService";

type ChatRole = "user" | "assistant";

interface WebviewSendMessage {
  type: "sendMessage";
  text: string;
}

interface WebviewAddCurrentFile {
  type: "addCurrentFile";
}

interface WebviewAddFiles {
  type: "addFiles";
}

interface WebviewRemoveContext {
  type: "removeContext";
  path: string;
}

interface WebviewClearContext {
  type: "clearContext";
}

interface WebviewApprovePatch {
  type: "approvePatch";
  taskId: string;
  patchId: string;
}

interface WebviewRejectPatch {
  type: "rejectPatch";
  taskId: string;
  patchId: string;
}

interface WebviewCancelTask {
  type: "cancelTask";
  taskId: string;
}

interface WebviewConfigureApiKey {
  type: "configureApiKey";
}

type WebviewInboundMessage =
  | WebviewSendMessage
  | WebviewAddCurrentFile
  | WebviewAddFiles
  | WebviewRemoveContext
  | WebviewClearContext
  | WebviewApprovePatch
  | WebviewRejectPatch
  | WebviewCancelTask
  | WebviewConfigureApiKey;

export class ResearchFlowChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "researchflow.chat";

  private view?: vscode.WebviewView;
  private activeTaskId?: string;
  private taskEventSubscription?: vscode.Disposable;
  private readonly contextItems: ResearchFlowAgentContextItem[] = [];

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentService: ResearchFlowAgentService
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      if (message.type === "sendMessage") {
        void this.handleSendMessage(message.text);
      }
      if (message.type === "addCurrentFile") {
        void this.handleAddCurrentFile();
      }
      if (message.type === "addFiles") {
        void this.handleAddFiles();
      }
      if (message.type === "removeContext") {
        this.removeContextItem(message.path);
      }
      if (message.type === "clearContext") {
        this.clearContextItems();
      }
      if (message.type === "approvePatch") {
        void this.handlePatchApproval(message.taskId, message.patchId, "approved");
      }
      if (message.type === "rejectPatch") {
        void this.handlePatchApproval(message.taskId, message.patchId, "rejected");
      }
      if (message.type === "cancelTask") {
        void this.handleCancelTask(message.taskId);
      }
      if (message.type === "configureApiKey") {
        void this.handleConfigureApiKey();
      }
    });
    this.postContextItems();
  }

  public dispose(): void {
    this.taskEventSubscription?.dispose();
  }

  private async handleSendMessage(text: string): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText || !this.view) {
      return;
    }

    this.postAppendMessage("user", trimmedText);
    this.postSetBusy(true);

    try {
      this.taskEventSubscription?.dispose();
      const task = await this.agentService.startTask(trimmedText, this.contextItems);
      this.activeTaskId = task.id;
      this.postSetActiveTask(task.id);
      this.taskEventSubscription = this.agentService.onTaskEvent(task.id, (event) => {
        this.handleAgentTaskEvent(event);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.postError(formatAgentError(message));
      this.postSetBusy(false);
    }
  }

  private async handleConfigureApiKey(): Promise<void> {
    try {
      const message = await this.agentService.configureDeepSeekApiKey();
      if (message) {
        this.postAppendMessage("assistant", message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.postError(`Failed to configure DeepSeek API key: ${message}`);
    }
  }

  private async handlePatchApproval(taskId: string, patchId: string, approval: AgentPatchApproval): Promise<void> {
    try {
      await this.agentService.approveTaskPatch(taskId, patchId, approval);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.postError(`Failed to ${approval === "approved" ? "approve" : "reject"} patch: ${message}`);
    }
  }

  private async handleCancelTask(taskId: string): Promise<void> {
    try {
      await this.agentService.cancelTask(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.postError(`Failed to cancel task: ${message}`);
    }
  }

  private handleAgentTaskEvent(event: AgentTaskEvent): void {
    this.postTaskEvent(event.type === "error" ? { ...event, message: formatAgentError(event.message) } : event);
    if (event.type === "status" && isTerminalStatus(event.status)) {
      this.activeTaskId = undefined;
      this.postSetBusy(false);
      this.postSetActiveTask(undefined);
    }
  }

  private async handleAddCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.postError("No active editor file to add as context.");
      return;
    }

    this.addContextItem(editor.document.uri);
  }

  private async handleAddFiles(): Promise<void> {
    const selectedFiles = await vscode.window.showOpenDialog({
      title: "Add files as ResearchFlow chat context",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Add Context"
    });

    if (!selectedFiles) {
      return;
    }

    for (const uri of selectedFiles) {
      this.addContextItem(uri);
    }
  }

  private addContextItem(uri: vscode.Uri): void {
    if (uri.scheme !== "file") {
      this.postError("Only local files can be added as chat context.");
      return;
    }

    const path = uri.fsPath;
    if (this.contextItems.some((item) => item.path === path)) {
      return;
    }

    this.contextItems.push({
      label: vscode.workspace.asRelativePath(uri, false),
      path,
      kind: "file"
    });
    this.postContextItems();
  }

  private removeContextItem(path: string): void {
    const index = this.contextItems.findIndex((item) => item.path === path);
    if (index < 0) {
      return;
    }

    this.contextItems.splice(index, 1);
    this.postContextItems();
  }

  private clearContextItems(): void {
    if (this.contextItems.length === 0) {
      return;
    }

    this.contextItems.splice(0, this.contextItems.length);
    this.postContextItems();
  }

  private postAppendMessage(role: ChatRole, text: string): void {
    void this.view?.webview.postMessage({ type: "appendMessage", role, text });
  }

  private postSetBusy(busy: boolean): void {
    void this.view?.webview.postMessage({ type: "setBusy", busy });
  }

  private postSetActiveTask(taskId: string | undefined): void {
    void this.view?.webview.postMessage({ type: "setActiveTask", taskId });
  }

  private postTaskEvent(event: AgentTaskEvent): void {
    void this.view?.webview.postMessage({ type: "taskEvent", event });
  }

  private postError(message: string): void {
    void this.view?.webview.postMessage({ type: "error", message });
  }

  private postContextItems(): void {
    void this.view?.webview.postMessage({ type: "setContextItems", items: this.contextItems });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResearchFlow Chat</title>
  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .empty {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
      padding: 16px;
    }

    .message,
    .task-event {
      margin: 0 0 12px;
      padding: 8px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .message.user {
      background: var(--vscode-input-background);
    }

    .message.assistant,
    .task-event {
      background: var(--vscode-editorWidget-background);
    }

    .task-event.patch {
      background: var(--vscode-textCodeBlock-background, var(--vscode-editorWidget-background));
    }

    .role,
    .task-label {
      display: block;
      margin-bottom: 5px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-transform: uppercase;
    }

    .error {
      margin: 0 0 12px;
      padding: 8px 10px;
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border-radius: 6px;
      line-height: 1.4;
    }

    .patch-body {
      max-height: 260px;
      overflow: auto;
      margin: 8px 0;
      padding: 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 12px);
      white-space: pre;
    }

    .task-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .composer {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--vscode-sideBar-background);
    }

    .context-bar,
    .input-row {
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .context-bar {
      align-items: center;
      flex-wrap: wrap;
    }

    .input-row {
      align-items: flex-end;
    }

    .context-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .context-chip {
      display: inline-flex;
      align-items: center;
      max-width: 220px;
      min-height: 24px;
      padding: 2px 6px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      gap: 4px;
    }

    .context-chip span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    textarea {
      flex: 1;
      min-width: 0;
      min-height: 78px;
      max-height: 180px;
      resize: vertical;
      padding: 10px 11px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      outline: none;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
      line-height: 1.4;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    button {
      flex: 0 0 auto;
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    .secondary-button,
    .icon-button {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    .secondary-button:hover:not(:disabled),
    .icon-button:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .icon-button {
      min-height: 22px;
      padding: 0 6px;
    }

    button:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      cursor: default;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <main id="messages" class="messages" aria-live="polite">
    <div id="empty" class="empty">Assign ResearchFlow an implementation task for this workspace.</div>
  </main>
  <form id="composer" class="composer">
    <div class="context-bar">
      <span class="context-label">Context</span>
      <button id="configureApiKey" class="secondary-button" type="button">Configure API Key</button>
      <button id="addCurrentFile" class="secondary-button" type="button">Current File</button>
      <button id="addFiles" class="secondary-button" type="button">Add File</button>
      <button id="clearContext" class="secondary-button" type="button" disabled>Clear</button>
      <div id="contextItems" class="context-bar"></div>
    </div>
    <div class="input-row">
      <textarea id="input" rows="3" aria-label="Assign ResearchFlow Agent task" placeholder="Assign an implementation task"></textarea>
      <button id="send" type="submit">Start</button>
      <button id="cancelTask" class="secondary-button" type="button" disabled>Cancel</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById("messages");
    const empty = document.getElementById("empty");
    const composer = document.getElementById("composer");
    const input = document.getElementById("input");
    const send = document.getElementById("send");
    const cancelTask = document.getElementById("cancelTask");
    const configureApiKey = document.getElementById("configureApiKey");
    const addCurrentFile = document.getElementById("addCurrentFile");
    const addFiles = document.getElementById("addFiles");
    const clearContext = document.getElementById("clearContext");
    const contextItems = document.getElementById("contextItems");
    let busy = false;
    let activeTaskId;

    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    cancelTask.addEventListener("click", () => {
      if (activeTaskId) {
        vscode.postMessage({ type: "cancelTask", taskId: activeTaskId });
      }
    });

    configureApiKey.addEventListener("click", () => {
      vscode.postMessage({ type: "configureApiKey" });
    });

    addCurrentFile.addEventListener("click", () => {
      vscode.postMessage({ type: "addCurrentFile" });
    });

    addFiles.addEventListener("click", () => {
      vscode.postMessage({ type: "addFiles" });
    });

    clearContext.addEventListener("click", () => {
      vscode.postMessage({ type: "clearContext" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "appendMessage") {
        appendMessage(message.role, message.text);
      }
      if (message.type === "setBusy") {
        setBusy(message.busy);
      }
      if (message.type === "setActiveTask") {
        activeTaskId = message.taskId;
        cancelTask.disabled = !activeTaskId;
      }
      if (message.type === "taskEvent") {
        appendTaskEvent(message.event);
      }
      if (message.type === "error") {
        appendError(message.message);
      }
      if (message.type === "setContextItems") {
        renderContextItems(message.items || []);
      }
    });

    function sendMessage() {
      const text = input.value.trim();
      if (!text || busy) {
        return;
      }

      input.value = "";
      vscode.postMessage({ type: "sendMessage", text });
    }

    function appendMessage(role, text) {
      clearEmpty();
      const item = document.createElement("article");
      item.className = "message " + role;

      const roleLabel = document.createElement("strong");
      roleLabel.className = "role";
      roleLabel.textContent = role === "user" ? "You" : "ResearchFlow";

      const body = document.createElement("div");
      body.textContent = text;

      item.append(roleLabel, body);
      messages.append(item);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendTaskEvent(event) {
      if (!event) {
        return;
      }

      if (event.type === "patchReady") {
        appendPatchEvent(event);
        return;
      }

      if (event.type === "assistantText") {
        appendMessage("assistant", event.text);
        return;
      }

      const text = formatTaskEvent(event);
      if (!text) {
        return;
      }

      clearEmpty();
      const item = document.createElement("article");
      item.className = "task-event";

      const label = document.createElement("strong");
      label.className = "task-label";
      label.textContent = event.type;

      const body = document.createElement("div");
      body.textContent = text;

      item.append(label, body);
      messages.append(item);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendPatchEvent(event) {
      clearEmpty();
      const patch = event.patch;
      const item = document.createElement("article");
      item.className = "task-event patch";

      const label = document.createElement("strong");
      label.className = "task-label";
      label.textContent = "patch proposal";

      const title = document.createElement("div");
      title.textContent = patch.title + ": " + patch.summary;

      const body = document.createElement("pre");
      body.className = "patch-body";
      body.textContent = patch.patch;

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => {
        approve.disabled = true;
        reject.disabled = true;
        vscode.postMessage({ type: "approvePatch", taskId: event.taskId, patchId: patch.id });
      });

      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "secondary-button";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => {
        approve.disabled = true;
        reject.disabled = true;
        vscode.postMessage({ type: "rejectPatch", taskId: event.taskId, patchId: patch.id });
      });

      actions.append(approve, reject);
      item.append(label, title, body, actions);
      messages.append(item);
      messages.scrollTop = messages.scrollHeight;
    }

    function formatTaskEvent(event) {
      if (event.type === "status") {
        if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
          setBusy(false);
          activeTaskId = undefined;
          cancelTask.disabled = true;
        }
        return "Task " + event.taskId + " is " + event.status + ".";
      }
      if (event.type === "toolLog") {
        return event.message;
      }
      if (event.type === "approvalRequired") {
        return "Approval required for patch " + event.patchId + ".";
      }
      if (event.type === "verification") {
        return (event.success ? "Verification passed: " : "Verification failed: ") + event.output;
      }
      if (event.type === "error") {
        return event.message;
      }
      return "";
    }

    function appendError(text) {
      clearEmpty();
      const item = document.createElement("div");
      item.className = "error";
      item.textContent = text;
      messages.append(item);
      messages.scrollTop = messages.scrollHeight;
    }

    function setBusy(nextBusy) {
      busy = Boolean(nextBusy);
      send.disabled = busy;
      input.disabled = busy;
      send.textContent = busy ? "Running" : "Start";
      if (!busy) {
        input.focus();
      }
    }

    function renderContextItems(items) {
      contextItems.textContent = "";
      clearContext.disabled = items.length === 0;

      for (const item of items) {
        const chip = document.createElement("span");
        chip.className = "context-chip";
        chip.title = item.path;

        const label = document.createElement("span");
        label.textContent = item.label;

        const remove = document.createElement("button");
        remove.className = "icon-button";
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + item.label);
        remove.textContent = "x";
        remove.addEventListener("click", () => {
          vscode.postMessage({ type: "removeContext", path: item.path });
        });

        chip.append(label, remove);
        contextItems.append(chip);
      }
    }

    function clearEmpty() {
      if (empty) {
        empty.remove();
      }
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function formatAgentError(message: string): string {
  if (message.includes("No API key found") || message.includes("DeepSeek API key is not configured")) {
    return `${message}\n\nClick "Configure API Key" in ResearchFlow Chat to set your DeepSeek API key and model.`;
  }

  return `ResearchFlow Agent failed: ${message}`;
}
