import * as vscode from "vscode";

import { StorageTreeItem, StorageTreeProvider } from "../views/storageTreeProvider";

const INVALID_SEGMENT_CHARS = /[<>:"|?*\x00-\x1F]/;
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/;

function normalizeRelativeFolderPath(input: string): { normalizedPath?: string; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Folder path cannot be empty." };
  }

  const normalizedSlashes = trimmed.replace(/\\/g, "/");
  if (normalizedSlashes.startsWith("/") || normalizedSlashes.startsWith("//")) {
    return { error: "Absolute paths are not allowed." };
  }

  if (WINDOWS_DRIVE_PATTERN.test(normalizedSlashes)) {
    return { error: "Drive paths are not allowed." };
  }

  const segments = normalizedSlashes.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return { error: "Path cannot contain empty segments." };
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { error: 'Path cannot contain "." or ".." segments.' };
    }

    if (INVALID_SEGMENT_CHARS.test(segment)) {
      return { error: "Path contains invalid characters." };
    }

    if (segment.endsWith(" ") || segment.endsWith(".")) {
      return { error: "Path segments cannot end with a dot or whitespace." };
    }
  }

  return { normalizedPath: segments.join("/") };
}

export function createStorageDataFolderCommand(
  storageTreeProvider: StorageTreeProvider
): (target?: vscode.Uri | StorageTreeItem) => Promise<void> {
  return async (_target?: vscode.Uri | StorageTreeItem): Promise<void> => {
    const dataRootResult = await storageTreeProvider.ensureStorageDataRootUri();
    if (!dataRootResult.uri) {
      void vscode.window.showWarningMessage(dataRootResult.message);
      return;
    }

    const folderPath = await vscode.window.showInputBox({
      prompt: "Enter folder path relative to Data/",
      placeHolder: "raw or processed/2026-04",
      ignoreFocusOut: true,
      validateInput: (value: string): string | undefined => normalizeRelativeFolderPath(value).error
    });

    if (!folderPath) {
      return;
    }

    const normalizedResult = normalizeRelativeFolderPath(folderPath);
    if (!normalizedResult.normalizedPath) {
      void vscode.window.showErrorMessage(normalizedResult.error ?? "Invalid folder path.");
      return;
    }

    const targetUri = vscode.Uri.joinPath(dataRootResult.uri, ...normalizedResult.normalizedPath.split("/"));

    try {
      const stat = await vscode.workspace.fs.stat(targetUri);
      if ((stat.type & vscode.FileType.Directory) !== 0) {
        void vscode.window.showErrorMessage(`Folder already exists: ${normalizedResult.normalizedPath}`);
      } else {
        void vscode.window.showErrorMessage(`A non-folder item already exists: ${normalizedResult.normalizedPath}`);
      }
      return;
    } catch {
      // Expected when folder does not exist.
    }

    try {
      await vscode.workspace.fs.createDirectory(targetUri);
      storageTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to create folder: ${message}`);
    }
  };
}
