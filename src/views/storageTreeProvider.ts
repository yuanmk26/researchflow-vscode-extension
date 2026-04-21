import * as vscode from "vscode";
import * as path from "path";

import { ProjectManager } from "../state/projectManager";

export type StorageTreeItemKind = "group" | "file" | "info";
export type StorageGroupName = "figure" | "table" | "data";

type StorageDataEntryKind = "directory" | "file";
const STORAGE_TREE_DND_MIME = "application/vnd.code.tree.researchflow.storage";

export class StorageTreeItem extends vscode.TreeItem {
  public readonly kind: StorageTreeItemKind;
  public readonly uri?: vscode.Uri;
  public readonly groupName?: StorageGroupName;
  public readonly dataEntryKind?: StorageDataEntryKind;

  public constructor(
    label: string,
    kind: StorageTreeItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri?: vscode.Uri,
    groupName?: StorageGroupName,
    dataEntryKind?: StorageDataEntryKind
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.uri = uri;
    this.groupName = groupName;
    this.dataEntryKind = dataEntryKind;

    if (kind === "group" && groupName) {
      this.id = `storage-group:${groupName}`;
      this.iconPath = new vscode.ThemeIcon("folder");
      this.contextValue =
        groupName === "data" ? "storageDataGroup" : groupName === "figure" ? "storageFigureGroup" : "storageTableGroup";
    }

    if (kind === "file" && uri && dataEntryKind === "file") {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("file");
      this.contextValue = "storageDataFile";
      this.command = {
        command: "researchflow.storage.openDataInfo",
        title: "Open Data Info",
        arguments: [uri]
      };
    }

    if (kind === "file" && uri && dataEntryKind === "directory") {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("folder");
      this.contextValue = "storageDataDirectory";
    }

    if (kind === "info") {
      this.contextValue = "storageInfo";
      this.iconPath = new vscode.ThemeIcon("info");
    }
  }
}

