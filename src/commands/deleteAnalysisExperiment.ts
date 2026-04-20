import * as path from "path";
import * as vscode from "vscode";

import { AnalysisTreeItem, AnalysisTreeProvider } from "../views/analysisTreeProvider";

function resolveExperimentUri(target?: vscode.Uri | AnalysisTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "task" && target.uri) {
    return target.uri;
  }

  return undefined;
}

export function createAnalysisDeleteExperimentCommand(
  analysisTreeProvider: AnalysisTreeProvider
): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | AnalysisTreeItem): Promise<void> => {
    const experimentUri = resolveExperimentUri(target);
    if (!experimentUri) {
      void vscode.window.showWarningMessage("No experiment selected.");
      return;
    }

    const experimentName = path.basename(experimentUri.fsPath);
    const confirmAction = "Delete";
    const selected = await vscode.window.showWarningMessage(
      `Delete experiment "${experimentName}"? It will be moved to Recycle Bin.`,
      { modal: true },
      confirmAction
    );
    if (selected !== confirmAction) {
      return;
    }

    try {
      await vscode.workspace.fs.delete(experimentUri, { recursive: true, useTrash: true });
      analysisTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to move experiment to Recycle Bin: ${message}`);
    }
  };
}
