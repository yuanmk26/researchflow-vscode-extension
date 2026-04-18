import * as vscode from "vscode";

import { Project } from "../types";

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
}