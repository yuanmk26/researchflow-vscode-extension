import * as path from "path";
import * as vscode from "vscode";

import { WRITING_MANIFEST_FILENAME, WritingManifest, WritingTreeItem } from "../views/writingTreeProvider";

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

export function validateWritingObjectName(input: string): string | undefined {
  const name = input.trim();
  if (!name) {
    return "Writing object name cannot be empty.";
  }

  if (name === "." || name === "..") {
    return 'Writing object name cannot be "." or "..".';
  }

  if (INVALID_NAME_CHARS.test(name)) {
    return "Writing object name contains invalid characters.";
  }

  if (name.endsWith(" ") || name.endsWith(".")) {
    return "Writing object name cannot end with a dot or whitespace.";
  }

  return undefined;
}

export function resolveWritingObjectUri(target?: vscode.Uri | WritingTreeItem): vscode.Uri | undefined {
  if (!target) {
    return undefined;
  }

  if (target instanceof vscode.Uri) {
    return target;
  }

  if (target.kind === "object" && target.uri) {
    return target.uri;
  }

  if (target.objectUri) {
    return target.objectUri;
  }

  return undefined;
}

export function createDefaultWritingManifest(name: string, type: string): WritingManifest {
  const now = new Date().toISOString();
  return {
    name,
    type,
    template: null,
    agentReferenceDocs: [],
    createdAt: now,
    updatedAt: now
  };
}

export async function readWritingManifest(objectUri: vscode.Uri): Promise<WritingManifest> {
  const manifestUri = vscode.Uri.joinPath(objectUri, WRITING_MANIFEST_FILENAME);
  const raw = await vscode.workspace.fs.readFile(manifestUri);
  const decoded = new TextDecoder("utf-8").decode(raw);
  const parsed = JSON.parse(decoded) as Partial<WritingManifest>;

  return {
    name: typeof parsed.name === "string" ? parsed.name : path.basename(objectUri.fsPath),
    type: typeof parsed.type === "string" ? parsed.type : "unknown",
    template: typeof parsed.template === "string" ? parsed.template : null,
    agentReferenceDocs: Array.isArray(parsed.agentReferenceDocs)
      ? parsed.agentReferenceDocs.filter((value): value is string => typeof value === "string")
      : [],
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
  };
}

export async function writeWritingManifest(objectUri: vscode.Uri, manifest: WritingManifest): Promise<void> {
  const manifestUri = vscode.Uri.joinPath(objectUri, WRITING_MANIFEST_FILENAME);
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(manifestUri, new TextEncoder().encode(payload));
}
