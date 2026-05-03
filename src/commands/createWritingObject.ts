import * as vscode from "vscode";

import { WritingTreeProvider } from "../views/writingTreeProvider";
import { createDefaultWritingManifest, validateWritingObjectName, writeWritingManifest } from "./writingManifest";

const DEFAULT_WRITING_TYPES = ["note", "report", "draft"];

function buildMainTex(name: string, type: string): string {
  return `\\documentclass{article}

\\title{${name}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

% Writing type: ${type}

\\end{document}
`;
}

async function pickWritingType(): Promise<string | undefined> {
  const selected = await vscode.window.showQuickPick(
    [...DEFAULT_WRITING_TYPES, "Custom..."],
    {
      placeHolder: "Select writing type"
    }
  );

  if (!selected) {
    return undefined;
  }

  if (selected !== "Custom...") {
    return selected;
  }

  const customType = await vscode.window.showInputBox({
    prompt: "Enter custom writing type",
    placeHolder: "manuscript",
    validateInput: (value: string): string | undefined => {
      const normalized = value.trim();
      if (!normalized) {
        return "Writing type cannot be empty.";
      }

      return undefined;
    }
  });

  return customType?.trim();
}

export function createWritingNewObjectCommand(
  writingTreeProvider: WritingTreeProvider
): () => Promise<void> {
  return async (): Promise<void> => {
    const writingRoot = await writingTreeProvider.getWritingRootUri();
    if (!writingRoot.uri) {
      void vscode.window.showWarningMessage(writingRoot.message);
      return;
    }

    const objectName = await vscode.window.showInputBox({
      prompt: "Enter writing object name",
      placeHolder: "paper-01",
      validateInput: (value: string): string | undefined => validateWritingObjectName(value)
    });

    if (objectName === undefined) {
      return;
    }

    const writingType = await pickWritingType();
    if (!writingType) {
      return;
    }

    const normalizedName = objectName.trim();
    const objectUri = vscode.Uri.joinPath(writingRoot.uri, normalizedName);

    try {
      await vscode.workspace.fs.stat(objectUri);
      void vscode.window.showErrorMessage(`Writing object already exists: ${normalizedName}`);
      return;
    } catch {
      // Expected when directory does not exist.
    }

    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(objectUri, "figures"));
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(objectUri, "main.tex"),
        new TextEncoder().encode(buildMainTex(normalizedName, writingType))
      );
      await writeWritingManifest(objectUri, createDefaultWritingManifest(normalizedName, writingType));
      writingTreeProvider.refresh();
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.joinPath(objectUri, "main.tex"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Failed to create writing object: ${message}`);
    }
  };
}
