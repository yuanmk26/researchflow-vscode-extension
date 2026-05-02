# ResearchFlow 骨架说明（中文）

本文档用于解释当前 VSCode 扩展骨架各部分的职责，帮助你快速理解“前端薄层 + 后端核心”的分层设计。

## 1. 整体定位

ResearchFlow Extension 目前是一个轻量入口层，主要负责：

- 与 VSCode 交互（命令、侧边栏、工作区文件读写）
- 将请求转发给本地后端 `ResearchFlow Core`
- 管理最小项目状态（`.researchflow/project.json`）

当前版本不包含业务 AI 逻辑。除 ResearchFlow Chat 外，主体导航仍使用 Tree View；Chat 使用 Webview View，可由用户拖到 VS Code Secondary Sidebar 形成右侧聊天栏。

## 2. 目录与职责

### `src/extension.ts`

- 扩展生命周期入口。
- 在 `activate(context)` 中完成：
  - 初始化 `ProjectManager`（项目状态）
  - 初始化 `CoreClient`（后端通信）
  - 初始化 `ProjectTreeProvider`（侧边栏树）
  - 注册 3 个命令
  - 注册 `researchflow.projects` TreeDataProvider

### `src/commands/`

命令层负责“收集 VSCode 上下文 + 调服务 + 弹消息”，不放业务决策。

- `initProject.ts`
  - 弹出输入框获取项目名
  - 创建 `.researchflow/project.json`
- `recommendCitations.ts`
  - 读取编辑器选中文本（无选中则读取全文）
  - 调用 `coreClient.recommendCitations(text)`
  - 用 `showInformationMessage` 显示占位结果
- `draftCaption.ts`
  - 获取当前文件路径
  - 调用 `coreClient.generateCaption(filePath)`
  - 显示返回 caption

### `src/views/projectTreeProvider.ts`

- 侧边栏树数据提供者（Tree View）。
- 当前为静态占位数据，展示：
  - `Active Project`
  - `Papers`
  - `Figures`
- 提供 `refresh()`，为后续动态刷新预留。

### `src/services/coreClient.ts`

- 统一封装对本地后端 `http://127.0.0.1:27182` 的 HTTP 调用。
- 当前提供：
  - `recommendCitations(text)`
  - `generateCaption(filePath)`
- 通过私有 `post<T>()` 复用请求逻辑。
- 已预留 TODO：认证、超时、重试、熔断。

### `src/state/projectManager.ts`

- 工作区项目状态管理。
- 当前能力：
  - 获取活动工作区目录
  - 定位配置文件路径 `.researchflow/project.json`
  - 检测项目配置是否存在
  - 读取并解析项目配置
- 已预留 TODO：schema 校验、错误状态管理。

### `src/types/index.ts`

- 定义共享基础类型：
  - `Project`
  - `Reference`
  - `Artifact`
- 作用是让命令层、服务层、状态层共享同一份接口约定。

## 3. 扩展如何被激活

来自 `package.json` 的激活事件：

- `onCommand:researchflow.initProject`
- `onView:researchflow.projects`

这意味着：

- 用户首次执行初始化命令会激活扩展
- 用户打开 `ResearchFlow` 视图时也会激活扩展

## 4. 目前可见功能

- 命令面板中可用：
  - `ResearchFlow: Init Project`
  - `ResearchFlow: Recommend Citations`
  - `ResearchFlow: Draft Caption`
- 活动栏可见 `ResearchFlow` 容器及 `Projects` 树视图

## 5. 后续扩展建议（下一阶段）

- 将 Tree View 从静态数据切换为基于 `ProjectManager + CoreClient` 的动态数据
- 为 `CoreClient` 增加统一错误分类和超时控制
- 将命令输出从 toast 迁移到更结构化的展示层（例如专用面板）
- 为 `.researchflow/project.json` 增加版本字段和兼容策略
