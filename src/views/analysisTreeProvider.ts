import * as vscode from "vscode";

class AnalysisTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: AnalysisTreeItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

export class AnalysisTreeProvider implements vscode.TreeDataProvider<AnalysisTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<AnalysisTreeItem | undefined | void> =
    new vscode.EventEmitter<AnalysisTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<AnalysisTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: AnalysisTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: AnalysisTreeItem): Thenable<AnalysisTreeItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.buildRootItems());
  }

  private buildRootItems(): AnalysisTreeItem[] {
    return [
      new AnalysisTreeItem("No analysis items yet", vscode.TreeItemCollapsibleState.None),
      new AnalysisTreeItem("Analysis view will show generated analysis outputs", vscode.TreeItemCollapsibleState.None)
    ];
  }
}
