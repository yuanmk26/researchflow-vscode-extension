import * as vscode from "vscode";

class ReferencesTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: ReferencesTreeItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

export class ReferencesTreeProvider implements vscode.TreeDataProvider<ReferencesTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<ReferencesTreeItem | undefined | void> =
    new vscode.EventEmitter<ReferencesTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<ReferencesTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ReferencesTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: ReferencesTreeItem): Thenable<ReferencesTreeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.buildRootItems());
  }

  private buildRootItems(): ReferencesTreeItem[] {
    return [
      new ReferencesTreeItem("No references yet", vscode.TreeItemCollapsibleState.None),
      new ReferencesTreeItem('Run "Recommend Citations" to get started', vscode.TreeItemCollapsibleState.None)
    ];
  }
}
