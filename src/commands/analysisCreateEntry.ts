import * as path from "path";
import * as vscode from "vscode";

import { AnalysisTreeItem, AnalysisTreeProvider } from "../views/analysisTreeProvider";

type AnalysisEntryKind = "file" | "folder";

const INVALID_NAME_PATTERN = /[\\/]/;

function getParentDirectoryUri(targetItem: AnalysisTreeItem | undefined, fallbackRootUri: vscode.Uri): vscode.Uri {
  if (!targetItem?.uri) {
    return fallbackRootUri;
  }

  if (targetItem.kind === "directory") {
    return targetItem.uri;
  }

  if (targetItem.kind === "file") {
    return vscode.Uri.file(path.dirname(targetItem.uri.fsPath));
  }

  return fallbackRootUri;
}

function validateEntryName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Name cannot be empty.";
  }

  if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    return 'Name cannot contain "..".';
  }

  if (INVALID_NAME_PATTERN.test(trimmed)) {
    return "Use a single name only (no path separators).";
  }

  return undefined;
}

async function createAnalysisEntry(
  kind: AnalysisEntryKind,
  analysisTreeProvider: AnalysisTreeProvider,
  targetItem?: AnalysisTreeItem
): Promise<void> {
  const analysisRoot = await analysisTreeProvider.getAnalysisRootUri();
  if (!analysisRoot.uri) {
    void vscode.window.showWarningMessage(analysisRoot.message);
    return;
  }

  const entryName = await vscode.window.showInputBox({
    prompt: kind === "file" ? "Enter a new file name" : "Enter a new folder name",
    placeHolder: kind === "file" ? "notes.md" : "topic-a",
    ignoreFocusOut: true,
    validateInput: (value: string): string | undefined => validateEntryName(value)
  });

  if (!entryName) {
    return;
  }

  const parentDirectoryUri = getParentDirectoryUri(targetItem, analysisRoot.uri);
  const targetUri = vscode.Uri.joinPath(parentDirectoryUri, entryName.trim());

  try {
    await vscode.workspace.fs.stat(targetUri);
    void vscode.window.showErrorMessage(`${kind === "file" ? "File" : "Folder"} already exists: ${entryName}`);
    return;
  } catch {
    // Expected when target does not exist.
  }

  try {
    if (kind === "file") {
      await vscode.workspace.fs.writeFile(targetUri, new Uint8Array());
    } else {
      await vscode.workspace.fs.createDirectory(targetUri);
    }

    analysisTreeProvider.refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`Failed to create ${kind}: ${message}`);
  }
}

export function createAnalysisNewFileCommand(
  analysisTreeProvider: AnalysisTreeProvider
): (targetItem?: AnalysisTreeItem) => Promise<void> {
  return async (targetItem?: AnalysisTreeItem): Promise<void> => {
    await createAnalysisEntry("file", analysisTreeProvider, targetItem);
  };
}

export function createAnalysisNewFolderCommand(
  analysisTreeProvider: AnalysisTreeProvider
): (targetItem?: AnalysisTreeItem) => Promise<void> {
  return async (targetItem?: AnalysisTreeItem): Promise<void> => {
    await createAnalysisEntry("folder", analysisTreeProvider, targetItem);
  };
}
