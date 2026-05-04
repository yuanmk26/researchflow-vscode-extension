import * as childProcess from "child_process";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";

import { AgentRuntime } from "./agentRuntime";
import { AgentPatchApproval, AgentTask, AgentTaskEvent, AgentTaskRequest } from "./agentTypes";
import {
  AgentApprovePatchParams,
  AgentCancelTaskParams,
  AgentCreateTaskParams,
  AgentCreateTaskResult,
  AgentEventNotificationParams,
  AgentWorkerNotification,
  AgentWorkerRequest,
  AgentWorkerResponse
} from "./agentWorkerProtocol";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class LocalAgentWorkerClient implements AgentRuntime, vscode.Disposable {
  private child?: childProcess.ChildProcessWithoutNullStreams;
  private nextRequestId = 1;
  private workerEnvironment: NodeJS.ProcessEnv = {};
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly taskEmitters = new Map<string, vscode.EventEmitter<AgentTaskEvent>>();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public async createTask(request: AgentTaskRequest): Promise<AgentTask> {
    return this.sendRequest<AgentCreateTaskResult, AgentCreateTaskParams>("agent.createTask", { request });
  }

  public onTaskEvent(taskId: string, listener: (event: AgentTaskEvent) => void): vscode.Disposable {
    return this.getTaskEmitter(taskId).event(listener);
  }

  public async cancelTask(taskId: string): Promise<void> {
    await this.sendRequest<void, AgentCancelTaskParams>("agent.cancelTask", { taskId });
  }

  public async approveTaskPatch(taskId: string, patchId: string, approval: AgentPatchApproval): Promise<void> {
    await this.sendRequest<void, AgentApprovePatchParams>("agent.approvePatch", { taskId, patchId, approval });
  }

  public setWorkerEnvironment(environment: NodeJS.ProcessEnv): void {
    if (sameEnvironment(this.workerEnvironment, environment)) {
      return;
    }

    this.workerEnvironment = { ...environment };
    this.restartWorker();
  }

  public dispose(): void {
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error("ResearchFlow Agent worker disposed."));
    }
    this.pendingRequests.clear();

    for (const emitter of this.taskEmitters.values()) {
      emitter.dispose();
    }
    this.taskEmitters.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.splice(0, this.disposables.length);

    this.restartWorker();
  }

  private async sendRequest<TResult, TParams>(
    method: AgentWorkerRequest<TParams>["method"],
    params: TParams
  ): Promise<TResult> {
    const worker = this.ensureWorker();
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const payload: AgentWorkerRequest<TParams> = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject
      });
      worker.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  private ensureWorker(): childProcess.ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) {
      return this.child;
    }

    const workerPath = path.join(this.extensionUri.fsPath, "agent-worker", "out", "index.js");
    const child = childProcess.spawn(process.execPath, [workerPath], {
      cwd: this.extensionUri.fsPath,
      env: {
        ...process.env,
        ...this.workerEnvironment
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.child = child;
    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.handleWorkerLine(line));
    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => this.handleWorkerStderr(line));
    child.on("exit", (code, signal) => this.handleWorkerExit(code, signal));

    this.disposables.push(
      new vscode.Disposable(() => stdout.close()),
      new vscode.Disposable(() => stderr.close())
    );

    return child;
  }

  private handleWorkerLine(line: string): void {
    let parsed: AgentWorkerResponse | AgentWorkerNotification<AgentEventNotificationParams>;
    try {
      parsed = JSON.parse(line) as AgentWorkerResponse | AgentWorkerNotification<AgentEventNotificationParams>;
    } catch {
      this.emitWorkerError(`Agent worker emitted invalid JSON: ${line}`);
      return;
    }

    if ("id" in parsed) {
      this.handleWorkerResponse(parsed);
      return;
    }

    if (parsed.method === "agent.event") {
      this.handleTaskEvent(parsed.params);
    }
  }

  private handleWorkerResponse(response: AgentWorkerResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result);
  }

  private handleTaskEvent(event: AgentTaskEvent): void {
    this.getTaskEmitter(event.taskId).fire(event);
  }

  private handleWorkerStderr(line: string): void {
    this.emitWorkerError(line);
  }

  private handleWorkerExit(code: number | null, signal: NodeJS.Signals | null): void {
    const message = `ResearchFlow Agent worker exited${code === null ? "" : ` with code ${code}`}${
      signal ? ` (${signal})` : ""
    }.`;

    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(message));
    }
    this.pendingRequests.clear();
    this.emitWorkerError(message);
    this.child = undefined;
  }

  private emitWorkerError(message: string): void {
    for (const [taskId, emitter] of this.taskEmitters) {
      emitter.fire({ type: "error", taskId, message });
      emitter.fire({ type: "status", taskId, status: "failed" });
    }
  }

  private restartWorker(): void {
    this.child?.kill();
    this.child = undefined;
  }

  private getTaskEmitter(taskId: string): vscode.EventEmitter<AgentTaskEvent> {
    let emitter = this.taskEmitters.get(taskId);
    if (!emitter) {
      emitter = new vscode.EventEmitter<AgentTaskEvent>();
      this.taskEmitters.set(taskId, emitter);
    }

    return emitter;
  }
}

function sameEnvironment(left: NodeJS.ProcessEnv, right: NodeJS.ProcessEnv): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}
