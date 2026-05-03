import * as vscode from "vscode";

import { WritingTreeItem } from "../views/writingTreeProvider";
import { resolveWritingObjectUri } from "./writingManifest";

async function forceTwoGroupLayout(): Promise<void> {
  await vscode.commands.executeCommand("vscode.setEditorLayout", {
    groups: [{}, {}],
    orientation: 0
  });
}

async function focusEditorGroup(group: "first" | "second"): Promise<void> {
  const command =
    group === "first" ? "workbench.action.focusFirstEditorGroup" : "workbench.action.focusSecondEditorGroup";
  await vscode.commands.executeCommand(command);
}

async function closeAllEditorTabs(): Promise<void> {
  for (const tabGroup of vscode.window.tabGroups.all) {
    if (tabGroup.tabs.length > 0) {
      await vscode.window.tabGroups.close([...tabGroup.tabs], true);
    }
  }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.File) !== 0;
  } catch {
    return false;
  }
}

async function directoryExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

async function openMainTex(mainTexUri: vscode.Uri): Promise<void> {
  await focusEditorGroup("first");
  await vscode.window.showTextDocument(mainTexUri, {
    preview: false,
    preserveFocus: false,
    viewColumn: vscode.ViewColumn.Active
  });
}

async function openPdfOrPlaceholder(objectUri: vscode.Uri, pdfUri: vscode.Uri, globalStorageUri: vscode.Uri): Promise<void> {
  await focusEditorGroup("second");

  if (await fileExists(pdfUri)) {
    await vscode.commands.executeCommand("vscode.open", pdfUri, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
    });
    return;
  }

  const placeholdersRoot = vscode.Uri.joinPath(globalStorageUri, "writing-placeholders");
  await vscode.workspace.fs.createDirectory(placeholdersRoot);
  const objectName = objectUri.path.split("/").pop() ?? "writing-object";
  const placeholderUri = vscode.Uri.joinPath(placeholdersRoot, `${objectName}-pdf.md`);
  const content = `# PDF Preview

No \`main.pdf\` has been generated for writing object \`${objectName}\`.

Expected PDF path:

\`${pdfUri.fsPath}\`
`;
  await vscode.workspace.fs.writeFile(placeholderUri, new TextEncoder().encode(content));
  await vscode.window.showTextDocument(placeholderUri, {
    preview: false,
    preserveFocus: false,
    viewColumn: vscode.ViewColumn.Active
  });
}

export function createOpenWritingObjectCommand(
  globalStorageUri: vscode.Uri
): (target?: vscode.Uri | WritingTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | WritingTreeItem): Promise<void> => {
    const objectUri = resolveWritingObjectUri(target);
    if (!objectUri) {
      void vscode.window.showWarningMessage("No writing object selected.");
      return;
    }

    const mainTexUri = vscode.Uri.joinPath(objectUri, "main.tex");
    const pdfUri = vscode.Uri.joinPath(objectUri, "main.pdf");

    try {
      if (!(await directoryExists(objectUri))) {
        void vscode.window.showWarningMessage("Selected writing object does not exist.");
        return;
      }

      if (!(await fileExists(mainTexUri))) {
        void vscode.window.showWarningMessage('Selected writing object does not contain "main.tex".');
        return;
      }

      await forceTwoGroupLayout();
      await closeAllEditorTabs();
      await forceTwoGroupLayout();
      await openMainTex(mainTexUri);
      await openPdfOrPlaceholder(objectUri, pdfUri, globalStorageUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to open writing object: ${message}`);
    }
  };
}
