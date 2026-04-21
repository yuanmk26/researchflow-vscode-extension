import * as path from "path";
import * as vscode from "vscode";

import { StorageTreeItem, StorageTreeProvider } from "../views/storageTreeProvider";

function resolveDataFileUri(target?: vscode.Uri | StorageTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "file" && target.groupName === "data" && target.dataEntryKind === "file" && target.uri) {
    return target.uri;
  }

  return undefined;
}

function resolveDataFileUris(items: readonly (vscode.Uri | StorageTreeItem)[]): vscode.Uri[] {
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

function findDataRoot(fileUri: vscode.Uri): vscode.Uri {
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

function isWithinDirectory(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildDataInfoMarkdown(dataUri: vscode.Uri, stat: vscode.FileStat): string {
  const fileName = path.basename(dataUri.fsPath);
  const modified = new Date(stat.mtime).toISOString();

  return `# Data File Info

- Name: \`${fileName}\`
- Absolute path: \`${dataUri.fsPath}\`
- Size: \`${stat.size} B\`
- Last modified: \`${modified}\`
`;
}

async function writeSidecarForDataFile(dataFileUri: vscode.Uri): Promise<void> {
  const stat = await vscode.workspace.fs.stat(dataFileUri);
  const dataRootUri = findDataRoot(dataFileUri);
  const metaDir = vscode.Uri.joinPath(dataRootUri, ".meta");
  const sidecarUri = vscode.Uri.joinPath(metaDir, `${path.basename(dataFileUri.fsPath)}.rfdata.md`);

  await vscode.workspace.fs.createDirectory(metaDir);
  await vscode.workspace.fs.writeFile(sidecarUri, new TextEncoder().encode(buildDataInfoMarkdown(dataFileUri, stat)));
}

export function createMoveStorageDataCommand(
  storageTreeProvider: StorageTreeProvider,
  getSelection: () => readonly StorageTreeItem[]
): (target?: vscode.Uri | StorageTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | StorageTreeItem): Promise<void> => {
    const selectedItems = getSelection();
    const includesTarget = selectedItems.some((item) => item.uri?.toString() === resolveDataFileUri(target)?.toString());
    const sourceUris =
      includesTarget && selectedItems.length > 1
        ? resolveDataFileUris(selectedItems)
        : resolveDataFileUris(target ? [target] : []);

    if (sourceUris.length === 0) {
      void vscode.window.showWarningMessage("No data file selected.");
      return;
    }

    const dataRootResult = await storageTreeProvider.getStorageDataRootUri();
    if (!dataRootResult.uri) {
      void vscode.window.showWarningMessage(dataRootResult.message);
      return;
    }

    const fileName = path.basename(sourceUris[0].fsPath);
    const titlePrefix = sourceUris.length === 1 ? fileName : `${sourceUris.length} data files`;
    const selectedFolder = await vscode.window.showOpenDialog({
      title: `Select destination folder for ${titlePrefix}`,
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: dataRootResult.uri,
      openLabel: "Move Here"
    });

    if (!selectedFolder || selectedFolder.length === 0) {
      return;
    }

    const destinationFolderUri = selectedFolder[0];
    if (!isWithinDirectory(dataRootResult.uri.fsPath, destinationFolderUri.fsPath)) {
      void vscode.window.showWarningMessage('Destination must be inside the project "Data" directory.');
      return;
    }

    let movedCount = 0;
    for (const sourceUri of sourceUris) {
      const sourceFileName = path.basename(sourceUri.fsPath);
      const targetUri = vscode.Uri.joinPath(destinationFolderUri, sourceFileName);
      if (targetUri.toString() === sourceUri.toString()) {
        continue;
      }

      let overwrite = false;
      try {
        await vscode.workspace.fs.stat(targetUri);
        const decision = await vscode.window.showWarningMessage(
          `A file named "${sourceFileName}" already exists in the destination folder.`,
          { modal: true },
          "Overwrite",
          "Skip",
          "Cancel Move"
        );
        if (decision === "Cancel Move") {
          break;
        }

        if (decision !== "Overwrite") {
          continue;
        }

        overwrite = true;
      } catch {
        // Destination file does not exist.
      }

      try {
        await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite });
        await writeSidecarForDataFile(targetUri);
        movedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        void vscode.window.showErrorMessage(`Failed to move data file "${sourceFileName}": ${message}`);
      }
    }

    storageTreeProvider.refresh();
    if (movedCount > 0) {
      void vscode.window.showInformationMessage(`Moved ${movedCount} data file(s) successfully.`);
    }
  };
}
