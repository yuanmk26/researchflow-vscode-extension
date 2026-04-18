import * as vscode from "vscode";

import { CoreClient } from "../services/coreClient";

export function createDraftCaptionCommand(coreClient: CoreClient): () => Promise<void> {
  return async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage("Open a file to draft a caption.");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!filePath) {
      void vscode.window.showWarningMessage("Current editor does not map to a local file path.");
      return;
    }

    try {
      const caption = await coreClient.generateCaption(filePath);
      void vscode.window.showInformationMessage(`Draft caption: ${caption}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Caption generation failed: ${message}`);
    }

    // TODO: Add artifact metadata context (figure id/paper id) to caption requests.
  };
}