import * as vscode from "vscode";

import { AnalysisTreeItem } from "../views/analysisTreeProvider";

const ANALYSIS_LAST_ACTIVE_KEY = "researchflow.analysis.lastActiveByTaskGroup.v1";
type AnalysisTaskGroup = "scripts" | "figures" | "tables";

interface AnalysisTaskFiles {
  figures: vscode.Uri[];
  scripts: vscode.Uri[];
  tables: vscode.Uri[];
}
type AnalysisEditorSlot = "first" | "second" | "third";

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
    groups: [{}, { groups: [{}, {}] }],
    orientation: 0
  });
}

async function logEditorLayoutShape(): Promise<void> {
  try {
    const layout = (await vscode.commands.executeCommand("vscode.getEditorLayout")) as
      | { groups?: unknown[]; orientation?: number }
      | undefined;
    const groups = Array.isArray(layout?.groups) ? layout.groups : [];
    const rightGroup = groups[1] as { groups?: unknown[] } | undefined;
    const rightChildren = Array.isArray(rightGroup?.groups) ? rightGroup.groups : [];
    const isExpectedShape = layout?.orientation === 0 && groups.length === 2 && rightChildren.length === 2;

    console.debug("[ResearchFlow][AnalysisLayout]", {
      isExpectedShape,
      layout
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.debug("[ResearchFlow][AnalysisLayout] Failed to inspect layout", message);
  }
}

async function focusEditorSlot(slot: AnalysisEditorSlot): Promise<void> {
  const command =
    slot === "first"
      ? "workbench.action.focusFirstEditorGroup"
      : slot === "second"
        ? "workbench.action.focusSecondEditorGroup"
        : "workbench.action.focusThirdEditorGroup";
  await vscode.commands.executeCommand(command);
}

async function clearEditorsInSlot(slot: AnalysisEditorSlot): Promise<void> {
  await focusEditorSlot(slot);
  const tabGroup = vscode.window.tabGroups.activeTabGroup;
  if (!tabGroup || tabGroup.tabs.length === 0) {
    return;
  }

  await vscode.window.tabGroups.close([...tabGroup.tabs], true);
}

async function openFilesInTextGroup(files: vscode.Uri[], slot: AnalysisEditorSlot): Promise<void> {
  await focusEditorSlot(slot);
  for (let index = 0; index < files.length; index += 1) {
    await vscode.window.showTextDocument(files[index], {
      preview: false,
      preserveFocus: index !== 0,
      viewColumn: vscode.ViewColumn.Active
    });
  }
}

async function openFilesInGenericGroup(files: vscode.Uri[], slot: AnalysisEditorSlot): Promise<void> {
  await focusEditorSlot(slot);
  for (let index = 0; index < files.length; index += 1) {
    await vscode.commands.executeCommand("vscode.open", files[index], {
      preview: false,
      preserveFocus: index !== 0,
      viewColumn: vscode.ViewColumn.Active
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
    slot: AnalysisEditorSlot,
    taskName: string
  ): Promise<void> => {
    const placeholdersRoot = vscode.Uri.joinPath(globalStorageUri, "analysis-placeholders");
    await vscode.workspace.fs.createDirectory(placeholdersRoot);
    const placeholderUri = vscode.Uri.joinPath(placeholdersRoot, `${group}.md`);
    const title = group === "scripts" ? "Scripts" : group === "figures" ? "Figures" : "Tables";
    const content = `# ${title}\n\nNo ${group} files found for experiment \`${taskName}\`.\n`;
    await vscode.workspace.fs.writeFile(placeholderUri, new TextEncoder().encode(content));
    await focusEditorSlot(slot);
    await vscode.window.showTextDocument(placeholderUri, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
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
    await logEditorLayoutShape();
    await clearEditorsInSlot("first");
    await clearEditorsInSlot("second");
    await clearEditorsInSlot("third");
    await forceThreeGroupLayout();
    await logEditorLayoutShape();

    const taskName = taskUri.path.split("/").pop() ?? "unknown-task";
    const scriptsToOpen = rotatePreferredFirst(taskFiles.scripts, preferredScript);
    const figuresToOpen = rotatePreferredFirst(taskFiles.figures, preferredFigure);
    const tablesToOpen = rotatePreferredFirst(taskFiles.tables, preferredTable);

    if (scriptsToOpen.length > 0) {
      await openFilesInTextGroup(scriptsToOpen, "first");
    } else {
      await openPlaceholderInGroup("scripts", "first", taskName);
    }

    if (figuresToOpen.length > 0) {
      await openFilesInGenericGroup(figuresToOpen, "second");
    } else {
      await openPlaceholderInGroup("figures", "second", taskName);
    }

    if (tablesToOpen.length > 0) {
      await openFilesInGenericGroup(tablesToOpen, "third");
    } else {
      await openPlaceholderInGroup("tables", "third", taskName);
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
