import * as vscode from "vscode";

import { CoreClient } from "../services/coreClient";

export function createRecommendCitationsCommand(coreClient: CoreClient): () => Promise<void> {
  return async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage("Open a text editor to recommend citations.");
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    const text = selectedText.trim().length > 0 ? selectedText : editor.document.getText();

    if (text.trim().length === 0) {
      void vscode.window.showWarningMessage("No text found to analyze for citation recommendations.");
      return;
    }

    try {
      const recommendations = await coreClient.recommendCitations(text);

      if (recommendations.length === 0) {
        void vscode.window.showInformationMessage("No citation recommendations returned.");
        return;
      }

      const summary = recommendations
        .slice(0, 3)
        .map((ref) => ref.title)
        .join(" | ");

      void vscode.window.showInformationMessage(`Recommended citations: ${summary}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Citation recommendation failed: ${message}`);
    }

    // TODO: Render citation results in a dedicated view instead of an info toast.
  };
}