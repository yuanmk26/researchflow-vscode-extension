import * as path from "path";
import * as vscode from "vscode";

import { DataTreeItem, DataTreeProvider } from "../views/dataTreeProvider";

export function createImportDataCommand(
  dataTreeProvider: DataTreeProvider
): (target?: vscode.Uri | DataTreeItem) => Promise<void> {
  return async (_target?: vscode.Uri | DataTreeItem): Promise<void> => {
    const dataRootResult = await dataTreeProvider.ensureDataRootUri();
    if (!dataRootResult.uri) {
      void vscode.window.showWarningMessage(dataRootResult.message);
      return;
    }

    const pickedFiles = await vscode.window.showOpenDialog({
      title: "Import data files",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Import to Data"
    });

    if (!pickedFiles || pickedFiles.length === 0) {
      return;
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const sourceUri of pickedFiles) {
      const fileName = path.basename(sourceUri.fsPath);
      const targetUri = vscode.Uri.joinPath(dataRootResult.uri, fileName);

      try {
        await vscode.workspace.fs.stat(targetUri);
        const decision = await vscode.window.showWarningMessage(
          `Data file "${fileName}" already exists in Data.`,
          { modal: true },
          "Overwrite",
          "Skip",
          "Cancel Import"
        );

        if (decision === "Cancel Import") {
          break;
        }

        if (decision !== "Overwrite") {
          skippedCount += 1;
          continue;
        }
      } catch {
        // Target does not exist.
      }

      try {
        await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: true });
        importedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        void vscode.window.showErrorMessage(`Failed to import "${fileName}": ${message}`);
      }
    }

    dataTreeProvider.refresh();
    void vscode.window.showInformationMessage(
      `Import completed: ${importedCount} file(s) imported${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}.`
    );
  };
}
