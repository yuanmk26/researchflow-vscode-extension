import * as path from "path";
import * as vscode from "vscode";

import { ProjectManager } from "../state/projectManager";

export const WRITING_MANIFEST_FILENAME = ".researchflow-writing.json";

export interface WritingManifest {
  name: string;
  type: string;
  template: string | null;
  agentReferenceDocs: string[];
  createdAt: string;
  updatedAt: string;
}

export type WritingTreeItemKind = "object" | "file" | "folder" | "config" | "info";

export class WritingTreeItem extends vscode.TreeItem {
  public readonly kind: WritingTreeItemKind;
  public readonly uri?: vscode.Uri;
  public readonly objectUri?: vscode.Uri;
  public readonly manifest?: WritingManifest;

  public constructor(
    label: string,
    kind: WritingTreeItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri?: vscode.Uri,
    objectUri?: vscode.Uri,
    manifest?: WritingManifest
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.uri = uri;
    this.objectUri = objectUri;
    this.manifest = manifest;
    this.contextValue =
      kind === "object"
        ? "writingObject"
        : kind === "file"
          ? "writingFile"
          : kind === "folder"
            ? "writingFolder"
            : kind === "config"
              ? "writingConfig"
              : "writingInfo";

    if (kind === "object" && uri) {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("book");
      this.description = manifest?.type ?? "unknown";
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

    if (kind === "folder" && uri) {
      this.id = uri.toString();
      this.resourceUri = uri;
      this.iconPath = new vscode.ThemeIcon("folder");
    }

    if (kind === "config") {
      this.id = `${objectUri?.toString() ?? ""}::${label}`;
      this.iconPath = new vscode.ThemeIcon("settings");
    }
  }
}

export class WritingTreeProvider implements vscode.TreeDataProvider<WritingTreeItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<WritingTreeItem | undefined | void> =
    new vscode.EventEmitter<WritingTreeItem | undefined | void>();

  public readonly onDidChangeTreeData: vscode.Event<WritingTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  public constructor(private readonly projectManager: ProjectManager) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: WritingTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: WritingTreeItem): Promise<WritingTreeItem[]> {
    if (element?.kind === "object" && element.uri) {
      return this.buildObjectChildren(element.uri, element.manifest);
    }

    if (element) {
      return [];
    }

    return this.buildRootItems();
  }

  public async getWritingRootUri(): Promise<{ uri?: vscode.Uri; message: string }> {
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

    const writingRootUri = vscode.Uri.joinPath(vscode.Uri.file(directoryInfo.path), "Writing");

    try {
      const stat = await vscode.workspace.fs.stat(writingRootUri);
      if ((stat.type & vscode.FileType.Directory) === 0) {
        return {
          message: 'Writing path is invalid. Reinitialize project to recreate "Writing".'
        };
      }
    } catch {
      return {
        message: 'Missing "Writing" directory. Run "ResearchFlow: Reinitialize Project".'
      };
    }

    return { uri: writingRootUri, message: "" };
  }

  private async buildRootItems(): Promise<WritingTreeItem[]> {
    const writingRootResult = await this.getWritingRootUri();
    if (!writingRootResult.uri) {
      return [new WritingTreeItem(writingRootResult.message, "info", vscode.TreeItemCollapsibleState.None)];
    }

    const entries = await vscode.workspace.fs.readDirectory(writingRootResult.uri);
    const items = await Promise.all(
      entries
        .filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map(async (name) => {
          const objectUri = vscode.Uri.joinPath(writingRootResult.uri as vscode.Uri, name);
          const manifest = await this.readManifest(objectUri);
          return new WritingTreeItem(name, "object", vscode.TreeItemCollapsibleState.Collapsed, objectUri, objectUri, manifest);
        })
    );

    if (items.length === 0) {
      return [new WritingTreeItem("No writing objects found in Writing/", "info", vscode.TreeItemCollapsibleState.None)];
    }

    return items;
  }

  private async buildObjectChildren(objectUri: vscode.Uri, manifest?: WritingManifest): Promise<WritingTreeItem[]> {
    const children: WritingTreeItem[] = [];
    const mainTexUri = vscode.Uri.joinPath(objectUri, "main.tex");
    const figuresUri = vscode.Uri.joinPath(objectUri, "figures");

    children.push(new WritingTreeItem("main.tex", "file", vscode.TreeItemCollapsibleState.None, mainTexUri, objectUri));
    children.push(new WritingTreeItem("figures", "folder", vscode.TreeItemCollapsibleState.None, figuresUri, objectUri));

    const effectiveManifest = manifest ?? (await this.readManifest(objectUri));
    if (effectiveManifest?.template) {
      children.push(
        new WritingTreeItem(`Template: ${path.basename(effectiveManifest.template)}`, "config", vscode.TreeItemCollapsibleState.None, undefined, objectUri)
      );
    } else {
      children.push(new WritingTreeItem("Template: not set", "config", vscode.TreeItemCollapsibleState.None, undefined, objectUri));
    }

    const referenceCount = effectiveManifest?.agentReferenceDocs.length ?? 0;
    children.push(
      new WritingTreeItem(
        `Agent reference docs: ${referenceCount}`,
        "config",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        objectUri
      )
    );

    return children;
  }

  private async readManifest(objectUri: vscode.Uri): Promise<WritingManifest | undefined> {
    const manifestUri = vscode.Uri.joinPath(objectUri, WRITING_MANIFEST_FILENAME);

    try {
      const raw = await vscode.workspace.fs.readFile(manifestUri);
      const decoded = new TextDecoder("utf-8").decode(raw);
      const parsed = JSON.parse(decoded) as Partial<WritingManifest>;
      return {
        name: typeof parsed.name === "string" ? parsed.name : path.basename(objectUri.fsPath),
        type: typeof parsed.type === "string" ? parsed.type : "unknown",
        template: typeof parsed.template === "string" ? parsed.template : null,
        agentReferenceDocs: Array.isArray(parsed.agentReferenceDocs)
          ? parsed.agentReferenceDocs.filter((value): value is string => typeof value === "string")
          : [],
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
      };
    } catch {
      return undefined;
    }
  }
}
