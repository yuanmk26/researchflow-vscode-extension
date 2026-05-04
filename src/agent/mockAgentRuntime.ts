import * as vscode from "vscode";

import { AgentRuntime } from "./agentRuntime";
import {
  AgentPatchApproval,
  AgentPatchProposal,
  AgentTask,
  AgentTaskEvent,
  AgentTaskRequest,
  AgentTaskStatus
} from "./agentTypes";

interface MockTaskState {
  task: AgentTask;
  request: AgentTaskRequest;
  emitter: vscode.EventEmitter<AgentTaskEvent>;
  timers: NodeJS.Timeout[];
  patch?: AgentPatchProposal;
}

export class MockAgentRuntime implements AgentRuntime, vscode.Disposable {
  private nextTaskId = 1;
  private readonly tasks = new Map<string, MockTaskState>();

  public async createTask(request: AgentTaskRequest): Promise<AgentTask> {
    const task: AgentTask = {
      id: `mock-task-${this.nextTaskId}`,
      goal: request.goal,
      status: "queued"
    };
    this.nextTaskId += 1;

    const state: MockTaskState = {
      task,
      request,
      emitter: new vscode.EventEmitter<AgentTaskEvent>(),
      timers: []
    };
    this.tasks.set(task.id, state);
    this.scheduleInitialEvents(state);

    return task;
  }

  public onTaskEvent(taskId: string, listener: (event: AgentTaskEvent) => void): vscode.Disposable {
    const state = this.tasks.get(taskId);
    if (!state) {
      return new vscode.Disposable(() => undefined);
    }

    return state.emitter.event(listener);
  }

  public async cancelTask(taskId: string): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state || isTerminalStatus(state.task.status)) {
      return;
    }

    this.clearTimers(state);
    this.emitStatus(state, "cancelled");
  }

  public async approveTaskPatch(taskId: string, patchId: string, approval: AgentPatchApproval): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state || state.patch?.id !== patchId || state.task.status !== "waitingApproval") {
      return;
    }

    if (approval === "rejected") {
      this.emit(state, {
        type: "assistantText",
        taskId,
        text: "Patch rejected. No files were changed."
      });
      this.emitStatus(state, "completed");
      return;
    }

    this.emit(state, {
      type: "toolLog",
      taskId,
      message: "Patch approved. Mock runtime records approval but does not write files in phase one."
    });
    this.emitStatus(state, "verifying");
    this.schedule(state, 400, () => {
      this.emit(state, {
        type: "verification",
        taskId,
        success: true,
        output: "Mock verification completed. No commands were executed."
      });
      this.emitStatus(state, "completed");
    });
  }

  public dispose(): void {
    for (const state of this.tasks.values()) {
      this.clearTimers(state);
      state.emitter.dispose();
    }
    this.tasks.clear();
  }

  private scheduleInitialEvents(state: MockTaskState): void {
    this.schedule(state, 0, () => this.emitStatus(state, "queued"));
    this.schedule(state, 250, () => {
      this.emitStatus(state, "running");
      this.emit(state, {
        type: "assistantText",
        taskId: state.task.id,
        text: "ResearchFlow Agent runtime scaffold is active. This mock task shows the phase-one event flow."
      });
    });
    this.schedule(state, 500, () => {
      this.emit(state, {
        type: "toolLog",
        taskId: state.task.id,
        message: `Workspace boundary: ${state.request.workspaceRoot}`
      });
    });
    this.schedule(state, 800, () => {
      const patch = this.createMockPatch(state.request);
      state.patch = patch;
      this.emit(state, { type: "patchReady", taskId: state.task.id, patch });
      this.emitStatus(state, "waitingApproval");
      this.emit(state, { type: "approvalRequired", taskId: state.task.id, patchId: patch.id });
    });
  }

  private createMockPatch(request: AgentTaskRequest): AgentPatchProposal {
    const contextSummary =
      request.contextItems.length > 0
        ? request.contextItems.map((item) => `# Context: ${item.label}`).join("\n")
        : "# Context: none";

    return {
      id: "mock-patch-1",
      title: "Phase-one mock patch proposal",
      summary: "This patch is a placeholder proving that task events and approval UI are wired.",
      patch: [
        "diff --git a/RESEARCHFLOW_AGENT_PHASE_ONE.txt b/RESEARCHFLOW_AGENT_PHASE_ONE.txt",
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        "+++ b/RESEARCHFLOW_AGENT_PHASE_ONE.txt",
        "@@ -0,0 +1,4 @@",
        "+ResearchFlow Agent phase-one scaffold",
        `+Goal: ${request.goal}`,
        `+${contextSummary}`,
        "+No files are written by the mock runtime."
      ].join("\n")
    };
  }

  private schedule(state: MockTaskState, delayMs: number, callback: () => void): void {
    const timer = setTimeout(() => {
      state.timers = state.timers.filter((item) => item !== timer);
      if (!isTerminalStatus(state.task.status)) {
        callback();
      }
    }, delayMs);
    state.timers.push(timer);
  }

  private emitStatus(state: MockTaskState, status: AgentTaskStatus): void {
    state.task.status = status;
    this.emit(state, { type: "status", taskId: state.task.id, status });
  }

  private emit(state: MockTaskState, event: AgentTaskEvent): void {
    state.emitter.fire(event);
  }

  private clearTimers(state: MockTaskState): void {
    for (const timer of state.timers) {
      clearTimeout(timer);
    }
    state.timers = [];
  }
}

function isTerminalStatus(status: AgentTaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
