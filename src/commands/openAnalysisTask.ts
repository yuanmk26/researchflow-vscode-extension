import * as vscode from "vscode";

import { AnalysisTreeItem } from "../views/analysisTreeProvider";

const ANALYSIS_LAST_ACTIVE_KEY = "researchflow.analysis.lastActiveByTaskGroup.v1";
type AnalysisTaskGroup = "scripts" | "figures" | "tables";

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
  await vscode.commands.executeCommand("vscode.setEditorLayout", {
    groups: [{}, { groups: [{}, {}], orientation: 1 }],
    orientation: 0
  });
}

async function clearEditorsInColumn(viewColumn: vscode.ViewColumn): Promise<void> {
  const tabGroup = vscode.window.tabGroups.all.find((group) => group.viewColumn === viewColumn);
  if (!tabGroup || tabGroup.tabs.length === 0) {
    return;
  }

  await vscode.window.tabGroups.close([...tabGroup.tabs], true);
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

function buildMemoryEntryKey(taskUri: vscode.Uri, group: AnalysisTaskGroup): string {
  return `${taskUri.toString()}::${group}`;
}

function getLastActiveMap(workspaceState: vscode.Memento): Record<string, string> {
  return workspaceState.get<Record<string, string>>(ANALYSIS_LAST_ACTIVE_KEY, {});
}

async function setLastActiveUri(
  workspaceState: vscode.Memento,
  taskUri: vscode.Uri,
  group: AnalysisTaskGroup,
  fileUri: vscode.Uri
): Promise<void> {
  const map = getLastActiveMap(workspaceState);
  map[buildMemoryEntryKey(taskUri, group)] = fileUri.toString();
  await workspaceState.update(ANALYSIS_LAST_ACTIVE_KEY, map);
}

function getRememberedUri(
  workspaceState: vscode.Memento,
  taskUri: vscode.Uri,
  group: AnalysisTaskGroup,
  files: vscode.Uri[]
): vscode.Uri | undefined {
  const map = getLastActiveMap(workspaceState);
  const remembered = map[buildMemoryEntryKey(taskUri, group)];
  if (!remembered) {
    return undefined;
  }

  return files.find((file) => file.toString() === remembered);
}

function getPrimaryScriptUri(files: vscode.Uri[]): vscode.Uri | undefined {
  const primary = files.find((file) => /^(main|index)\./i.test(file.path.split("/").pop() ?? ""));
  return primary ?? files[0];
}

function rotatePreferredFirst(files: vscode.Uri[], preferred?: vscode.Uri): vscode.Uri[] {
  if (!preferred) {
    return files;
  }

  const index = files.findIndex((file) => file.toString() === preferred.toString());
  if (index <= 0) {
    return files;
  }

  return [files[index], ...files.slice(0, index), ...files.slice(index + 1)];
}

function resolveTaskContextFromUri(
  uri: vscode.Uri
): { taskUri: vscode.Uri; group: AnalysisTaskGroup; fileUri: vscode.Uri } | undefined {
  const segments = uri.path.split("/").filter(Boolean);
  const analysisIndex = segments.findIndex((segment) => segment.toLowerCase() === "analysis");
  if (analysisIndex < 0 || analysisIndex + 2 >= segments.length) {
    return undefined;
  }

  const groupSegment = segments[analysisIndex + 2]?.toLowerCase();
  if (groupSegment !== "scripts" && groupSegment !== "figures" && groupSegment !== "tables") {
    return undefined;
  }

  const taskPath = `/${segments.slice(0, analysisIndex + 2).join("/")}`;
  const taskUri = uri.with({ fragment: "", path: taskPath, query: "" });

  return { fileUri: uri, group: groupSegment, taskUri };
}

function getUriFromTab(tab: vscode.Tab | undefined): vscode.Uri | undefined {
  if (!tab) {
    return undefined;
  }

  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  if (input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputNotebookDiff) {
    return input.modified;
  }
  if (input instanceof vscode.TabInputCustom) {
    return input.uri;
  }

  return undefined;
}

export function registerAnalysisTaskLastActiveTracking(workspaceState: vscode.Memento): vscode.Disposable {
  const updateFromUri = (uri: vscode.Uri | undefined): void => {
    if (!uri) {
      return;
    }

    const context = resolveTaskContextFromUri(uri);
    if (!context) {
      return;
    }

    void setLastActiveUri(workspaceState, context.taskUri, context.group, context.fileUri);
  };

  const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    updateFromUri(editor?.document.uri);
  });
  const tabsDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
    for (const group of vscode.window.tabGroups.all) {
      updateFromUri(getUriFromTab(group.activeTab));
    }
  });

  return new vscode.Disposable(() => {
    editorDisposable.dispose();
    tabsDisposable.dispose();
  });
}

