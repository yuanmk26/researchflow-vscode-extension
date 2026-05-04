import { AgentPatchApproval, AgentTask, AgentTaskEvent, AgentTaskRequest } from "./agentTypes";

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

export type AgentCreateTaskResult = AgentTask;
export type AgentEventNotificationParams = AgentTaskEvent;
