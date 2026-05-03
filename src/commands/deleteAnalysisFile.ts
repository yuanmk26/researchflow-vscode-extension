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

function resolveFileUris(items: readonly (vscode.Uri | AnalysisTreeItem)[]): vscode.Uri[] {
  const seen = new Set<string>();
  const uris: vscode.Uri[] = [];

  for (const item of items) {
    const uri = resolveFileUri(item);
    if (!uri) {
      continue;
    }

    const key = uri.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uris.push(uri);
  }

  return uris;
}

export function createAnalysisDeleteFileCommand(
  analysisTreeProvider: AnalysisTreeProvider,
  getSelection: () => readonly AnalysisTreeItem[]
): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | AnalysisTreeItem): Promise<void> => {
    const targetUri = resolveFileUri(target);
    const selectedItems = getSelection();
    const includesTarget = selectedItems.some((item) => item.uri?.toString() === targetUri?.toString());
    const fileUris =
      includesTarget && selectedItems.length > 1
        ? resolveFileUris(selectedItems)
        : resolveFileUris(target ? [target] : []);

    if (fileUris.length === 0) {
      void vscode.window.showWarningMessage("No file selected.");
      return;
    }

    const confirmAction = "Delete";
    const message =
      fileUris.length === 1
        ? `Delete file "${path.basename(fileUris[0].fsPath)}"? It will be moved to Recycle Bin.`
        : `Delete ${fileUris.length} files? They will be moved to Recycle Bin.`;
    const selected = await vscode.window.showWarningMessage(message, { modal: true }, confirmAction);
    if (selected !== confirmAction) {
      return;
    }

    let deletedCount = 0;
    for (const fileUri of fileUris) {
      const fileName = path.basename(fileUri.fsPath);
      try {
        await vscode.workspace.fs.delete(fileUri, { recursive: false, useTrash: true });
        deletedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        void vscode.window.showErrorMessage(`Failed to move file "${fileName}" to Recycle Bin: ${message}`);
      }
    }

    analysisTreeProvider.refresh();
    if (deletedCount > 0) {
      void vscode.window.showInformationMessage(`Deleted ${deletedCount} file(s).`);
    }
  };
}
