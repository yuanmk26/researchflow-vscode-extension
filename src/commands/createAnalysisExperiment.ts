import * as vscode from "vscode";

import { AnalysisTreeProvider } from "../views/analysisTreeProvider";

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

function validateExperimentName(input: string): string | undefined {
  const name = input.trim();
  if (!name) {
    return "Experiment name cannot be empty.";
  }

  if (name === "." || name === "..") {
    return 'Experiment name cannot be "." or "..".';
  }

  if (INVALID_NAME_CHARS.test(name)) {
    return "Experiment name contains invalid characters.";
  }

  if (name.endsWith(" ") || name.endsWith(".")) {
    return "Experiment name cannot end with a dot or whitespace.";
  }

  return undefined;
}

export function createAnalysisNewExperimentCommand(
  analysisTreeProvider: AnalysisTreeProvider
): () => Promise<void> {
  return async (): Promise<void> => {
    const analysisRoot = await analysisTreeProvider.getAnalysisRootUri();
    if (!analysisRoot.uri) {
      void vscode.window.showWarningMessage(analysisRoot.message);
      return;
    }

    const experimentName = await vscode.window.showInputBox({
      prompt: "Enter experiment name",
      placeHolder: "experiment-01",
      validateInput: (value: string): string | undefined => validateExperimentName(value)
    });

    if (experimentName === undefined) {
      return;
    }

    const normalizedName = experimentName.trim();
    const experimentRoot = vscode.Uri.joinPath(analysisRoot.uri, normalizedName);

    try {
      await vscode.workspace.fs.stat(experimentRoot);
      void vscode.window.showErrorMessage(`Experiment already exists: ${normalizedName}`);
      return;
    } catch {
      // Expected when directory does not exist.
    }

    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(experimentRoot, "scripts"));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(experimentRoot, "figures"));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(experimentRoot, "tables"));
      analysisTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to create experiment: ${message}`);
    }
  };
}
