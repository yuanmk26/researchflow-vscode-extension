import * as vscode from "vscode";
import * as path from "path";

import { ProjectDirectoryInfo, ProjectManager } from "../state/projectManager";

class ProjectTreeItem extends vscode.TreeItem {
  public readonly children: ProjectTreeItem[];

  public constructor(options: {
    children?: ProjectTreeItem[];
    collapsibleState: vscode.TreeItemCollapsibleState;
    command?: vscode.Command;
    contextValue?: string;
    description?: string;
    id?: string;
    label: string;
    tooltip?: string;
  }) {
    super(options.label, options.collapsibleState);
    this.children = options.children ?? [];
    this.command = options.command;
    this.contextValue = options.contextValue;
    this.description = options.description;
    this.id = options.id;
    this.tooltip = options.tooltip;
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<ProjectTreeItem | undefined | void> =
    new vscode.EventEmitter<ProjectTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<ProjectTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public constructor(private readonly projectManager: ProjectManager) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (element) {
      return element.children;
    }

    return this.buildRootItems();
  }

  private async buildRootItems(): Promise<ProjectTreeItem[]> {
    const directoryInfo = await this.projectManager.getProjectDirectoryInfo();
    const activeProject = this.buildActiveProjectItem(directoryInfo);

    return [activeProject];
  }

  private buildActiveProjectItem(directoryInfo: ProjectDirectoryInfo): ProjectTreeItem {
    if (!directoryInfo.path) {
      return new ProjectTreeItem({
        children: [
          new ProjectTreeItem({
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            description: "No workspace folder",
            label: "Project Name",
            tooltip: "Open a folder first"
          }),
          new ProjectTreeItem({
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: { command: "researchflow.openProjectDirectory", title: "Open Project Directory" },
            description: "No workspace folder",
            label: "Current Directory",
            tooltip: "Click to choose and open a folder"
          })
        ],
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        contextValue: "activeProjectUnavailable",
        id: "researchflow.activeProject",
        label: "Active Project"
      });
    }

    const pathSourceLabel = directoryInfo.initialized ? "Project config" : "Workspace (uninitialized)";
    const projectNameFromConfig = directoryInfo.projectName?.trim();
    const projectNameFromPath = path.basename(directoryInfo.path);
    const projectName = projectNameFromConfig || projectNameFromPath;

    return new ProjectTreeItem({
      children: [
        new ProjectTreeItem({
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          contextValue: directoryInfo.initialized ? "projectNameInitialized" : "projectNameUninitialized",
          description: projectName,
          label: "Project Name",
          tooltip: directoryInfo.initialized
            ? "Use the action button on the right to rename the project"
            : "Use the action button on the right to initialize the project"
        }),
        new ProjectTreeItem({
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          command: { command: "researchflow.openProjectDirectory", title: "Open Project Directory" },
          description: directoryInfo.path,
          label: "Current Directory",
          tooltip: `Click to open in file explorer (${pathSourceLabel}: ${directoryInfo.path})`
        })
      ],
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: directoryInfo.initialized ? "activeProject" : "activeProjectUninitialized",
      description: pathSourceLabel,
      id: "researchflow.activeProject",
      label: "Active Project",
      tooltip: directoryInfo.path
    });
  }
}
