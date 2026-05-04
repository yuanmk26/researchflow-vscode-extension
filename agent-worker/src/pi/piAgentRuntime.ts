import {
  AgentPatchApproval,
  AgentPatchProposal,
  AgentTask,
  AgentTaskEvent,
  AgentTaskRequest,
  AgentTaskStatus
} from "../protocol";
import { createPiSession } from "./piSessionFactory";

type EventSink = (event: AgentTaskEvent) => void;

interface WorkerTaskState {
  task: AgentTask;
  request: AgentTaskRequest;
  cancelled: boolean;
  patch?: AgentPatchProposal;
}

export class PiAgentRuntime {
  private nextTaskId = 1;
  private readonly tasks = new Map<string, WorkerTaskState>();

  public async createTask(request: AgentTaskRequest, emit: EventSink): Promise<AgentTask> {
    const task: AgentTask = {
      id: `pi-task-${this.nextTaskId}`,
      goal: request.goal,
      status: "queued"
    };
    this.nextTaskId += 1;

    const state: WorkerTaskState = {
      task,
      request,
      cancelled: false
    };
    this.tasks.set(task.id, state);
    void this.runTask(state, emit);

    return task;
  }

  public async cancelTask(taskId: string, emit: EventSink): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state || isTerminalStatus(state.task.status)) {
      return;
    }

    state.cancelled = true;
    this.emitStatus(state, "cancelled", emit);
  }

  public async approvePatch(
    taskId: string,
    patchId: string,
    approval: AgentPatchApproval,
    emit: EventSink
  ): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state || state.patch?.id !== patchId || state.task.status !== "waitingApproval") {
      return;
    }

    if (approval === "rejected") {
      emit({ type: "assistantText", taskId, text: "Patch rejected. No files were changed." });
      this.emitStatus(state, "completed", emit);
      return;
    }

    emit({
      type: "toolLog",
      taskId,
      message: "Patch approved. The pi worker records approval, but phase two does not apply patches yet."
    });
    this.emitStatus(state, "verifying", emit);
    emit({
      type: "verification",
      taskId,
      success: true,
      output: "Patch application is intentionally disabled in this integration phase."
    });
    this.emitStatus(state, "completed", emit);
  }

  private async runTask(state: WorkerTaskState, emit: EventSink): Promise<void> {
    try {
      this.emitStatus(state, "queued", emit);
      this.emitStatus(state, "running", emit);
      emit({
        type: "toolLog",
        taskId: state.task.id,
        message: "Starting pi SDK agent session."
      });

      const session = await createPiSession(state.request);
      const prompt = buildPrompt(state.request);
      const result = await invokePiSession(session, prompt, (message) => {
        emit({ type: "toolLog", taskId: state.task.id, message });
      });
      if (state.cancelled) {
        return;
      }

      const text = normalizePiResult(result);
      emit({
        type: "assistantText",
        taskId: state.task.id,
        text: text || "pi SDK session completed without assistant text."
      });

      const patch = createPatchProposal(state.task.id, text);
      state.patch = patch;
      emit({ type: "patchReady", taskId: state.task.id, patch });
      this.emitStatus(state, "waitingApproval", emit);
      emit({ type: "approvalRequired", taskId: state.task.id, patchId: patch.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown pi SDK error";
      emit({ type: "error", taskId: state.task.id, message });
      this.emitStatus(state, "failed", emit);
    }
  }

  private emitStatus(state: WorkerTaskState, status: AgentTaskStatus, emit: EventSink): void {
    state.task.status = status;
    emit({ type: "status", taskId: state.task.id, status });
  }
}

function buildPrompt(request: AgentTaskRequest): string {
  const context =
    request.contextItems.length > 0
      ? request.contextItems.map((item) => `- ${item.label}: ${item.path}`).join("\n")
      : "- none";

  return [
    "You are the ResearchFlow coding agent worker.",
    "Analyze the requested task and propose the smallest safe implementation plan or patch.",
    "Do not apply changes directly. Return a concise implementation summary.",
    "",
    `Goal: ${request.goal}`,
    `Workspace: ${request.workspaceRoot}`,
    `Active file: ${request.activeFile ?? "none"}`,
    "Context files:",
    context
  ].join("\n");
}

async function invokePiSession(session: unknown, prompt: string, onLog: (message: string) => void): Promise<string> {
  const candidate = session as {
    subscribe?: (listener: (event: unknown) => void) => (() => void) | { unsubscribe?: () => void; dispose?: () => void };
    prompt?: (input: string) => Promise<unknown>;
    sendMessage?: (input: string) => Promise<unknown>;
    run?: (input: string) => Promise<unknown>;
  };

  const chunks: string[] = [];
  const unsubscribe = candidate.subscribe?.((event) => {
    const normalized = normalizePiEvent(event);
    if (normalized.textDelta) {
      chunks.push(normalized.textDelta);
    }
    if (normalized.log) {
      onLog(normalized.log);
    }
  });

  try {
    if (typeof candidate.prompt === "function") {
      await candidate.prompt(prompt);
      return chunks.join("");
    }
    if (typeof candidate.sendMessage === "function") {
      const result = await candidate.sendMessage(prompt);
      return chunks.join("") || normalizePiResult(result);
    }
    if (typeof candidate.run === "function") {
      const result = await candidate.run(prompt);
      return chunks.join("") || normalizePiResult(result);
    }
  } finally {
    disposeSubscription(unsubscribe);
  }

  throw new Error("pi SDK session does not expose a supported prompt method.");
}

function normalizePiEvent(event: unknown): { textDelta?: string; log?: string } {
  if (!event || typeof event !== "object") {
    return {};
  }

  const value = event as {
    type?: unknown;
    assistantMessageEvent?: { type?: unknown; delta?: unknown };
    toolName?: unknown;
    result?: unknown;
  };

  if (
    value.type === "message_update" &&
    value.assistantMessageEvent?.type === "text_delta" &&
    typeof value.assistantMessageEvent.delta === "string"
  ) {
    return { textDelta: value.assistantMessageEvent.delta };
  }

  if (value.type === "tool_execution_start" && typeof value.toolName === "string") {
    return { log: `pi tool started: ${value.toolName}` };
  }

  if (value.type === "tool_execution_end" && typeof value.toolName === "string") {
    return { log: `pi tool finished: ${value.toolName}` };
  }

  return {};
}

function disposeSubscription(
  subscription: (() => void) | { unsubscribe?: () => void; dispose?: () => void } | undefined
): void {
  if (!subscription) {
    return;
  }
  if (typeof subscription === "function") {
    subscription();
    return;
  }
  if (typeof subscription.dispose === "function") {
    subscription.dispose();
    return;
  }
  if (typeof subscription.unsubscribe === "function") {
    subscription.unsubscribe();
  }
}

function normalizePiResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const value = result as { text?: unknown; message?: unknown; content?: unknown };
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.message === "string") {
      return value.message;
    }
    if (typeof value.content === "string") {
      return value.content;
    }
    return JSON.stringify(result, null, 2);
  }
  return "";
}

function createPatchProposal(taskId: string, text: string): AgentPatchProposal {
  return {
    id: `${taskId}-pi-proposal`,
    title: "pi SDK proposal",
    summary: "pi returned an implementation response. Patch application remains disabled in this phase.",
    patch: [
      "diff --git a/RESEARCHFLOW_PI_AGENT_PROPOSAL.md b/RESEARCHFLOW_PI_AGENT_PROPOSAL.md",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/RESEARCHFLOW_PI_AGENT_PROPOSAL.md",
      "@@ -0,0 +1,4 @@",
      "+# ResearchFlow pi Agent Proposal",
      "+",
      ...text.split("\n").map((line) => `+${line}`)
    ].join("\n")
  };
}

function isTerminalStatus(status: AgentTaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
