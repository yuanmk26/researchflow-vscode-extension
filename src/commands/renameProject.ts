import * as path from "path";
import * as vscode from "vscode";

import { ProjectManager } from "../state/projectManager";
import { Project } from "../types";

function parseProject(raw: Uint8Array): Project | undefined {
  try {
    const decoded = new TextDecoder("utf-8").decode(raw);
    return JSON.parse(decoded) as Project;
  } catch {
    return undefined;
  }
}

export function createRenameProjectCommand(projectManager: ProjectManager): () => Promise<void> {
  return async (): Promise<void> => {
    const workspaceFolder = projectManager.getWorkspaceFolder();
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage("Open a workspace folder before renaming a ResearchFlow project.");
      return;
    }

    const initialized = await projectManager.projectExists(workspaceFolder);
    if (!initialized) {
      void vscode.window.showWarningMessage("Initialize the ResearchFlow project before renaming it.");
      return;
    }

    const currentName = workspaceFolder.name;
    const renamedName = await vscode.window.showInputBox({
      prompt: "Enter a new project name",
      placeHolder: currentName,
      value: currentName,
      ignoreFocusOut: true,
      validateInput: (value: string) => {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
          return "Project name is required";
        }

        if (/[\\/]/.test(trimmedValue)) {
          return "Project name cannot contain path separators";
        }

        return null;
      }
    });

    if (!renamedName) {
      return;
    }

    const nextName = renamedName.trim();
    if (nextName === currentName) {
      return;
    }

    const oldFolderUri = workspaceFolder.uri;
    const parentFolderUri = vscode.Uri.file(path.dirname(oldFolderUri.fsPath));
    const newFolderUri = vscode.Uri.joinPath(parentFolderUri, nextName);
    const newConfigPath = vscode.Uri.joinPath(newFolderUri, ".researchflow", "project.json");
    const newConfigFolder = vscode.Uri.joinPath(newFolderUri, ".researchflow");

    try {
      await vscode.workspace.fs.stat(newFolderUri);
      void vscode.window.showErrorMessage(`Cannot rename project folder: target already exists (${nextName}).`);
      return;
    } catch {
      // Target path does not exist, continue.
    }

    let renamed = false;

    try {
      await vscode.workspace.fs.rename(oldFolderUri, newFolderUri, { overwrite: false });
      renamed = true;

      let createdAt = new Date().toISOString();
      try {
        const rawProject = await vscode.workspace.fs.readFile(newConfigPath);
        const parsedProject = parseProject(rawProject);
        if (parsedProject?.createdAt) {
          createdAt = parsedProject.createdAt;
        }
      } catch {
        // Use fallback createdAt when config cannot be read.
      }

      const nextProject: Project = {
        name: nextName,
        rootPath: newFolderUri.fsPath,
        createdAt
      };

      await vscode.workspace.fs.createDirectory(newConfigFolder);
      await vscode.workspace.fs.writeFile(newConfigPath, new TextEncoder().encode(JSON.stringify(nextProject, null, 2)));
      await vscode.commands.executeCommand("vscode.openFolder", newFolderUri, false);
    } catch (error) {
      if (renamed) {
        try {
          await vscode.workspace.fs.rename(newFolderUri, oldFolderUri, { overwrite: false });
        } catch {
          // Best-effort rollback only.
        }
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to rename project: ${message}`);
    }
  };
}
