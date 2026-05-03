import * as path from "path";
import * as vscode from "vscode";

import { AnalysisTreeItem, AnalysisTreeProvider } from "../views/analysisTreeProvider";

const INVALID_SEGMENT_CHARS = /[<>:"|?*\x00-\x1F]/;
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/;

function normalizeRelativePath(input: string): { normalizedPath?: string; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Script path cannot be empty." };
  }

  const normalizedSlashes = trimmed.replace(/\\/g, "/");
  if (normalizedSlashes.startsWith("/") || normalizedSlashes.startsWith("//")) {
    return { error: "Absolute paths are not allowed." };
  }

  if (WINDOWS_DRIVE_PATTERN.test(normalizedSlashes)) {
    return { error: "Drive paths are not allowed." };
  }

  const segments = normalizedSlashes.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return { error: "Path cannot contain empty segments." };
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { error: 'Path cannot contain "." or ".." segments.' };
    }

    if (INVALID_SEGMENT_CHARS.test(segment)) {
      return { error: "Path contains invalid characters." };
    }

    if (segment.endsWith(" ") || segment.endsWith(".")) {
      return { error: "Path segments cannot end with a dot or whitespace." };
    }
  }

  return { normalizedPath: segments.join("/") };
}

async function listTaskUris(analysisRootUri: vscode.Uri): Promise<vscode.Uri[]> {
  const entries = await vscode.workspace.fs.readDirectory(analysisRootUri);
  return entries
    .filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
    .map(([name]) => vscode.Uri.joinPath(analysisRootUri, name))
    .sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath), undefined, { sensitivity: "base" }));
}

function resolveTaskUriFromTarget(target?: vscode.Uri | AnalysisTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "task" && target.uri) {
    return target.uri;
  }

  if (target.kind === "group" && target.taskUri && target.groupName === "scripts") {
    return target.taskUri;
  }

  return undefined;
}

type TaskPickResult = { status: "picked"; uri: vscode.Uri } | { status: "cancelled" } | { status: "empty" };

async function pickTaskUri(analysisRootUri: vscode.Uri): Promise<TaskPickResult> {
  const tasks = await listTaskUris(analysisRootUri);
  if (tasks.length === 0) {
    return { status: "empty" };
  }

  const picked = await vscode.window.showQuickPick(
    tasks.map((uri) => ({ label: path.basename(uri.fsPath), uri })),
    { placeHolder: "Select an analysis task" }
  );

  if (!picked) {
    return { status: "cancelled" };
  }

  return { status: "picked", uri: picked.uri };
}

export function createAnalysisNewScriptCommand(
  analysisTreeProvider: AnalysisTreeProvider
): (target?: vscode.Uri | AnalysisTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | AnalysisTreeItem): Promise<void> => {
    const analysisRoot = await analysisTreeProvider.getAnalysisRootUri();
    if (!analysisRoot.uri) {
      void vscode.window.showWarningMessage(analysisRoot.message);
      return;
    }

    let taskUri = resolveTaskUriFromTarget(target);
    if (!taskUri) {
      const pickResult = await pickTaskUri(analysisRoot.uri);
      if (pickResult.status === "cancelled") {
        return;
      }
      if (pickResult.status === "empty") {
        void vscode.window.showWarningMessage("No analysis task available. Create a task folder in Analysis/ first.");
        return;
      }
      taskUri = pickResult.uri;
    }

    if (!taskUri) {
      void vscode.window.showWarningMessage("No analysis task available. Create a task folder in Analysis/ first.");
      return;
    }

    const scriptPath = await vscode.window.showInputBox({
      prompt: "Enter script file path relative to scripts/",
      placeHolder: "main.py or data/plot.py",
      validateInput: (value: string): string | undefined => normalizeRelativePath(value).error
    });
    if (scriptPath === undefined) {
      return;
    }

    const normalizedResult = normalizeRelativePath(scriptPath);
    if (!normalizedResult.normalizedPath) {
      void vscode.window.showErrorMessage(normalizedResult.error ?? "Invalid script path.");
      return;
    }

    const scriptsRootUri = vscode.Uri.joinPath(taskUri, "scripts");
    const targetUri = vscode.Uri.joinPath(scriptsRootUri, ...normalizedResult.normalizedPath.split("/"));

    try {
      await vscode.workspace.fs.stat(targetUri);
      void vscode.window.showErrorMessage(`Script already exists: ${scriptPath}`);
      return;
    } catch {
      // Expected when file does not exist.
    }

    const parentSegments = normalizedResult.normalizedPath.split("/").slice(0, -1);
    const parentUri = parentSegments.length > 0 ? vscode.Uri.joinPath(scriptsRootUri, ...parentSegments) : scriptsRootUri;

    try {
      await vscode.workspace.fs.createDirectory(parentUri);
      await vscode.workspace.fs.writeFile(targetUri, new Uint8Array());
      await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn: vscode.ViewColumn.One });
      analysisTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to create script file: ${message}`);
    }
  };
}
