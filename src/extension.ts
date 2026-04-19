import * as vscode from "vscode";

import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createInitProjectCommand } from "./commands/initProject";
import { createOpenProjectDirectoryCommand } from "./commands/openProjectDirectory";
import { createRenameProjectCommand } from "./commands/renameProject";
import { createRecommendCitationsCommand } from "./commands/recommendCitations";
import { createSelectProjectFolderCommand } from "./commands/selectProjectFolder";
import { CoreClient } from "./services/coreClient";
import { ProjectManager } from "./state/projectManager";
import { ProjectTreeProvider } from "./views/projectTreeProvider";
import { ReferencesTreeProvider } from "./views/referencesTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const projectManager = new ProjectManager();
  const coreClient = new CoreClient();
  const projectTreeProvider = new ProjectTreeProvider(projectManager);
  const referencesTreeProvider = new ReferencesTreeProvider();

  const projectsTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.projects", projectTreeProvider);
  const referencesTreeDisposable = vscode.window.registerTreeDataProvider(
    "researchflow.references",
    referencesTreeProvider
  );
  const initProjectDisposable = vscode.commands.registerCommand(
    "researchflow.initProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
    }
  );
  const reinitializeProjectDisposable = vscode.commands.registerCommand(
    "researchflow.reinitializeProject",
    async (): Promise<void> => {
      await createInitProjectCommand(projectManager)();
      projectTreeProvider.refresh();
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

  context.subscriptions.push(
    projectsTreeDisposable,
    referencesTreeDisposable,
    initProjectDisposable,
    reinitializeProjectDisposable,
    openProjectDirectoryDisposable,
    selectProjectFolderDisposable,
    renameProjectDisposable,
    recommendCitationsDisposable,
    draftCaptionDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
