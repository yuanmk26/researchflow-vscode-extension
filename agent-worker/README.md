# ResearchFlow Agent Worker

This directory contains the local ResearchFlow Agent worker package. The VS Code extension can launch this worker when `researchflow.agent.runtime` is set to `pi`; the default runtime remains `mock`.

## Intended Role

The worker will run outside the VS Code extension host and own the long-running agent loop:

```text
VS Code Extension
  -> AgentRuntime
    -> LocalAgentWorkerClient
      -> stdio JSON-RPC
        -> agent-worker
          -> pi SDK
```

The extension remains responsible for UI, VS Code APIs, approval prompts, and applying approved changes. The worker remains responsible for pi sessions, tool execution, subagent orchestration, event mapping, and policy checks.

## Structure

```text
agent-worker/
  package.json
  src/
    index.ts
    pi/
      piAgentRuntime.ts
      piSessionFactory.ts
      piEventMapper.ts
    tools/
      readFileTool.ts
      searchTool.ts
      patchTool.ts
      testCommandTool.ts
      researchFlowDomainToolClient.ts
    policies/
      workspaceBoundary.ts
      commandPolicy.ts
      writePolicy.ts
```

## Protocol

The worker uses newline-delimited JSON-RPC over stdio. Messages are ResearchFlow-owned protocol objects, not pi SDK types.

Core requests:

- `agent.createTask`
- `agent.cancelTask`
- `agent.approvePatch`
- `tool.callExtension`

Core notifications:

- `agent.status`
- `agent.assistantText`
- `agent.toolLog`
- `agent.patchReady`
- `agent.approvalRequired`
- `agent.verification`
- `agent.error`

## Boundary Rules

The worker must treat extension-provided boundaries as policy, then re-check them locally before reading, writing, or running commands.

The worker keeps these defaults:

- Read tools can run automatically.
- Patch application requires approval.
- Command tools are allowlisted.
- Destructive tools remain unavailable.
- pi SDK types stay inside this worker boundary.
