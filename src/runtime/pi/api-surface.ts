import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PINNED_PI_PACKAGES = {
  "@earendil-works/pi-coding-agent": "0.75.5",
  "@earendil-works/pi-agent-core": "0.75.5",
  "@earendil-works/pi-ai": "0.75.5",
  "@earendil-works/pi-tui": "0.75.5",
} as const;

export const REQUIRED_CODING_AGENT_EXPORTS = [
  "createAgentSession",
  "createAgentSessionRuntime",
  "AgentSessionRuntime",
  "SessionManager",
  "SettingsManager",
  "DefaultResourceLoader",
  "AuthStorage",
  "ModelRegistry",
  "defineTool",
  "createReadOnlyTools",
  "createReadTool",
  "createGrepTool",
  "createFindTool",
  "createBashTool",
  "createWriteTool",
] as const;

export interface PackageSurface {
  packageName: string;
  expectedVersion: string;
  installedVersion?: string;
  versionMatches: boolean;
  importAvailable: boolean;
  missingExports: string[];
  error?: string;
}

export interface PiApiSurfaceReport {
  checkedAt: string;
  nodeVersion: string;
  packages: PackageSurface[];
}

function findPackageJson(packageName: string): string {
  let current = dirname(fileURLToPath(import.meta.resolve(packageName)));
  for (;;) {
    const candidate = join(current, "package.json");
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) throw new Error(`Cannot locate package.json for ${packageName}`);
      current = parent;
    }
  }
}

export function readInstalledPackageVersion(packageName: string): string | undefined {
  try {
    const packageJsonPath = findPackageJson(packageName);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version;
  } catch {
    return undefined;
  }
}

export async function inspectPiApiSurface(): Promise<PiApiSurfaceReport> {
  const packages: PackageSurface[] = [];

  for (const [packageName, expectedVersion] of Object.entries(PINNED_PI_PACKAGES)) {
    const installedVersion = readInstalledPackageVersion(packageName);
    try {
      const imported = (await import(packageName)) as Record<string, unknown>;
      const requiredExports =
        packageName === "@earendil-works/pi-coding-agent" ? REQUIRED_CODING_AGENT_EXPORTS : [];
      const missingExports = requiredExports.filter((name) => !(name in imported));
      packages.push({
        packageName,
        expectedVersion,
        installedVersion,
        versionMatches: installedVersion === expectedVersion,
        importAvailable: true,
        missingExports,
      });
    } catch (error) {
      packages.push({
        packageName,
        expectedVersion,
        installedVersion,
        versionMatches: installedVersion === expectedVersion,
        importAvailable: false,
        missingExports: packageName === "@earendil-works/pi-coding-agent" ? [...REQUIRED_CODING_AGENT_EXPORTS] : [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    nodeVersion: process.version,
    packages,
  };
}

export function apiSurfaceOk(report: PiApiSurfaceReport): boolean {
  return report.packages.every(
    (pkg) => pkg.importAvailable && pkg.versionMatches && pkg.missingExports.length === 0,
  );
}
