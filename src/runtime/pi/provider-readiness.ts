import { homedir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry, SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readInstalledPackageVersion } from "./api-surface.ts";

export interface PiProviderReadiness {
  checkedAt: string;
  packageVersion: string;
  nodeVersion: string;
  authStorage: "available" | "missing" | "error";
  modelRegistry: "available" | "empty" | "error";
  providers: Array<{
    providerId: string;
    configured: "yes" | "no" | "unknown";
    modelCount?: number;
    selectedModelId?: string;
    warnings: string[];
  }>;
  secretPolicy: {
    rawSecretsStored: false;
    checkedPaths: string[];
  };
}

export async function inspectProviderReadiness(cwd: string): Promise<PiProviderReadiness> {
  const agentDir = getAgentDir();
  const checkedPaths = [join(agentDir, "auth.json"), join(agentDir, "models.json")];
  try {
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    const settings = SettingsManager.create(cwd, agentDir);
    const models = modelRegistry.getAll();
    const availableModels = new Set(modelRegistry.getAvailable().map((model) => `${model.provider}:${model.id}`));
    const grouped = new Map<string, typeof models>();
    for (const model of models) {
      const list = grouped.get(model.provider) ?? [];
      list.push(model);
      grouped.set(model.provider, list);
    }
    const defaultProvider = settings.getDefaultProvider();
    const defaultModel = settings.getDefaultModel();
    const providers = [...grouped.entries()].map(([providerId, providerModels]) => {
      const auth = modelRegistry.getProviderAuthStatus(providerId);
      const hasAvailableModel = providerModels.some((model) => availableModels.has(`${model.provider}:${model.id}`));
      const selectedModelId =
        providerId === defaultProvider
          ? defaultModel
          : providerModels.find((model) => model.id === defaultModel)?.id;
      return {
        providerId,
        configured: auth.configured || hasAvailableModel ? "yes" as const : "no" as const,
        modelCount: providerModels.length,
        selectedModelId,
        warnings: auth.configured || hasAvailableModel ? [] : ["provider_auth_not_configured"],
      };
    });

    return {
      checkedAt: new Date().toISOString(),
      packageVersion: readInstalledPackageVersion("@earendil-works/pi-coding-agent") ?? "unknown",
      nodeVersion: process.version,
      authStorage: "available",
      modelRegistry: providers.length > 0 ? "available" : "empty",
      providers,
      secretPolicy: {
        rawSecretsStored: false,
        checkedPaths: checkedPaths.map((path) => path.replace(homedir(), "~")),
      },
    };
  } catch {
    return {
      checkedAt: new Date().toISOString(),
      packageVersion: readInstalledPackageVersion("@earendil-works/pi-coding-agent") ?? "unknown",
      nodeVersion: process.version,
      authStorage: "error",
      modelRegistry: "error",
      providers: [],
      secretPolicy: {
        rawSecretsStored: false,
        checkedPaths: checkedPaths.map((path) => path.replace(homedir(), "~")),
      },
    };
  }
}
