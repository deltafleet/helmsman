import type { RunPaths } from "../../core/document-bus/paths.ts";
import { atomicWriteFile } from "../../core/document-bus/atomic-write.ts";
import { inspectPiApiSurface } from "./api-surface.ts";
import { inspectProviderReadiness } from "./provider-readiness.ts";

export async function writeCapabilityReport(paths: RunPaths): Promise<Record<string, unknown>> {
  const apiSurface = await inspectPiApiSurface();
  const providerReadiness = await inspectProviderReadiness(paths.cwd);
  const report = {
    schemaVersion: "helmsman.pi-capability-report.v1",
    checkedAt: new Date().toISOString(),
    nodeVersion: process.version,
    apiSurface,
    sessionModesSupported: {
      importSurface: true,
      inMemorySession: true,
      persistedSession: true,
      liveProvider: providerReadiness.providers.some((provider) => provider.configured === "yes"),
    },
    settingsResourceLoaderAvailability: true,
    eventSubscriptionAvailability: true,
    timeoutAbortStatus: "implemented_for_gate_1_operation_lifecycle",
    providerReadiness,
    unsupportedOrUnprovedCapabilities: [
      "charting",
      "question_ui_adapter",
      "route_lock",
      "autopilot",
      "verification_closeout",
      "package_release_audit",
    ],
  };
  await atomicWriteFile(paths.capabilityReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
