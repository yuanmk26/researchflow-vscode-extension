import * as vscode from "vscode";

class ProjectTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: ProjectTreeItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<ProjectTreeItem | undefined | void> =
    new vscode.EventEmitter<ProjectTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<ProjectTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: ProjectTreeItem): Thenable<ProjectTreeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.buildRootItems());
  }

  private buildRootItems(): ProjectTreeItem[] {
    const activeProject = new ProjectTreeItem("Active Project", vscode.TreeItemCollapsibleState.Expanded, [
      new ProjectTreeItem("Demo Project", vscode.TreeItemCollapsibleState.None)
    ]);

    const papers = new ProjectTreeItem("Papers", vscode.TreeItemCollapsibleState.Collapsed, [
      new ProjectTreeItem("paper-001.pdf", vscode.TreeItemCollapsibleState.None),
      new ProjectTreeItem("paper-002.pdf", vscode.TreeItemCollapsibleState.None)
    ]);

    const figures = new ProjectTreeItem("Figures", vscode.TreeItemCollapsibleState.Collapsed, [
      new ProjectTreeItem("figure-001.png", vscode.TreeItemCollapsibleState.None),
      new ProjectTreeItem("figure-002.png", vscode.TreeItemCollapsibleState.None)
    ]);

    return [activeProject, papers, figures];
  }
}