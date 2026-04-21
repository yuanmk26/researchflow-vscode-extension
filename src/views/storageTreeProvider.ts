import * as vscode from "vscode";
import * as path from "path";

import { ProjectManager } from "../state/projectManager";

export type StorageTreeItemKind = "group" | "file" | "info";
export type StorageGroupName = "figure" | "table" | "data";

export class StorageTreeItem extends vscode.TreeItem {
  public readonly kind: StorageTreeItemKind;
  public readonly uri?: vscode.Uri;
  public readonly groupName?: StorageGroupName;

  public constructor(
    label: string,
    kind: StorageTreeItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri?: vscode.Uri,
    groupName?: StorageGroupName
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.uri = uri;
    this.groupName = groupName;

    if (kind === "group" && groupName) {
      this.id = `storage-group:${groupName}`;
      this.iconPath = new vscode.ThemeIcon("folder");
      this.contextValue =
        groupName === "data" ? "storageDataGroup" : groupName === "figure" ? "storageFigureGroup" : "storageTableGroup";
    }

    if (kind === "file" && uri) {
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

    if (element.kind !== "group" || !element.groupName) {
      return Promise.resolve([]);
    }

    if (element.groupName === "figure") {
      return Promise.resolve([new StorageTreeItem("Figure storage will be added next", "info", vscode.TreeItemCollapsibleState.None)]);
    }

    if (element.groupName === "table") {
      return Promise.resolve([new StorageTreeItem("Table storage will be added next", "info", vscode.TreeItemCollapsibleState.None)]);
    }

    return this.buildDataFileItems();
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

  private async buildDataFileItems(): Promise<StorageTreeItem[]> {
    const dataRootResult = await this.getStorageDataRootUri();
    if (!dataRootResult.uri) {
      return [new StorageTreeItem(dataRootResult.message, "info", vscode.TreeItemCollapsibleState.None)];
    }

    const files = await this.readFilesRecursively(dataRootResult.uri);
    const visibleFiles = files.filter((fileUri) => {
      const relativePath = path.relative(dataRootResult.uri?.fsPath ?? "", fileUri.fsPath).replace(/\\/g, "/");
      if (!relativePath || relativePath.startsWith(".meta/")) {
        return false;
      }

      return !relativePath.endsWith(".rfdata.md");
    });

    if (visibleFiles.length === 0) {
      return [new StorageTreeItem("No data files in Data", "info", vscode.TreeItemCollapsibleState.None)];
    }

    return visibleFiles.map((fileUri) => {
      const relativePath = path.relative(dataRootResult.uri?.fsPath ?? "", fileUri.fsPath).replace(/\\/g, "/");
      return new StorageTreeItem(relativePath, "file", vscode.TreeItemCollapsibleState.None, fileUri, "data");
    });
  }

  private async readFilesRecursively(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];

    const walk = async (current: vscode.Uri): Promise<void> => {
      const entries = await vscode.workspace.fs.readDirectory(current);
      const sortedEntries = entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
      for (const [name, type] of sortedEntries) {
        const uri = vscode.Uri.joinPath(current, name);
        if ((type & vscode.FileType.Directory) !== 0) {
          await walk(uri);
        } else if ((type & vscode.FileType.File) !== 0) {
          files.push(uri);
        }
      }
    };

    try {
      await walk(folderUri);
    } catch {
      return [];
    }

    return files;
  }
}
