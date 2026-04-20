import * as vscode from "vscode";

import { ProjectManager } from "../state/projectManager";

export type AnalysisTreeItemKind = "task" | "info" | "action";

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
      kind === "task" ? "analysisTask" : kind === "action" ? "analysisNewExperimentAction" : "analysisInfo";

    if (kind === "task" && uri) {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("beaker");
      this.command = {
        command: "researchflow.analysis.openTask",
        title: "Open Analysis Task",
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
            vscode.TreeItemCollapsibleState.None,
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
