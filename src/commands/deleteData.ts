import * as path from "path";
import * as vscode from "vscode";

import { DataTreeItem, DataTreeProvider } from "../views/dataTreeProvider";

function resolveDataFileUri(target?: vscode.Uri | DataTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "file" && target.dataEntryKind === "file" && target.uri) {
    return target.uri;
  }

  return undefined;
}

function resolveDataFileUris(items: readonly (vscode.Uri | DataTreeItem)[]): vscode.Uri[] {
  const seen = new Set<string>();
  const uris: vscode.Uri[] = [];

  for (const item of items) {
    const uri = resolveDataFileUri(item);
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

async function deleteSidecarIfPresent(dataRootUri: vscode.Uri, dataFileUri: vscode.Uri): Promise<void> {
  const sidecarUri = vscode.Uri.joinPath(dataRootUri, ".meta", `${path.basename(dataFileUri.fsPath)}.rfdata.md`);

  try {
    await vscode.workspace.fs.stat(sidecarUri);
  } catch {
    return;
  }

  await vscode.workspace.fs.delete(sidecarUri, { recursive: false, useTrash: true });
}

export function createDeleteDataCommand(
  dataTreeProvider: DataTreeProvider,
  getSelection: () => readonly DataTreeItem[]
): (target?: vscode.Uri | DataTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | DataTreeItem): Promise<void> => {
    const targetUri = resolveDataFileUri(target);
    const selectedItems = getSelection();
    const includesTarget = selectedItems.some((item) => item.uri?.toString() === targetUri?.toString());
    const dataFileUris =
      includesTarget && selectedItems.length > 1
        ? resolveDataFileUris(selectedItems)
        : resolveDataFileUris(target ? [target] : []);

    if (dataFileUris.length === 0) {
      void vscode.window.showWarningMessage("No data file selected.");
      return;
    }

    const dataRootResult = await dataTreeProvider.getDataRootUri();
    if (!dataRootResult.uri) {
      void vscode.window.showWarningMessage(dataRootResult.message);
      return;
    }

    const confirmAction = "Delete";
    const message =
      dataFileUris.length === 1
        ? `Delete data file "${path.basename(dataFileUris[0].fsPath)}"? It will be moved to Recycle Bin.`
        : `Delete ${dataFileUris.length} data files? They will be moved to Recycle Bin.`;
    const selected = await vscode.window.showWarningMessage(message, { modal: true }, confirmAction);
    if (selected !== confirmAction) {
      return;
    }

    let deletedCount = 0;
    for (const dataFileUri of dataFileUris) {
      const fileName = path.basename(dataFileUri.fsPath);
      try {
        await vscode.workspace.fs.delete(dataFileUri, { recursive: false, useTrash: true });
        deletedCount += 1;

        try {
          await deleteSidecarIfPresent(dataRootResult.uri, dataFileUri);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          void vscode.window.showErrorMessage(`Deleted data file "${fileName}", but failed to delete its info file: ${message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        void vscode.window.showErrorMessage(`Failed to move data file "${fileName}" to Recycle Bin: ${message}`);
      }
    }

    dataTreeProvider.refresh();
    if (deletedCount > 0) {
      void vscode.window.showInformationMessage(`Deleted ${deletedCount} data file(s).`);
    }
  };
}
