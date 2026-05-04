# ResearchFlow Agent 架构设计

本文描述 ResearchFlow 后续 coding agent 的目标定位、目录规划、pi SDK 接入方式，以及 VS Code extension 与 agent worker 的解耦边界。

## 目标定位

ResearchFlow Agent 的目标不是普通聊天助手，而是可分派任务的 coding agent。它应该能够理解当前 ResearchFlow 项目，读取和分析项目代码，提出代码修改，运行验证，并在权限允许时调用 ResearchFlow 的领域操作。

第一阶段的 agent 能力应聚焦在：

- 接收用户分派的代码修改或项目维护任务。
- 根据工作区、当前文件和显式上下文文件分析代码。
- 生成 patch 或 diff，并在用户确认后应用。
- 调用受控的 ResearchFlow domain tools，例如新建实验、新建脚本、新建 note 或 writing object。
- 运行有限的验证命令，例如编译、测试或只读检查。

## 总体架构

推荐架构链路如下：

```text
VS Code Extension
  -> ResearchFlow Agent Service
    -> Agent Runtime Adapter
      -> agent-worker
        -> pi SDK
```

VS Code extension 负责产品边界和用户交互，包括 Chat/Task UI、上下文选择、diff 展示、审批、VS Code API 调用和任务状态展示。agent worker 负责实际 agent loop、pi SDK session、工具调用、subagent 调度和执行日志。

pi SDK 应作为 worker 内部实现细节使用，而不是直接进入 extension 的公共边界。这样 ResearchFlow 可以保留自己的任务模型、权限模型、事件协议和 UI 交互，同时复用 pi 的 coding agent 能力。

## 推荐目录结构

```text
researchflow-vscode-extension/
  src/
    views/
      researchFlowChatViewProvider.ts
    services/
      researchFlowAgentService.ts
    agent/
      agentTypes.ts
      agentRuntime.ts
      localAgentWorkerClient.ts
      boundaryPolicy.ts

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

该结构将 extension 侧的产品抽象和 worker 侧的 agent runtime 分离。extension 代码不直接 import pi SDK，worker 代码不直接依赖 VS Code API。

## Extension 与 Agent Worker 解耦

extension 与 agent worker 通过稳定的 ResearchFlow agent 协议通信，而不是共享 pi 的内部类型。

extension 侧核心边界：

- `AgentRuntime`：定义创建任务、订阅事件、取消任务和处理审批的能力。
- `LocalAgentWorkerClient`：负责启动 worker、发送 JSON-RPC 或本地 HTTP 请求、接收事件流。
- `boundaryPolicy`：根据工作区、任务类型和用户设置生成可读路径、可写路径、禁止路径、允许命令和审批策略。
- tool gateway：当 worker 需要调用 VS Code command 或 extension service 时，由 extension 代为执行并返回结构化结果。

worker 侧核心边界：

- 接收 `AgentTaskRequest`。
- 使用 pi SDK 创建 agent session。
- 注册 coding tools、ResearchFlow domain tools 和 subagent。
- 将 pi events 映射为 ResearchFlow 的 `AgentTaskEvent`。
- 在需要写入、执行敏感命令或调用 domain write tool 时请求 extension 审批。

## 目录职责说明

`src/views/` 放 VS Code webview 和 tree view。`researchFlowChatViewProvider.ts` 只负责 Chat/Task UI、用户输入、上下文按钮、状态渲染、diff 审批按钮和 webview 消息传递，不接触 pi SDK。

`src/services/` 放 extension 内服务门面。`researchFlowAgentService.ts` 从当前占位回复服务升级为 agent facade，负责把用户输入、工作区信息、当前文件和 context files 转成 `AgentTaskRequest`，并把 agent 事件转交给 UI。

`src/agent/` 放 extension 侧 agent 抽象。这里定义任务类型、事件类型、runtime 接口、worker client 和权限策略。该目录是 extension 与任何具体 agent runtime 的适配边界。

`agent-worker/` 是独立 Node worker。它承载长时间运行的 agent loop、pi SDK 依赖、工具执行和 subagent 调度，避免把复杂依赖和长任务放进 VS Code extension host。

`agent-worker/src/pi/` 放 pi SDK 适配代码，包括 session 创建、模型配置、pi event 映射、subagent 构造和 pi tool 注册。

`agent-worker/src/tools/` 放 agent 可调用工具。coding tools 负责读文件、搜索、生成 patch、运行受控验证命令；ResearchFlow domain tool client 负责通过 extension 的 tool gateway 调用新建实验、新建脚本、新建 note 等领域操作。

`agent-worker/src/policies/` 放 worker 侧二次校验。即使 extension 已经生成边界策略，worker 仍应在读写路径、命令执行和 patch 应用前做本地检查。

## Chat 接入方式

现有 Chat 是单次 `sendMessage -> reply` 模式。接入 agent 后应升级为 `startTask -> event stream` 模式。

推荐流程：

```text
Webview 用户输入
  -> ResearchFlowChatViewProvider.handleSendMessage()
  -> ResearchFlowAgentService.startTask()
  -> LocalAgentWorkerClient.createTask()
  -> agent-worker / pi SDK
  -> AgentTaskEvent stream
  -> ResearchFlowChatViewProvider.postMessage()
  -> Webview 渲染状态、日志、patch、审批和结果
