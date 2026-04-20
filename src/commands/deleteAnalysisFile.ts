import * as path from "path";
import * as vscode from "vscode";

import { AnalysisTreeItem, AnalysisTreeProvider } from "../views/analysisTreeProvider";

function resolveFileUri(target?: vscode.Uri | AnalysisTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "file" && target.uri) {
    return target.uri;
  }

  return undefined;
}

export function createAnalysisDeleteFileCommand(
  analysisTreeProvider: AnalysisTreeProvider
): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | AnalysisTreeItem): Promise<void> => {
    const fileUri = resolveFileUri(target);
    if (!fileUri) {
      void vscode.window.showWarningMessage("No file selected.");
      return;
    }

    const fileName = path.basename(fileUri.fsPath);
    const confirmAction = "Delete";
    const selected = await vscode.window.showWarningMessage(
      `Delete file "${fileName}"? It will be moved to Recycle Bin.`,
      { modal: true },
      confirmAction
    );
    if (selected !== confirmAction) {
      return;
    }

    try {
      await vscode.workspace.fs.delete(fileUri, { recursive: false, useTrash: true });
      analysisTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to move file to Recycle Bin: ${message}`);
    }
  };
}
