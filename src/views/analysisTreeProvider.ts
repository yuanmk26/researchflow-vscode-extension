import * as vscode from "vscode";
import * as path from "path";

import { ProjectManager } from "../state/projectManager";

export type AnalysisTreeItemKind = "directory" | "file" | "info";

export class AnalysisTreeItem extends vscode.TreeItem {
  public readonly kind: AnalysisTreeItemKind;
  public readonly uri?: vscode.Uri;

  public constructor(
    label: string,
    kind: AnalysisTreeItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri?: vscode.Uri
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.uri = uri;
    this.contextValue =
      kind === "directory" ? "analysisDirectory" : kind === "file" ? "analysisFile" : "analysisInfo";

    if (uri) {
      this.resourceUri = uri;
      this.id = uri.toString();
    }

    if (kind === "file" && uri) {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri]
      };
    }
  }
}

export class AnalysisTreeProvider implements vscode.TreeDataProvider<AnalysisTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<AnalysisTreeItem | undefined | void> =
    new vscode.EventEmitter<AnalysisTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<AnalysisTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public constructor(private readonly projectManager: ProjectManager) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: AnalysisTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: AnalysisTreeItem): Promise<AnalysisTreeItem[]> {
    const analysisRootResult = await this.getAnalysisRootUri();

    if (!analysisRootResult.uri) {
      if (element) {
        return [];
      }

      return [new AnalysisTreeItem(analysisRootResult.message, "info", vscode.TreeItemCollapsibleState.None)];
    }

    if (element) {
      if (element.kind !== "directory" || !element.uri) {
        return [];
      }

      return this.readDirectoryItems(element.uri);
    }

    return this.readDirectoryItems(analysisRootResult.uri);
  }

  public async getAnalysisRootUri(): Promise<{ uri?: vscode.Uri; message: string }> {
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
    const analysisRootUri = vscode.Uri.joinPath(projectRootUri, "Analysis");

    try {
      const stat = await vscode.workspace.fs.stat(analysisRootUri);
      if ((stat.type & vscode.FileType.Directory) === 0) {
        return {
          message: 'Analysis path is invalid. Reinitialize project to recreate "Analysis".'
        };
      }
    } catch {
      return {
        message: 'Missing "Analysis" directory. Run "ResearchFlow: Reinitialize Project".'
      };
    }

    return { uri: analysisRootUri, message: "" };
  }

  private async readDirectoryItems(directoryUri: vscode.Uri): Promise<AnalysisTreeItem[]> {
    const entries = await vscode.workspace.fs.readDirectory(directoryUri);
    const sortedEntries = entries
      .filter(([, type]) => (type & vscode.FileType.Directory) !== 0 || (type & vscode.FileType.File) !== 0)
      .sort((left, right) => {
        const [, leftType] = left;
        const [, rightType] = right;
        const leftIsDirectory = (leftType & vscode.FileType.Directory) !== 0;
        const rightIsDirectory = (rightType & vscode.FileType.Directory) !== 0;

        if (leftIsDirectory !== rightIsDirectory) {
          return leftIsDirectory ? -1 : 1;
        }

        return left[0].localeCompare(right[0], undefined, { sensitivity: "base" });
      });

    return sortedEntries.map(([name, type]) => {
      const childUri = vscode.Uri.joinPath(directoryUri, name);
      if ((type & vscode.FileType.Directory) !== 0) {
        return new AnalysisTreeItem(name, "directory", vscode.TreeItemCollapsibleState.Collapsed, childUri);
      }

      const item = new AnalysisTreeItem(name, "file", vscode.TreeItemCollapsibleState.None, childUri);
      item.description = path.extname(name);
      return item;
    });
  }
}
