import * as vscode from "vscode";

import { ProjectManager } from "../state/projectManager";
import { Project } from "../types";

export function createInitProjectCommand(projectManager: ProjectManager): () => Promise<void> {
  return async (): Promise<void> => {
    const workspaceFolder = projectManager.getWorkspaceFolder();
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("Open a workspace folder before initializing a ResearchFlow project.");
      return;
    }

    const projectName = await vscode.window.showInputBox({
      prompt: "Enter a project name",
      placeHolder: "My Research Project",
      ignoreFocusOut: true,
      validateInput: (value: string) => (value.trim().length > 0 ? null : "Project name is required")
    });

    if (!projectName) {
      return;
    }

    const configPath = projectManager.getProjectConfigPath(workspaceFolder);
    const configFolder = vscode.Uri.joinPath(workspaceFolder.uri, ".researchflow");

    const project: Project = {
      name: projectName.trim(),
      rootPath: workspaceFolder.uri.fsPath,
      createdAt: new Date().toISOString()
    };

    const payload = JSON.stringify(project, null, 2);

    try {
      await vscode.workspace.fs.createDirectory(configFolder);
      await vscode.workspace.fs.writeFile(configPath, new TextEncoder().encode(payload));
      void vscode.window.showInformationMessage(`ResearchFlow project initialized: ${project.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to initialize project: ${message}`);
    }

    // TODO: Add overwrite protection/versioning strategy for project.json.
    // TODO: Validate project shape with a schema before writing.
  };
}