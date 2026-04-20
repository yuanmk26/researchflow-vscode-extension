import * as vscode from "vscode";

import { AnalysisTreeItem } from "../views/analysisTreeProvider";

interface AnalysisTaskFiles {
  figures: vscode.Uri[];
  scripts: vscode.Uri[];
  tables: vscode.Uri[];
}

async function readFilesRecursively(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];

  async function walk(current: vscode.Uri): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(current);
    const sorted = entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
    for (const [name, type] of sorted) {
      const uri = vscode.Uri.joinPath(current, name);
      if ((type & vscode.FileType.Directory) !== 0) {
        await walk(uri);
      } else if ((type & vscode.FileType.File) !== 0) {
        files.push(uri);
      }
    }
  }

  try {
    await walk(folderUri);
  } catch {
    return [];
  }

  return files;
}

async function collectTaskFiles(taskUri: vscode.Uri): Promise<AnalysisTaskFiles> {
  const scriptsUri = vscode.Uri.joinPath(taskUri, "scripts");
  const figuresUri = vscode.Uri.joinPath(taskUri, "figures");
  const tablesUri = vscode.Uri.joinPath(taskUri, "tables");

  const [scripts, figures, tables] = await Promise.all([
    readFilesRecursively(scriptsUri),
    readFilesRecursively(figuresUri),
    readFilesRecursively(tablesUri)
  ]);

  return { figures, scripts, tables };
}

async function forceThreeGroupLayout(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.editorLayoutTwoColumns");
  await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
  await vscode.commands.executeCommand("workbench.action.splitEditorDown");
}

async function openFilesInTextGroup(files: vscode.Uri[], viewColumn: vscode.ViewColumn): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    await vscode.window.showTextDocument(files[index], {
      preview: false,
      preserveFocus: index !== 0,
      viewColumn
    });
  }
}

async function openFilesInGenericGroup(files: vscode.Uri[], viewColumn: vscode.ViewColumn): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    await vscode.commands.executeCommand("vscode.open", files[index], {
      preview: false,
      preserveFocus: index !== 0,
      viewColumn
    });
  }
}

export function createOpenAnalysisTaskCommand(): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | AnalysisTreeItem): Promise<void> => {
    const taskUri = target instanceof vscode.Uri ? target : target?.kind === "task" ? target.uri : undefined;
    if (!taskUri) {
      void vscode.window.showWarningMessage("No analysis task selected.");
      return;
    }

    try {
      const stat = await vscode.workspace.fs.stat(taskUri);
      if ((stat.type & vscode.FileType.Directory) === 0) {
        void vscode.window.showWarningMessage("Selected analysis task is not a directory.");
        return;
      }
    } catch {
      void vscode.window.showWarningMessage("Selected analysis task does not exist.");
      return;
    }

    const taskFiles = await collectTaskFiles(taskUri);

    await forceThreeGroupLayout();
    await openFilesInTextGroup(taskFiles.scripts, vscode.ViewColumn.One);
    await openFilesInGenericGroup(taskFiles.figures, vscode.ViewColumn.Two);
    await openFilesInGenericGroup(taskFiles.tables, vscode.ViewColumn.Three);

    if (taskFiles.scripts.length === 0 && taskFiles.figures.length === 0 && taskFiles.tables.length === 0) {
      void vscode.window.showInformationMessage(
        `No files found in scripts/, figures/, or tables/ for task "${taskUri.path.split("/").pop() ?? ""}".`
      );
    }
  };
}
