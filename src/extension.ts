import * as vscode from "vscode";

import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createInitProjectCommand } from "./commands/initProject";
import { createOpenProjectDirectoryCommand } from "./commands/openProjectDirectory";
import { createRecommendCitationsCommand } from "./commands/recommendCitations";
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
  const openProjectDirectoryDisposable = vscode.commands.registerCommand(
    "researchflow.openProjectDirectory",
    createOpenProjectDirectoryCommand(projectManager)
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
    openProjectDirectoryDisposable,
    recommendCitationsDisposable,
    draftCaptionDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
