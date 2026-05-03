import * as vscode from "vscode";

import { WritingTreeItem } from "../views/writingTreeProvider";
import { resolveWritingObjectUri } from "./writingManifest";

export function createOpenWritingObjectCommand(): (target?: vscode.Uri | WritingTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | WritingTreeItem): Promise<void> => {
    const objectUri = resolveWritingObjectUri(target);
    if (!objectUri) {
      void vscode.window.showWarningMessage("No writing object selected.");
      return;
    }

    const mainTexUri = vscode.Uri.joinPath(objectUri, "main.tex");

    try {
      await vscode.commands.executeCommand("vscode.open", mainTexUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to open writing object: ${message}`);
    }
  };
}
