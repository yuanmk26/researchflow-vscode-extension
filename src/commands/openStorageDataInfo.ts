import * as path from "path";
import * as vscode from "vscode";

import { StorageTreeItem } from "../views/storageTreeProvider";

function resolveDataFileUri(target?: vscode.Uri | StorageTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "file" && target.groupName === "data" && target.uri) {
    return target.uri;
  }

  return undefined;
}

async function closeAllEditorTabs(): Promise<void> {
  const allTabs: vscode.Tab[] = [];
  for (const group of vscode.window.tabGroups.all) {
    allTabs.push(...group.tabs);
  }

  if (allTabs.length === 0) {
    return;
  }

  const closed = await vscode.window.tabGroups.close(allTabs, false);
  if (!closed) {
    throw new Error("tab-close-cancelled");
  }
}

function findStorageDataRoot(fileUri: vscode.Uri): vscode.Uri {
  let currentPath = path.dirname(fileUri.fsPath);

  while (true) {
    const parentPath = path.dirname(currentPath);
    if (currentPath === parentPath) {
      return vscode.Uri.file(path.dirname(fileUri.fsPath));
    }

    if (path.basename(currentPath).toLowerCase() === "data") {
      return vscode.Uri.file(currentPath);
    }

    currentPath = parentPath;
  }
}

function formatBytes(size: number): string {
  return `${size} B`;
}

function buildDataInfoMarkdown(dataUri: vscode.Uri, stat: vscode.FileStat): string {
  const fileName = path.basename(dataUri.fsPath);
  const modified = new Date(stat.mtime).toISOString();

  return `# Data File Info

- Name: \`${fileName}\`
- Absolute path: \`${dataUri.fsPath}\`
- Size: \`${formatBytes(stat.size)}\`
- Last modified: \`${modified}\`
`;
}

export function createOpenStorageDataInfoCommand(): (target?: vscode.Uri | StorageTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | StorageTreeItem): Promise<void> => {
    const dataUri = resolveDataFileUri(target);
    if (!dataUri) {
      void vscode.window.showWarningMessage("No data file selected.");
      return;
    }

    const fileName = path.basename(dataUri.fsPath);
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(dataUri);
      if ((stat.type & vscode.FileType.File) === 0) {
        void vscode.window.showWarningMessage("Selected data item is not a file.");
        return;
      }
    } catch {
      void vscode.window.showWarningMessage(`Selected file does not exist: ${fileName}`);
      return;
    }

    try {
      await closeAllEditorTabs();
    } catch (error) {
      if (error instanceof Error && error.message === "tab-close-cancelled") {
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to close editors: ${message}`);
      return;
    }

    const dataRootUri = findStorageDataRoot(dataUri);
    const metaDir = vscode.Uri.joinPath(dataRootUri, ".meta");
    const sidecarUri = vscode.Uri.joinPath(metaDir, `${fileName}.rfdata.md`);

    try {
      await vscode.workspace.fs.createDirectory(metaDir);
      const content = buildDataInfoMarkdown(dataUri, stat);
      await vscode.workspace.fs.writeFile(sidecarUri, new TextEncoder().encode(content));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to create data info file: ${message}`);
      return;
    }

    await vscode.window.showTextDocument(sidecarUri, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
    });
  };
}
