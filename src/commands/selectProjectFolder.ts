import * as vscode from "vscode";

export function createSelectProjectFolderCommand(): () => Promise<void> {
  return async (): Promise<void> => {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select Project Folder"
    });

    if (!selection || selection.length === 0) {
      return;
    }

    await vscode.commands.executeCommand("vscode.openFolder", selection[0], false);
  };
}