export class StorageTreeProvider implements vscode.TreeDataProvider<StorageTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<StorageTreeItem | undefined | void> =
    new vscode.EventEmitter<StorageTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<StorageTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public constructor(private readonly projectManager: ProjectManager) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: StorageTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: StorageTreeItem): Thenable<StorageTreeItem[]> {
    if (!element) {
      return Promise.resolve([
        new StorageTreeItem("Figure", "group", vscode.TreeItemCollapsibleState.Collapsed, undefined, "figure"),
        new StorageTreeItem("Table", "group", vscode.TreeItemCollapsibleState.Collapsed, undefined, "table"),
        new StorageTreeItem("Data", "group", vscode.TreeItemCollapsibleState.Collapsed, undefined, "data")
      ]);
    }

    if (element.kind === "file" && element.dataEntryKind === "directory" && element.uri) {
      return this.buildDataEntriesForDirectory(element.uri);
    }

    if (element.kind !== "group" || !element.groupName) {
      return Promise.resolve([]);
    }

    if (element.groupName === "figure") {
      return Promise.resolve([new StorageTreeItem("Figure storage will be added next", "info", vscode.TreeItemCollapsibleState.None)]);
    }

    if (element.groupName === "table") {
      return Promise.resolve([new StorageTreeItem("Table storage will be added next", "info", vscode.TreeItemCollapsibleState.None)]);
    }

    return this.buildDataRootItems();
  }

  public async getStorageDataRootUri(): Promise<{ uri?: vscode.Uri; message: string }> {
    const directoryInfo = await this.projectManager.getProjectDirectoryInfo();
    if (!directoryInfo.workspaceFolder) {
      return {
        message: "Open a workspace folder first"
      };
    }

    if (!directoryInfo.initialized || !directoryInfo.path) {
      return {
        message: 'Project is not initialized. Run "ResearchFlow: Init Project" first.'
      };
    }

    const projectRootUri = vscode.Uri.file(directoryInfo.path);
    const dataRootUri = vscode.Uri.joinPath(projectRootUri, "Data");

    try {
      const stat = await vscode.workspace.fs.stat(dataRootUri);
      if ((stat.type & vscode.FileType.Directory) === 0) {
        return {
          message: 'Data path is invalid. Expected directory at "Data".'
        };
      }
    } catch {
      return {
        message: 'Missing "Data" directory. Use "Import Data" to create it automatically.'
      };
    }

    return { uri: dataRootUri, message: "" };
  }

  public async ensureStorageDataRootUri(): Promise<{ uri?: vscode.Uri; message: string }> {
    const directoryInfo = await this.projectManager.getProjectDirectoryInfo();
    if (!directoryInfo.workspaceFolder) {
      return {
        message: "Open a workspace folder first"
      };
    }

    if (!directoryInfo.initialized || !directoryInfo.path) {
      return {
        message: 'Project is not initialized. Run "ResearchFlow: Init Project" first.'
      };
    }

    const dataRootUri = vscode.Uri.joinPath(vscode.Uri.file(directoryInfo.path), "Data");
    try {
      await vscode.workspace.fs.createDirectory(dataRootUri);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(dataRootUri, ".meta"));
      return { uri: dataRootUri, message: "" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { message: `Failed to prepare storage data directory: ${message}` };
    }
  }

  private async buildDataRootItems(): Promise<StorageTreeItem[]> {
    const dataRootResult = await this.getStorageDataRootUri();
    if (!dataRootResult.uri) {
      return [new StorageTreeItem(dataRootResult.message, "info", vscode.TreeItemCollapsibleState.None)];
    }

    const items = await this.buildDataEntriesForDirectory(dataRootResult.uri);
    if (items.length > 0) {
      return items;
    }

    return [new StorageTreeItem("No data files in Data", "info", vscode.TreeItemCollapsibleState.None)];
  }

  private async buildDataEntriesForDirectory(directoryUri: vscode.Uri): Promise<StorageTreeItem[]> {
    const entries = await this.readDirectorySafe(directoryUri);
    const filteredEntries = entries.filter(([name, type]) => {
      if (name === ".meta") {
        return false;
      }

      if ((type & vscode.FileType.File) !== 0 && name.endsWith(".rfdata.md")) {
        return false;
      }

      return true;
    });

    const sortedEntries = filteredEntries.sort((a, b) => {
      const aIsDir = (a[1] & vscode.FileType.Directory) !== 0;
      const bIsDir = (b[1] & vscode.FileType.Directory) !== 0;
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }

      return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
    });

    return sortedEntries.map(([name, type]) => {
      const entryUri = vscode.Uri.joinPath(directoryUri, name);
      if ((type & vscode.FileType.Directory) !== 0) {
        return new StorageTreeItem(
          name,
          "file",
          vscode.TreeItemCollapsibleState.Collapsed,
          entryUri,
          "data",
          "directory"
        );
      }

      return new StorageTreeItem(name, "file", vscode.TreeItemCollapsibleState.None, entryUri, "data", "file");
    });
  }

  private async readDirectorySafe(directoryUri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    try {
      return await vscode.workspace.fs.readDirectory(directoryUri);
    } catch {
      return [];
    }
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

async function updateDataSidecar(dataFileUri: vscode.Uri, dataRootUri: vscode.Uri): Promise<void> {
  const stat = await vscode.workspace.fs.stat(dataFileUri);
  const metaDir = vscode.Uri.joinPath(dataRootUri, ".meta");
  const sidecarUri = vscode.Uri.joinPath(metaDir, `${path.basename(dataFileUri.fsPath)}.rfdata.md`);
  await vscode.workspace.fs.createDirectory(metaDir);
  await vscode.workspace.fs.writeFile(sidecarUri, new TextEncoder().encode(buildDataInfoMarkdown(dataFileUri, stat)));
}

export class StorageTreeDragAndDropController implements vscode.TreeDragAndDropController<StorageTreeItem> {
  public readonly dragMimeTypes = [STORAGE_TREE_DND_MIME];
  public readonly dropMimeTypes = [STORAGE_TREE_DND_MIME];

  public constructor(private readonly storageTreeProvider: StorageTreeProvider) {}

  public async handleDrag(source: readonly StorageTreeItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
    const draggableUris = source
      .filter((item) => item.kind === "file" && item.groupName === "data" && item.dataEntryKind === "file" && item.uri)
      .map((item) => item.uri as vscode.Uri);

    if (draggableUris.length === 0) {
      return;
    }

    dataTransfer.set(STORAGE_TREE_DND_MIME, new vscode.DataTransferItem(JSON.stringify(draggableUris.map((uri) => uri.toString()))));
  }

  public async handleDrop(target: StorageTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const dataRootResult = await this.storageTreeProvider.getStorageDataRootUri();
    if (!dataRootResult.uri) {
      void vscode.window.showWarningMessage(dataRootResult.message);
      return;
    }

    const destinationFolderUri = await this.resolveDestinationFolder(target, dataRootResult.uri);
    if (!destinationFolderUri) {
      return;
    }

    if (!isWithinDirectory(dataRootResult.uri.fsPath, destinationFolderUri.fsPath)) {
      void vscode.window.showWarningMessage('Destination must be inside the project "Data" directory.');
      return;
    }

    const dataItem = dataTransfer.get(STORAGE_TREE_DND_MIME);
    if (!dataItem) {
      return;
    }

    const sourceUris = this.parseSourceUris(dataItem);
    if (sourceUris.length === 0) {
      return;
    }

    let movedCount = 0;
    for (const sourceUri of sourceUris) {
      const fileName = path.basename(sourceUri.fsPath);
      const destinationUri = vscode.Uri.joinPath(destinationFolderUri, fileName);
      if (destinationUri.toString() === sourceUri.toString()) {
        continue;
      }

      let overwrite = false;
      try {
        await vscode.workspace.fs.stat(destinationUri);
        const decision = await vscode.window.showWarningMessage(
          `A file named "${fileName}" already exists in the destination folder.`,
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
        await vscode.workspace.fs.rename(sourceUri, destinationUri, { overwrite });
        await updateDataSidecar(destinationUri, dataRootResult.uri);
        movedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        void vscode.window.showErrorMessage(`Failed to move data file "${fileName}": ${message}`);
      }
    }

    if (movedCount > 0) {
      this.storageTreeProvider.refresh();
      void vscode.window.showInformationMessage(`Moved ${movedCount} data file(s).`);
    }
  }

  private async resolveDestinationFolder(
    target: StorageTreeItem | undefined,
    dataRootUri: vscode.Uri
  ): Promise<vscode.Uri | undefined> {
    if (!target) {
      return dataRootUri;
    }

    if (target.kind === "group" && target.groupName === "data") {
      return dataRootUri;
    }

    if (target.kind === "file" && target.groupName === "data" && target.dataEntryKind === "directory" && target.uri) {
      return target.uri;
    }

    return undefined;
  }

  private parseSourceUris(item: vscode.DataTransferItem): vscode.Uri[] {
    if (typeof item.value === "string") {
      try {
        const parsed = JSON.parse(item.value) as string[];
        return parsed.map((raw) => vscode.Uri.parse(raw));
      } catch {
        return [];
      }
    }

    if (Array.isArray(item.value)) {
      const candidates = item.value as unknown[];
      return candidates.filter((value): value is vscode.Uri => value instanceof vscode.Uri);
    }

    return [];
  }
}
