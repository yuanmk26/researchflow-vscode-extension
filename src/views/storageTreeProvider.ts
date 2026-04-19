import * as vscode from "vscode";

class StorageTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: StorageTreeItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

export class StorageTreeProvider implements vscode.TreeDataProvider<StorageTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<StorageTreeItem | undefined | void> =
    new vscode.EventEmitter<StorageTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<StorageTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: StorageTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: StorageTreeItem): Thenable<StorageTreeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.buildRootItems());
  }

  private buildRootItems(): StorageTreeItem[] {
    return [
      new StorageTreeItem("No storage records yet", vscode.TreeItemCollapsibleState.None),
      new StorageTreeItem("Storage view will list persisted research assets", vscode.TreeItemCollapsibleState.None)
    ];
  }
}
