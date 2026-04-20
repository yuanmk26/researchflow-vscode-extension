import * as vscode from "vscode";
import * as path from "path";

import { ProjectManager } from "../state/projectManager";

export type AnalysisTreeItemKind = "task" | "info" | "action" | "group" | "file";
type AnalysisGroupName = "scripts" | "figures" | "tables";

export class AnalysisTreeItem extends vscode.TreeItem {
  public readonly kind: AnalysisTreeItemKind;
  public readonly uri?: vscode.Uri;
  public readonly taskUri?: vscode.Uri;
  public readonly groupName?: AnalysisGroupName;

  public constructor(
    label: string,
    kind: AnalysisTreeItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri?: vscode.Uri,
    taskUri?: vscode.Uri,
    groupName?: AnalysisGroupName
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.uri = uri;
    this.taskUri = taskUri;
    this.groupName = groupName;
    this.contextValue =
      kind === "task"
        ? "analysisTask"
        : kind === "action"
          ? "analysisNewExperimentAction"
          : kind === "file"
            ? "analysisStoredFile"
            : kind === "group"
              ? groupName === "scripts"
                ? "analysisScriptsGroup"
                : groupName === "figures"
                  ? "analysisFiguresGroup"
                  : "analysisTablesGroup"
              : "analysisInfo";

    if (kind === "task" && uri) {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("beaker");
    }

    if (kind === "group" && uri && groupName) {
      this.id = `${taskUri?.toString() ?? ""}::${groupName}`;
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("folder");
      this.description = groupName;
    }

    if (kind === "file" && uri) {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("file");
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri]
      };
    }

    if (kind === "action") {
      this.iconPath = new vscode.ThemeIcon("add");
      this.command = {
        command: "researchflow.analysis.newExperiment",
        title: "New Experiment"
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
    if (element?.kind === "task" && element.uri) {
      return this.buildTaskGroupItems(element.uri);
    }

    if (element?.kind === "group" && element.uri && element.taskUri && element.groupName) {
      return this.buildGroupFileItems(element.taskUri, element.groupName, element.uri);
    }

    if (element) {
      return [];
    }

    const actionItem = new AnalysisTreeItem("New Experiment...", "action", vscode.TreeItemCollapsibleState.None);
    const analysisRootResult = await this.getAnalysisRootUri();
    if (!analysisRootResult.uri) {
      return [actionItem, new AnalysisTreeItem(analysisRootResult.message, "info", vscode.TreeItemCollapsibleState.None)];
    }

    const entries = await vscode.workspace.fs.readDirectory(analysisRootResult.uri);
    const tasks = entries
      .filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(
        (name) =>
          new AnalysisTreeItem(
            name,
            "task",
            vscode.TreeItemCollapsibleState.Collapsed,
            vscode.Uri.joinPath(analysisRootResult.uri as vscode.Uri, name)
          )
      );

    if (tasks.length === 0) {
      return [
        actionItem,
        new AnalysisTreeItem("No analysis tasks found in Analysis/", "info", vscode.TreeItemCollapsibleState.None)
      ];
    }

    return [actionItem, ...tasks];
  }

  private buildTaskGroupItems(taskUri: vscode.Uri): AnalysisTreeItem[] {
    const groups: AnalysisGroupName[] = ["scripts", "figures", "tables"];
    return groups.map((groupName) => {
      const groupUri = vscode.Uri.joinPath(taskUri, groupName);
      return new AnalysisTreeItem(groupName, "group", vscode.TreeItemCollapsibleState.Collapsed, groupUri, taskUri, groupName);
    });
  }

  private async buildGroupFileItems(
    taskUri: vscode.Uri,
    groupName: AnalysisGroupName,
    groupUri: vscode.Uri
  ): Promise<AnalysisTreeItem[]> {
    const files = await this.readFilesRecursively(groupUri);
    if (files.length === 0) {
      return [new AnalysisTreeItem(`No files in ${groupName}`, "info", vscode.TreeItemCollapsibleState.None)];
    }

    return files.map((fileUri) => {
      const relativePath = path.relative(groupUri.fsPath, fileUri.fsPath).replace(/\\/g, "/");
      return new AnalysisTreeItem(relativePath, "file", vscode.TreeItemCollapsibleState.None, fileUri, taskUri, groupName);
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
}
