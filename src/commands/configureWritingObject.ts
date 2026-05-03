import * as vscode from "vscode";

import { WritingTreeItem, WritingTreeProvider } from "../views/writingTreeProvider";
import { readWritingManifest, resolveWritingObjectUri, writeWritingManifest } from "./writingManifest";

export function createWritingSetTemplateCommand(
  writingTreeProvider: WritingTreeProvider
): (target?: vscode.Uri | WritingTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | WritingTreeItem): Promise<void> => {
    const objectUri = resolveWritingObjectUri(target);
    if (!objectUri) {
      void vscode.window.showWarningMessage("No writing object selected.");
      return;
    }

    const selectedFiles = await vscode.window.showOpenDialog({
      title: "Select writing template",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false
    });

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    try {
      const manifest = await readWritingManifest(objectUri);
      manifest.template = selectedFiles[0].fsPath;
      manifest.updatedAt = new Date().toISOString();
      await writeWritingManifest(objectUri, manifest);
      writingTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to set writing template: ${message}`);
    }
  };
}

export function createWritingAddAgentReferenceDocCommand(
  writingTreeProvider: WritingTreeProvider
): (target?: vscode.Uri | WritingTreeItem) => Promise<void> {
  return async (target?: vscode.Uri | WritingTreeItem): Promise<void> => {
    const objectUri = resolveWritingObjectUri(target);
    if (!objectUri) {
      void vscode.window.showWarningMessage("No writing object selected.");
      return;
    }

    const selectedFiles = await vscode.window.showOpenDialog({
      title: "Select agent reference documents",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true
    });

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    try {
      const manifest = await readWritingManifest(objectUri);
      const seen = new Set(manifest.agentReferenceDocs);
      for (const file of selectedFiles) {
        if (!seen.has(file.fsPath)) {
          seen.add(file.fsPath);
          manifest.agentReferenceDocs.push(file.fsPath);
        }
      }

      manifest.updatedAt = new Date().toISOString();
      await writeWritingManifest(objectUri, manifest);
      writingTreeProvider.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to add agent reference documents: ${message}`);
    }
  };
}
