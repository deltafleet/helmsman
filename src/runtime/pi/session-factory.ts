import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  getAgentDir,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { RunPaths } from "../../core/document-bus/paths.ts";

export interface HelmsmanPiSession {
  session: AgentSession;
  sessionId: string;
  sessionFile?: string;
  sessionDir: string;
  persistent: boolean;
}

export async function createHelmsmanPiSession(input: {
  cwd: string;
  paths: RunPaths;
  persistent: boolean;
  liveProvider: boolean;
  liveModel?: Model<any>;
  allowedToolNames?: string[];
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
}): Promise<HelmsmanPiSession> {
  const agentDir = input.liveProvider ? getAgentDir() : `${input.paths.piRoot}/agent-dir`;
  const authStorage = input.liveProvider ? AuthStorage.create() : AuthStorage.inMemory();
  const modelRegistry = input.liveProvider
    ? ModelRegistry.create(authStorage)
    : ModelRegistry.inMemory(authStorage);
  const settingsManager = input.liveProvider
    ? SettingsManager.create(input.cwd, agentDir)
    : SettingsManager.inMemory({ quietStartup: true });
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: input.systemPrompt ?? "You are running inside Helmsman Gate 1 runtime foundation verification.",
  });
  await resourceLoader.reload();

  const sessionManager = input.persistent
    ? SessionManager.create(input.cwd, input.paths.piSessionDir)
    : SessionManager.inMemory(input.cwd);

  const selectedModel = input.liveProvider ? input.liveModel ?? modelRegistry.getAvailable()[0] : undefined;
  if (input.liveProvider && !selectedModel) {
    throw new Error("live_provider_unavailable:no_configured_model");
  }

  const { session } = await createAgentSession({
    cwd: input.cwd,
    agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    sessionManager,
    model: selectedModel,
    thinkingLevel: input.thinkingLevel,
    tools: input.allowedToolNames && input.allowedToolNames.length > 0 ? input.allowedToolNames : undefined,
    noTools: input.allowedToolNames && input.allowedToolNames.length > 0 ? undefined : "all",
  });

  return {
    session,
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    sessionDir: sessionManager.getSessionDir(),
    persistent: input.persistent,
  };
}

export function getLiveModelCandidates(cwd: string): Model<any>[] {
  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const available = modelRegistry.getAvailable();
  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModel = settingsManager.getDefaultModel();
  const candidates: Model<any>[] = [];
  const seen = new Set<string>();

  function add(model: Model<any> | undefined): void {
    if (!model) return;
    const key = `${model.provider}:${model.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(model);
  }

  add(available.find((model) => model.provider === defaultProvider && model.id === defaultModel));

  const providers = new Set(available.map((model) => model.provider));
  for (const provider of providers) {
    add(available.find((model) => model.provider === provider));
  }

  return candidates;
}
