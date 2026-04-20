import * as vscode from "vscode";

import { createAnalysisDeleteExperimentCommand } from "./commands/deleteAnalysisExperiment";
import { createAnalysisDeleteFileCommand } from "./commands/deleteAnalysisFile";
import { createAnalysisNewExperimentCommand } from "./commands/createAnalysisExperiment";
import { createAnalysisNewScriptCommand } from "./commands/createAnalysisScript";
import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createInitProjectCommand } from "./commands/initProject";
import { createOpenAnalysisTaskCommand, registerAnalysisTaskLastActiveTracking } from "./commands/openAnalysisTask";
import { createOpenProjectDirectoryCommand } from "./commands/openProjectDirectory";
import { createRenameProjectCommand } from "./commands/renameProject";
import { createRecommendCitationsCommand } from "./commands/recommendCitations";
import { createSelectProjectFolderCommand } from "./commands/selectProjectFolder";
import { CoreClient } from "./services/coreClient";
import { ProjectManager } from "./state/projectManager";
import { AnalysisTreeProvider } from "./views/analysisTreeProvider";
import { ProjectTreeProvider } from "./views/projectTreeProvider";
import { ReferencesTreeProvider } from "./views/referencesTreeProvider";
import { StorageTreeProvider } from "./views/storageTreeProvider";
import { WritingTreeProvider } from "./views/writingTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const projectManager = new ProjectManager();
  const coreClient = new CoreClient();
  const projectTreeProvider = new ProjectTreeProvider(projectManager);
  const referencesTreeProvider = new ReferencesTreeProvider();
  const analysisTreeProvider = new AnalysisTreeProvider(projectManager);
  const writingTreeProvider = new WritingTreeProvider();
  const storageTreeProvider = new StorageTreeProvider();

  const projectsTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.projects", projectTreeProvider);
  const referencesTreeDisposable = vscode.window.registerTreeDataProvider(
    "researchflow.references",
    referencesTreeProvider
  );
  const analysisTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.analysis", analysisTreeProvider);
  const writingTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.writing", writingTreeProvider);
  const storageTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.storage", storageTreeProvider);
  const initProjectDisposable = vscode.commands.registerCommand(
    "researchflow.initProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
    }
  );
  const reinitializeProjectDisposable = vscode.commands.registerCommand(
    "researchflow.reinitializeProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
      analysisTreeProvider.refresh();
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
  const analysisWatcher = vscode.workspace.createFileSystemWatcher("**/Analysis/**");
  const analysisLastActiveTrackingDisposable = registerAnalysisTaskLastActiveTracking(context.workspaceState);
  const analysisWatcherCreateDisposable = analysisWatcher.onDidCreate(() => analysisTreeProvider.refresh());
  const analysisWatcherChangeDisposable = analysisWatcher.onDidChange(() => analysisTreeProvider.refresh());
  const analysisWatcherDeleteDisposable = analysisWatcher.onDidDelete(() => analysisTreeProvider.refresh());

  context.subscriptions.push(
    projectsTreeDisposable,
    referencesTreeDisposable,
    analysisTreeDisposable,
    writingTreeDisposable,
    storageTreeDisposable,
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
    analysisWatcher,
    analysisLastActiveTrackingDisposable,
    analysisWatcherCreateDisposable,
    analysisWatcherChangeDisposable,
    analysisWatcherDeleteDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
