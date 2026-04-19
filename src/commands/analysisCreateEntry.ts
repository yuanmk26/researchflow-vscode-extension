import * as path from "path";
import * as vscode from "vscode";

import { AnalysisTreeItem, AnalysisTreeProvider } from "../views/analysisTreeProvider";

type AnalysisEntryKind = "file" | "folder";

const INVALID_SEGMENT_CHARS = /[<>:"|?*\x00-\x1F]/;
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/;

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

function toUriWithinParent(parentDirectoryUri: vscode.Uri, normalizedPath: string): vscode.Uri {
  const segments = normalizedPath.split("/").filter(Boolean);
  return vscode.Uri.joinPath(parentDirectoryUri, ...segments);
}

function isWithinRoot(rootUri: vscode.Uri, targetUri: vscode.Uri): boolean {
  const relativePath = path.relative(rootUri.fsPath, targetUri.fsPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizeRelativePath(input: string): { normalizedPath?: string; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Name cannot be empty." };
  }

  const normalizedSlashes = trimmed.replace(/\\/g, "/");
  if (normalizedSlashes.startsWith("/") || normalizedSlashes.startsWith("//")) {
    return { error: "Absolute paths are not allowed." };
  }

  if (WINDOWS_DRIVE_PATTERN.test(normalizedSlashes)) {
    return { error: "Drive paths are not allowed." };
  }

  const rawSegments = normalizedSlashes.split("/");
  if (rawSegments.some((segment) => segment.length === 0)) {
    return { error: "Path cannot contain empty segments." };
  }

  for (const segment of rawSegments) {
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

  return { normalizedPath: rawSegments.join("/") };
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

  const parentDirectoryUri = getParentDirectoryUri(targetItem, analysisRoot.uri);
  analysisTreeProvider.setPendingCreate(kind, parentDirectoryUri);
  analysisTreeProvider.refresh();

  try {
    const entryPath = await vscode.window.showInputBox({
      prompt: kind === "file" ? "Enter a new file path (supports sub/path.md)" : "Enter a new folder path",
      placeHolder: kind === "file" ? "chapter1/notes.md" : "topic-a/subtopic",
      ignoreFocusOut: true,
      validateInput: (value: string): string | undefined => normalizeRelativePath(value).error
    });

    if (!entryPath) {
      return;
    }

    const normalizedResult = normalizeRelativePath(entryPath);
    if (!normalizedResult.normalizedPath) {
      void vscode.window.showErrorMessage(normalizedResult.error ?? "Invalid name");
      return;
    }

    const targetUri = toUriWithinParent(parentDirectoryUri, normalizedResult.normalizedPath);
    if (!isWithinRoot(analysisRoot.uri, targetUri)) {
      void vscode.window.showErrorMessage("Target path must stay inside the Analysis directory.");
      return;
    }

    try {
      await vscode.workspace.fs.stat(targetUri);
      void vscode.window.showErrorMessage(`${kind === "file" ? "File" : "Folder"} already exists: ${entryPath}`);
      return;
    } catch {
      // Expected when target does not exist.
    }

    if (kind === "file") {
      const folderSegments = normalizedResult.normalizedPath.split("/").slice(0, -1);
      if (folderSegments.length > 0) {
        const folderUri = vscode.Uri.joinPath(parentDirectoryUri, ...folderSegments);
        await vscode.workspace.fs.createDirectory(folderUri);
      }

      await vscode.workspace.fs.writeFile(targetUri, new Uint8Array());
    } else {
      await vscode.workspace.fs.createDirectory(targetUri);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    void vscode.window.showErrorMessage(`Failed to create ${kind}: ${message}`);
  } finally {
    analysisTreeProvider.clearPendingCreate();
    analysisTreeProvider.refresh();
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
