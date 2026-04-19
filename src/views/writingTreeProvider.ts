import * as vscode from "vscode";

class WritingTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: WritingTreeItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

export class WritingTreeProvider implements vscode.TreeDataProvider<WritingTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<WritingTreeItem | undefined | void> =
    new vscode.EventEmitter<WritingTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<WritingTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: WritingTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: WritingTreeItem): Thenable<WritingTreeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.buildRootItems());
  }

  private buildRootItems(): WritingTreeItem[] {
    return [
      new WritingTreeItem("No writing items yet", vscode.TreeItemCollapsibleState.None),
      new WritingTreeItem("Writing view will show drafted writing artifacts", vscode.TreeItemCollapsibleState.None)
    ];
  }
}
