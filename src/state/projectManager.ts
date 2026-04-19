import * as vscode from "vscode";

import { Project } from "../types";

export type ProjectDirectorySource = "project" | "workspace" | "none";
export const REQUIRED_PROJECT_DIRECTORIES = ["References", "Analysis", "Figures", "Tables", "Data", "Writing"] as const;

export interface ProjectDirectoryInfo {
  initialized: boolean;
  path?: string;
  projectName?: string;
  source: ProjectDirectorySource;
  workspaceFolder?: vscode.WorkspaceFolder;
}

export class ProjectManager {
  public getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  public getProjectConfigPath(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(workspaceFolder.uri, ".researchflow", "project.json");
  }

  public async projectExists(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const configPath = this.getProjectConfigPath(workspaceFolder);

    try {
      await vscode.workspace.fs.stat(configPath);
      return true;
    } catch {
      return false;
    }
  }

  public async loadProject(workspaceFolder: vscode.WorkspaceFolder): Promise<Project | undefined> {
    const configPath = this.getProjectConfigPath(workspaceFolder);

    try {
      const raw = await vscode.workspace.fs.readFile(configPath);
      const decoded = new TextDecoder("utf-8").decode(raw);
      const parsed = JSON.parse(decoded) as Project;

      // TODO: Add schema validation for project config before returning.
      return parsed;
    } catch {
      // TODO: Add richer error-state handling and telemetry.
      return undefined;
    }
  }

  public async hasRequiredProjectDirectories(rootUri: vscode.Uri): Promise<boolean> {
    for (const directoryName of REQUIRED_PROJECT_DIRECTORIES) {
      const directoryUri = vscode.Uri.joinPath(rootUri, directoryName);

      try {
        const stat = await vscode.workspace.fs.stat(directoryUri);
        if ((stat.type & vscode.FileType.Directory) === 0) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  public async isProjectInitialized(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const exists = await this.projectExists(workspaceFolder);
    if (!exists) {
      return false;
    }

    const project = await this.loadProject(workspaceFolder);
    if (!project) {
      return false;
    }

    const rootPath = project.rootPath?.trim();
    const rootUri = rootPath ? vscode.Uri.file(rootPath) : workspaceFolder.uri;
    return this.hasRequiredProjectDirectories(rootUri);
  }

  public async getProjectDirectoryInfo(): Promise<ProjectDirectoryInfo> {
    const workspaceFolder = this.getWorkspaceFolder();

    if (!workspaceFolder) {
      return { initialized: false, source: "none" };
    }

    const project = await this.loadProject(workspaceFolder);
    if (project) {
      const rootPath = project.rootPath?.trim();
      const rootUri = rootPath ? vscode.Uri.file(rootPath) : workspaceFolder.uri;
      const initialized = await this.hasRequiredProjectDirectories(rootUri);
      if (initialized) {
        return {
          initialized: true,
          path: rootUri.fsPath,
          projectName: project.name,
          source: "project",
          workspaceFolder
        };
      }
    }

    return {
      initialized: false,
      path: workspaceFolder.uri.fsPath,
      source: "workspace",
      workspaceFolder
    };
  }
}