```

第一阶段建议事件类型包括：

```ts
type AgentTaskEvent =
  | { type: "status"; taskId: string; status: AgentTaskStatus }
  | { type: "assistantText"; taskId: string; text: string }
  | { type: "toolLog"; taskId: string; message: string }
  | { type: "patchReady"; taskId: string; patch: string }
  | { type: "approvalRequired"; taskId: string }
  | { type: "verification"; taskId: string; success: boolean; output: string }
  | { type: "error"; taskId: string; message: string };
```

Chat UI 不需要理解 pi 的内部事件。它只消费 ResearchFlow 定义的任务事件，并根据事件更新任务卡片、日志区域、diff 审批区和最终结果。

## ResearchFlow Domain Tools

ResearchFlow domain tools 让 agent 能调用项目领域操作，而不是只做通用代码编辑。第一阶段适合开放：

- `researchflow.listProjectStructure`
- `researchflow.listExperiments`
- `researchflow.createExperiment`
- `researchflow.createAnalysisScript`
- `researchflow.listWritingObjects`
- `researchflow.createWritingObject`
- `researchflow.createNote`
- `researchflow.addAgentReferenceDoc`
- `researchflow.createDataFolder`

worker 不应直接复制 VS Code command 里的业务逻辑，也不能直接调用 VS Code API。正确路径是：

```text
pi tool call
  -> researchFlowDomainToolClient
    -> extension tool gateway
      -> VS Code command / service method
        -> structured tool result
```

读工具可以自动执行。写工具需要用户确认。删除、移动、重命名、重新初始化项目、导入任意外部数据等高风险操作第一阶段不开放，后续如需开放必须使用更强确认。

## Subagent 架构

第一阶段推荐只引入三个 subagent：

- `Explorer`：只读，负责搜索代码、定位相关文件、总结现有实现和风险。
- `Patch Writer`：只在指定范围内生成 patch proposal，不直接绕过审批写入文件。
- `Verifier`：运行允许的编译、测试或检查命令，分析失败原因并输出结构化验证结果。

主 agent 负责调度和边界控制。subagent 不应共享无限上下文或无限工具权限，每个 subagent 应获得窄工具集、窄路径范围和明确输出格式。

建议的 subagent 定义：

```ts
interface SubagentSpec {
  id: string;
  role: "explorer" | "patcher" | "verifier";
  goal: string;
  allowedTools: string[];
  readablePaths: string[];
  writablePaths: string[];
  outputSchema: unknown;
  maxIterations: number;
  requiresApprovalBeforeWrite: boolean;
}
```

后续可以增加 `Reviewer` subagent，用于检查 patch 是否越界、是否缺测试、是否引入风险。但第一阶段不建议引入复杂多 agent 群聊。

## 权限与审批策略

默认策略是 `diff-before-write`。agent 可以分析和生成 patch，但用户确认前不修改项目代码。

权限建议分级：

- read tools：自动执行，例如读文件、搜索、列出项目结构。
- write tools：需要确认，例如新建实验、新建脚本、新建 note、应用 patch。
- command tools：只允许白名单命令，例如 `git status`、编译、测试或只读检查。
- destructive tools：第一阶段不开放，例如删除、移动、重命名、重新初始化项目。

写入和命令执行需要同时满足 extension 侧策略和 worker 侧策略。审批结果应记录到任务日志，便于用户理解 agent 做过什么。

## 第一阶段落地范围

第一阶段只实现最小可用 coding agent 架构：

- pi SDK 放在 `agent-worker/` 内。
- extension 通过 `AgentRuntime` 和 `LocalAgentWorkerClient` 与 worker 通信。
- Chat 支持任务事件流、状态展示、日志展示和 diff 审批。
- agent 支持有限的 read/search/patch/verify tools。
- 开放少量 ResearchFlow domain tools，例如列出项目结构、新建实验、新建脚本和新建 note。

第一阶段不做：

- 自动全权限 shell。
- 未确认直接写文件。
- 长期记忆。
- 复杂多 agent 群聊。
- 高风险 destructive tools。
- 将 pi SDK 类型泄漏到 extension 公共接口。
