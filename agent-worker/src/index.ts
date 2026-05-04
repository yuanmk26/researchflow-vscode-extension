import * as readline from "readline";

import {
  AgentApprovePatchParams,
  AgentCancelTaskParams,
  AgentCreateTaskParams,
  AgentTaskEvent,
  AgentWorkerNotification,
  AgentWorkerRequest,
  AgentWorkerResponse
} from "./protocol";
import { PiAgentRuntime } from "./pi/piAgentRuntime";

const runtime = new PiAgentRuntime();
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  void handleLine(line);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

async function handleLine(line: string): Promise<void> {
  let request: AgentWorkerRequest;
  try {
    request = JSON.parse(line) as AgentWorkerRequest;
  } catch {
    writeStderr("Ignoring invalid JSON request.");
    return;
  }

  try {
    if (request.method === "agent.createTask") {
      const params = request.params as AgentCreateTaskParams;
      const task = await runtime.createTask(params.request, emitEvent);
      writeResponse({ jsonrpc: "2.0", id: request.id, result: task });
      return;
    }

    if (request.method === "agent.cancelTask") {
      const params = request.params as AgentCancelTaskParams;
      await runtime.cancelTask(params.taskId, emitEvent);
      writeResponse({ jsonrpc: "2.0", id: request.id });
      return;
    }

    if (request.method === "agent.approvePatch") {
      const params = request.params as AgentApprovePatchParams;
      await runtime.approvePatch(params.taskId, params.patchId, params.approval, emitEvent);
      writeResponse({ jsonrpc: "2.0", id: request.id });
      return;
    }

    writeResponse({ jsonrpc: "2.0", id: request.id, error: { message: `Unsupported method: ${request.method}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    writeResponse({ jsonrpc: "2.0", id: request.id, error: { message } });
  }
}

function emitEvent(event: AgentTaskEvent): void {
  const notification: AgentWorkerNotification<AgentTaskEvent> = {
    jsonrpc: "2.0",
    method: "agent.event",
    params: event
  };
  process.stdout.write(`${JSON.stringify(notification)}\n`);
}

function writeResponse(response: AgentWorkerResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}
