import * as vscode from "vscode";

import { createAnalysisDeleteExperimentCommand } from "./commands/deleteAnalysisExperiment";
import { createAnalysisDeleteFileCommand } from "./commands/deleteAnalysisFile";
import { createDeleteDataCommand } from "./commands/deleteData";
import { createAnalysisNewExperimentCommand } from "./commands/createAnalysisExperiment";
import { createAnalysisNewScriptCommand } from "./commands/createAnalysisScript";
import { createDataFolderCommand } from "./commands/createDataFolder";
import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createImportDataCommand } from "./commands/importData";
import { createInitProjectCommand } from "./commands/initProject";
import { createMoveDataCommand } from "./commands/moveData";
import { createOpenAnalysisTaskCommand, registerAnalysisTaskLastActiveTracking } from "./commands/openAnalysisTask";
import { createOpenDataInfoCommand } from "./commands/openDataInfo";
import { createOpenProjectDirectoryCommand } from "./commands/openProjectDirectory";
import { createRenameProjectCommand } from "./commands/renameProject";
import { createRecommendCitationsCommand } from "./commands/recommendCitations";
import { createSelectProjectFolderCommand } from "./commands/selectProjectFolder";
import { CoreClient } from "./services/coreClient";
import { ResearchFlowAgentService } from "./services/researchFlowAgentService";
import { ProjectManager } from "./state/projectManager";
import { AnalysisTreeProvider } from "./views/analysisTreeProvider";
import { ProjectTreeProvider } from "./views/projectTreeProvider";
import { ReferencesTreeProvider } from "./views/referencesTreeProvider";
import { ResearchFlowChatViewProvider } from "./views/researchFlowChatViewProvider";
import { DataTreeDragAndDropController, DataTreeProvider } from "./views/dataTreeProvider";
import { WritingTreeProvider } from "./views/writingTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const projectManager = new ProjectManager();
  const coreClient = new CoreClient();
  const researchFlowAgentService = new ResearchFlowAgentService();
  const projectTreeProvider = new ProjectTreeProvider(projectManager);
  const referencesTreeProvider = new ReferencesTreeProvider();
  const analysisTreeProvider = new AnalysisTreeProvider(projectManager);
  const writingTreeProvider = new WritingTreeProvider();
  const dataTreeProvider = new DataTreeProvider(projectManager);
  const dataTreeDndController = new DataTreeDragAndDropController(dataTreeProvider);
  const researchFlowChatViewProvider = new ResearchFlowChatViewProvider(
    context.extensionUri,
    researchFlowAgentService
  );

  const projectsTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.projects", projectTreeProvider);
  const referencesTreeDisposable = vscode.window.registerTreeDataProvider(
    "researchflow.references",
    referencesTreeProvider
  );
  const analysisTreeView = vscode.window.createTreeView("researchflow.analysis", {
    treeDataProvider: analysisTreeProvider,
    canSelectMany: true
  });
  const writingTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.writing", writingTreeProvider);
  const chatViewDisposable = vscode.window.registerWebviewViewProvider(
    ResearchFlowChatViewProvider.viewType,
    researchFlowChatViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  const dataTreeView = vscode.window.createTreeView("researchflow.data", {
    treeDataProvider: dataTreeProvider,
    dragAndDropController: dataTreeDndController,
    canSelectMany: true
  });
  const initProjectDisposable = vscode.commands.registerCommand(
    "researchflow.initProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
      dataTreeProvider.refresh();
    }
  );
  const reinitializeProjectDisposable = vscode.commands.registerCommand(
    "researchflow.reinitializeProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
      dataTreeProvider.refresh();
    }
  );
  const openProjectDirectoryDisposable = vscode.commands.registerCommand(
    "researchflow.openProjectDirectory",
    createOpenProjectDirectoryCommand(projectManager)
  );
  const selectProjectFolderDisposable = vscode.commands.registerCommand(
    "researchflow.selectProjectFolder",
    createSelectProjectFolderCommand()
  );
  const renameProjectDisposable = vscode.commands.registerCommand(
    "researchflow.renameProject",
    async (): Promise<void> => {
      await createRenameProjectCommand(projectManager)();
      projectTreeProvider.refresh();
    }
  );
  const recommendCitationsDisposable = vscode.commands.registerCommand(
    "researchflow.recommendCitations",
    createRecommendCitationsCommand(coreClient)
  );
  const draftCaptionDisposable = vscode.commands.registerCommand(
    "researchflow.draftCaption",
    createDraftCaptionCommand(coreClient)
  );
  const openAnalysisTaskDisposable = vscode.commands.registerCommand(
    "researchflow.analysis.openTask",
    createOpenAnalysisTaskCommand(context.workspaceState, context.globalStorageUri)
  );
  const analysisNewScriptDisposable = vscode.commands.registerCommand(
    "researchflow.analysis.newScript",
    createAnalysisNewScriptCommand(analysisTreeProvider)
  );
  const analysisNewExperimentDisposable = vscode.commands.registerCommand(
    "researchflow.analysis.newExperiment",
    createAnalysisNewExperimentCommand(analysisTreeProvider)
  );
  const analysisDeleteExperimentDisposable = vscode.commands.registerCommand(
    "researchflow.analysis.deleteExperiment",
    createAnalysisDeleteExperimentCommand(analysisTreeProvider)
  );
  const analysisDeleteFileDisposable = vscode.commands.registerCommand(
    "researchflow.analysis.deleteFile",
    createAnalysisDeleteFileCommand(analysisTreeProvider, () => analysisTreeView.selection)
  );
  const dataImportDataDisposable = vscode.commands.registerCommand(
    "researchflow.data.importData",
    createImportDataCommand(dataTreeProvider)
  );
  const dataNewDataFolderDisposable = vscode.commands.registerCommand(
    "researchflow.data.newDataFolder",
    createDataFolderCommand(dataTreeProvider)
  );
  const dataOpenDataInfoDisposable = vscode.commands.registerCommand(
    "researchflow.data.openDataInfo",
    createOpenDataInfoCommand()
  );
  const dataMoveDataDisposable = vscode.commands.registerCommand(
    "researchflow.data.moveData",
    createMoveDataCommand(dataTreeProvider, () => dataTreeView.selection)
  );
  const dataDeleteDataDisposable = vscode.commands.registerCommand(
    "researchflow.data.deleteData",
    createDeleteDataCommand(dataTreeProvider, () => dataTreeView.selection)
  );
  const openChatDisposable = vscode.commands.registerCommand("researchflow.chat.open", async (): Promise<void> => {
    await vscode.commands.executeCommand(`${ResearchFlowChatViewProvider.viewType}.focus`);
  });
  const moveChatToRightSidebarDisposable = vscode.commands.registerCommand(
    "researchflow.chat.moveToRightSidebar",
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${ResearchFlowChatViewProvider.viewType}.focus`);
      await vscode.commands.executeCommand("workbench.action.moveFocusedView");
    }
  );
  const analysisWatcher = vscode.workspace.createFileSystemWatcher("**/Analysis/**");
  const dataWatcher = vscode.workspace.createFileSystemWatcher("**/Data/**");
  const analysisLastActiveTrackingDisposable = registerAnalysisTaskLastActiveTracking(context.workspaceState);
  const analysisWatcherCreateDisposable = analysisWatcher.onDidCreate(() => analysisTreeProvider.refresh());
  const analysisWatcherChangeDisposable = analysisWatcher.onDidChange(() => analysisTreeProvider.refresh());
  const analysisWatcherDeleteDisposable = analysisWatcher.onDidDelete(() => analysisTreeProvider.refresh());
  const dataWatcherCreateDisposable = dataWatcher.onDidCreate(() => dataTreeProvider.refresh());
  const dataWatcherChangeDisposable = dataWatcher.onDidChange(() => dataTreeProvider.refresh());
  const dataWatcherDeleteDisposable = dataWatcher.onDidDelete(() => dataTreeProvider.refresh());

  context.subscriptions.push(
    projectsTreeDisposable,
    referencesTreeDisposable,
    analysisTreeView,
    writingTreeDisposable,
    chatViewDisposable,
    dataTreeView,
    initProjectDisposable,
    reinitializeProjectDisposable,
    openProjectDirectoryDisposable,
    selectProjectFolderDisposable,
    renameProjectDisposable,
    recommendCitationsDisposable,
    draftCaptionDisposable,
    openAnalysisTaskDisposable,
    analysisNewScriptDisposable,
    analysisNewExperimentDisposable,
    analysisDeleteExperimentDisposable,
    analysisDeleteFileDisposable,
    dataImportDataDisposable,
    dataNewDataFolderDisposable,
    dataOpenDataInfoDisposable,
    dataMoveDataDisposable,
    dataDeleteDataDisposable,
    openChatDisposable,
    moveChatToRightSidebarDisposable,
    analysisWatcher,
    dataWatcher,
    analysisLastActiveTrackingDisposable,
    analysisWatcherCreateDisposable,
    analysisWatcherChangeDisposable,
    analysisWatcherDeleteDisposable,
    dataWatcherCreateDisposable,
    dataWatcherChangeDisposable,
    dataWatcherDeleteDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
