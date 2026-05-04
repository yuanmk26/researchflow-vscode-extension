import { AgentTaskRequest } from "../protocol";

export async function createPiSession(request: AgentTaskRequest): Promise<unknown> {
  const pi = await dynamicImport("@mariozechner/pi-coding-agent");
  const createAgentSession = (pi as { createAgentSession?: (options: Record<string, unknown>) => Promise<unknown> })
    .createAgentSession;

  if (typeof createAgentSession !== "function") {
    throw new Error("@mariozechner/pi-coding-agent does not export createAgentSession.");
  }

  const authStorage = createAuthStorage(pi);
  const modelRegistry = createModelRegistry(pi, authStorage);
  const sessionManager = createInMemorySessionManager(pi);
  const settingsManager = createInMemorySettingsManager(pi);

  const result = await createAgentSession({
    cwd: request.workspaceRoot,
    authStorage,
    modelRegistry,
    sessionManager,
    settingsManager,
    tools: ["read", "grep", "find", "ls"],
    contextFiles: request.contextItems.map((item) => item.path)
  });

  if (result && typeof result === "object" && "session" in result) {
    return (result as { session: unknown }).session;
  }

  return result;
}

function dynamicImport(specifier: string): Promise<unknown> {
  const importer = new Function("specifier", "return import(specifier)") as (value: string) => Promise<unknown>;
  return importer(specifier);
}

function createAuthStorage(pi: unknown): unknown {
  const authStorage = (pi as { AuthStorage?: { create?: () => unknown } }).AuthStorage;
  return authStorage?.create?.();
}

function createModelRegistry(pi: unknown, authStorage: unknown): unknown {
  const modelRegistry = (pi as { ModelRegistry?: { create?: (authStorage: unknown) => unknown } }).ModelRegistry;
  return modelRegistry?.create?.(authStorage);
}

function createInMemorySessionManager(pi: unknown): unknown {
  const sessionManager = (pi as { SessionManager?: { inMemory?: () => unknown } }).SessionManager;
  return sessionManager?.inMemory?.();
}

function createInMemorySettingsManager(pi: unknown): unknown {
  const settingsManager = (pi as { SettingsManager?: { inMemory?: () => unknown } }).SettingsManager;
  return settingsManager?.inMemory?.();
}
