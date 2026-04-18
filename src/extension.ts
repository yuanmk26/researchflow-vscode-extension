import * as vscode from "vscode";

import { createDraftCaptionCommand } from "./commands/draftCaption";
import { createInitProjectCommand } from "./commands/initProject";
import { createRecommendCitationsCommand } from "./commands/recommendCitations";
import { CoreClient } from "./services/coreClient";
import { ProjectManager } from "./state/projectManager";
import { ProjectTreeProvider } from "./views/projectTreeProvider";
import { ReferencesTreeProvider } from "./views/referencesTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const projectManager = new ProjectManager();
  const coreClient = new CoreClient();
  const projectTreeProvider = new ProjectTreeProvider();
  const referencesTreeProvider = new ReferencesTreeProvider();

  const projectsTreeDisposable = vscode.window.registerTreeDataProvider("researchflow.projects", projectTreeProvider);
  const referencesTreeDisposable = vscode.window.registerTreeDataProvider(
    "researchflow.references",
    referencesTreeProvider
  );
  const initProjectDisposable = vscode.commands.registerCommand(
    "researchflow.initProject",
    createInitProjectCommand(projectManager)
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
    recommendCitationsDisposable,
    draftCaptionDisposable
  );
}

export function deactivate(): void {
  // Intentionally empty.
}