export function createOpenAnalysisTaskCommand(
  workspaceState: vscode.Memento,
  globalStorageUri: vscode.Uri
): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  const openPlaceholderInGroup = async (
    group: AnalysisTaskGroup,
    viewColumn: vscode.ViewColumn,
    taskName: string
  ): Promise<void> => {
    const placeholdersRoot = vscode.Uri.joinPath(globalStorageUri, "analysis-placeholders");
    await vscode.workspace.fs.createDirectory(placeholdersRoot);
    const placeholderUri = vscode.Uri.joinPath(placeholdersRoot, `${group}.md`);
    const title = group === "scripts" ? "Scripts" : group === "figures" ? "Figures" : "Tables";
    const content = `# ${title}\n\nNo ${group} files found for experiment \`${taskName}\`.\n`;
    await vscode.workspace.fs.writeFile(placeholderUri, new TextEncoder().encode(content));
    await vscode.window.showTextDocument(placeholderUri, {
      preview: false,
      preserveFocus: false,
      viewColumn
    });
  };

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
    const preferredScript = getRememberedUri(workspaceState, taskUri, "scripts", taskFiles.scripts) ?? getPrimaryScriptUri(taskFiles.scripts);
    const preferredFigure = getRememberedUri(workspaceState, taskUri, "figures", taskFiles.figures) ?? taskFiles.figures[0];
    const preferredTable = getRememberedUri(workspaceState, taskUri, "tables", taskFiles.tables) ?? taskFiles.tables[0];

    await forceThreeGroupLayout();
    await clearEditorsInColumn(vscode.ViewColumn.One);
    await clearEditorsInColumn(vscode.ViewColumn.Two);
    await clearEditorsInColumn(vscode.ViewColumn.Three);

    const taskName = taskUri.path.split("/").pop() ?? "unknown-task";
    const scriptsToOpen = rotatePreferredFirst(taskFiles.scripts, preferredScript);
    const figuresToOpen = rotatePreferredFirst(taskFiles.figures, preferredFigure);
    const tablesToOpen = rotatePreferredFirst(taskFiles.tables, preferredTable);

    if (scriptsToOpen.length > 0) {
      await openFilesInTextGroup(scriptsToOpen, vscode.ViewColumn.One);
    } else {
      await openPlaceholderInGroup("scripts", vscode.ViewColumn.One, taskName);
    }

    if (figuresToOpen.length > 0) {
      await openFilesInGenericGroup(figuresToOpen, vscode.ViewColumn.Two);
    } else {
      await openPlaceholderInGroup("figures", vscode.ViewColumn.Two, taskName);
    }

    if (tablesToOpen.length > 0) {
      await openFilesInGenericGroup(tablesToOpen, vscode.ViewColumn.Three);
    } else {
      await openPlaceholderInGroup("tables", vscode.ViewColumn.Three, taskName);
    }

    if (preferredScript) {
      await setLastActiveUri(workspaceState, taskUri, "scripts", preferredScript);
    }
    if (preferredFigure) {
      await setLastActiveUri(workspaceState, taskUri, "figures", preferredFigure);
    }
    if (preferredTable) {
      await setLastActiveUri(workspaceState, taskUri, "tables", preferredTable);
    }

    if (taskFiles.scripts.length === 0 && taskFiles.figures.length === 0 && taskFiles.tables.length === 0) {
      void vscode.window.showInformationMessage(
        `No files found in scripts/, figures/, or tables/ for task "${taskUri.path.split("/").pop() ?? ""}".`
      );
    }
  };
}
