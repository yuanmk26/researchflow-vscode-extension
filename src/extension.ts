import * as vscode from "vscode";

import { createAnalysisDeleteExperimentCommand } from "./commands/deleteAnalysisExperiment";
import { createAnalysisDeleteFileCommand } from "./commands/deleteAnalysisFile";
import { createDeleteStorageDataCommand } from "./commands/deleteStorageData";
import { createAnalysisNewExperimentCommand } from "./commands/createAnalysisExperiment";
import { createAnalysisNewScriptCommand } from "./commands/createAnalysisScript";
import { createStorageDataFolderCommand } from "./commands/createStorageDataFolder";
import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createStorageImportDataCommand } from "./commands/importStorageData";
import { createInitProjectCommand } from "./commands/initProject";
import { createMoveStorageDataCommand } from "./commands/moveStorageData";
import { createOpenAnalysisTaskCommand, registerAnalysisTaskLastActiveTracking } from "./commands/openAnalysisTask";
import { createOpenStorageDataInfoCommand } from "./commands/openStorageDataInfo";
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
import { StorageTreeDragAndDropController, StorageTreeProvider } from "./views/storageTreeProvider";
import { WritingTreeProvider } from "./views/writingTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const projectManager = new ProjectManager();
  const coreClient = new CoreClient();
  const researchFlowAgentService = new ResearchFlowAgentService();
  const projectTreeProvider = new ProjectTreeProvider(projectManager);
  const referencesTreeProvider = new ReferencesTreeProvider();
  const analysisTreeProvider = new AnalysisTreeProvider(projectManager);
  const writingTreeProvider = new WritingTreeProvider();
  const storageTreeProvider = new StorageTreeProvider(projectManager);
  const storageTreeDndController = new StorageTreeDragAndDropController(storageTreeProvider);
  const researchFlowChatViewProvider = new ResearchFlowChatViewProvider(
    context.extensionUri,
    researchFlowAgentService
  );

  const projectsTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.projects", projectTreeProvider);
  const referencesTreeDisposable = vscode.window.registerTreeDataProvider(
    "researchflow.references",
    referencesTreeProvider
  );
  const analysisTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.analysis", analysisTreeProvider);
  const writingTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.writing", writingTreeProvider);
  const chatViewDisposable = vscode.window.registerWebviewViewProvider(
    ResearchFlowChatViewProvider.viewType,
    researchFlowChatViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  const storageTreeView = vscode.window.createTreeView("researchflow.storage", {
    treeDataProvider: storageTreeProvider,
    dragAndDropController: storageTreeDndController,
    canSelectMany: true
  });
  const initProjectDisposable = vscode.commands.registerCommand(
    "researchflow.initProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
      storageTreeProvider.refresh();
    }
  );
  const reinitializeProjectDisposable = vscode.commands.registerCommand(
    "researchflow.reinitializeProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
      storageTreeProvider.refresh();
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
    createAnalysisDeleteFileCommand(analysisTreeProvider)
  );
  const storageImportDataDisposable = vscode.commands.registerCommand(
    "researchflow.storage.importData",
    createStorageImportDataCommand(storageTreeProvider)
  );
  const storageNewDataFolderDisposable = vscode.commands.registerCommand(
    "researchflow.storage.newDataFolder",
    createStorageDataFolderCommand(storageTreeProvider)
  );
  const storageOpenDataInfoDisposable = vscode.commands.registerCommand(
    "researchflow.storage.openDataInfo",
    createOpenStorageDataInfoCommand()
  );
  const storageMoveDataDisposable = vscode.commands.registerCommand(
    "researchflow.storage.moveData",
    createMoveStorageDataCommand(storageTreeProvider, () => storageTreeView.selection)
  );
  const storageDeleteDataDisposable = vscode.commands.registerCommand(
    "researchflow.storage.deleteData",
    createDeleteStorageDataCommand(storageTreeProvider, () => storageTreeView.selection)
  );
  const analysisWatcher = vscode.workspace.createFileSystemWatcher("**/Analysis/**");
  const storageWatcher = vscode.workspace.createFileSystemWatcher("**/Data/**");
  const analysisLastActiveTrackingDisposable = registerAnalysisTaskLastActiveTracking(context.workspaceState);
  const analysisWatcherCreateDisposable = analysisWatcher.onDidCreate(() => analysisTreeProvider.refresh());
  const analysisWatcherChangeDisposable = analysisWatcher.onDidChange(() => analysisTreeProvider.refresh());
  const analysisWatcherDeleteDisposable = analysisWatcher.onDidDelete(() => analysisTreeProvider.refresh());
  const storageWatcherCreateDisposable = storageWatcher.onDidCreate(() => storageTreeProvider.refresh());
  const storageWatcherChangeDisposable = storageWatcher.onDidChange(() => storageTreeProvider.refresh());
  const storageWatcherDeleteDisposable = storageWatcher.onDidDelete(() => storageTreeProvider.refresh());

  context.subscriptions.push(
    projectsTreeDisposable,
    referencesTreeDisposable,
    analysisTreeDisposable,
    writingTreeDisposable,
    chatViewDisposable,
    storageTreeView,
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
    storageImportDataDisposable,
    storageNewDataFolderDisposable,
    storageOpenDataInfoDisposable,
    storageMoveDataDisposable,
    storageDeleteDataDisposable,
    analysisWatcher,
    storageWatcher,
    analysisLastActiveTrackingDisposable,
    analysisWatcherCreateDisposable,
    analysisWatcherChangeDisposable,
    analysisWatcherDeleteDisposable,
    storageWatcherCreateDisposable,
    storageWatcherChangeDisposable,
    storageWatcherDeleteDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
