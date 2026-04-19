import * as vscode from "vscode";

import { ProjectManager } from "../state/projectManager";

export function createOpenProjectDirectoryCommand(projectManager: ProjectManager): () => Promise<void> {
  return async (): Promise<void> => {
    const directoryInfo = await projectManager.getProjectDirectoryInfo();

    if (!directoryInfo.path) {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Open Folder"
      });

      if (!selection || selection.length === 0) {
        return;
      }

      await vscode.commands.executeCommand("vscode.openFolder", selection[0], false);
      return;
    }

    try {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(directoryInfo.path));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to open project directory: ${message}`);
    }
  };
}
