# ResearchFlow VSCode 扩展骨架

ResearchFlow 是研究工作流系统的 VSCode 前端入口层。本仓库提供一个可扩展、可编译、可调试的 TypeScript 骨架，用于后续连接本地后端（ResearchFlow Core）。

## 当前骨架包含什么

- 基于 TypeScript 的 VSCode 扩展基础结构
- 命令系统（含占位实现）
- Activity Bar 容器 + `Projects` 树视图
- 工作区项目初始化（`.researchflow/project.json`）
- 面向后端通信的基础服务层（`CoreClient`）

## 命令列表

- `ResearchFlow: Init Project`（`researchflow.initProject`）
- `ResearchFlow: Recommend Citations`（`researchflow.recommendCitations`）
- `ResearchFlow: Draft Caption`（`researchflow.draftCaption`）

## 侧边栏视图（Tree View）

`ResearchFlow` 活动栏容器下包含 `Projects` 视图（`researchflow.projects`），当前显示占位节点：

- Active Project
- Papers
- Figures

## 本地后端地址（占位）

- `http://127.0.0.1:27182`

## 如何构建与运行

1. 安装依赖：

```bash
npm install
```

2. 编译：

```bash
npm run compile
```

3. 启动扩展调试：

- 在 VSCode 打开本项目目录
- 按 `F5`（或运行 `.vscode/launch.json` 中的 `Run ResearchFlow Extension`）
- 会打开一个新的 Extension Development Host 窗口，插件在该窗口中运行

## 文档

- 中文骨架说明（模块职责与调用关系）：
  - `docs/skeleton-overview.zh-CN.md`

## 说明

- 当前后端接口调用为占位实现
- 本阶段刻意不实现 AI/业务逻辑
- 除 ResearchFlow Chat 外，主体导航仍使用 Tree View；Chat 使用 Webview View。VS Code 不允许扩展默认直接贡献到 Secondary Sidebar，可首次运行 `ResearchFlow: Move Chat to Right Sidebar`，并在 VS Code 的移动视图菜单中选择 Secondary Sidebar；VS Code 会记住该布局。
