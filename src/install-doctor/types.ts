export type InstallScope = "project" | "user";

export interface InstallManifest {
  schemaVersion: "helmsman.install.v1";
  installedAt: string;
  packageName: string;
  packageVersion: string;
  commandPath: string;
  scope: InstallScope;
  workspace?: string;
  nodeVersion: string;
  piBaseline: {
    codingAgent: string;
    agentCore: string;
    tui: string;
  };
  files: InstallManifestFile[];
  staleFilesRemoved: string[];
  skippedFiles: Array<{
    path: string;
    reason: string;
  }>;
  warnings: string[];
}

export interface InstallManifestFile {
  path: string;
  kind: "config" | "role_registry" | "adapter_config" | "schema" | "template" | "generated_cache";
  sha256: string;
  managed: boolean;
}

export interface DoctorFinding {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  evidenceRef?: string;
}

export interface DoctorReport {
  schemaVersion: "helmsman.doctor.v1";
  checkedAt: string;
  ready: boolean;
  ok: boolean;
  command: {
    path?: string;
    version?: string;
    source: "package" | "workspace" | "unknown";
  };
  environment: {
    platform: string;
    nodeVersion: string;
    cwd: string;
    workspace?: string;
    userConfigRoot: string;
  };
  package: {
    installed: boolean;
    packageName?: string;
    packageVersion?: string;
    piVersions: Record<string, string>;
    exportsOk: boolean;
  };
  install: {
    projectManifest?: string;
    userManifest?: string;
    managedFileDrift: DoctorFinding[];
    staleFiles: DoctorFinding[];
  };
  runtime: {
    piImportOk: boolean;
    tuiImportOk: boolean;
    documentBusWritable: boolean;
    fullProductEntryPointsPresent: boolean;
  };
  providers: {
    configured: number;
    ready: number;
    missingAuth: string[];
    warnings: DoctorFinding[];
  };
  checks: DoctorFinding[];
  nextRecommendedAction:
    | "ready"
    | "install"
    | "update_requires_approval"
    | "repair_requires_approval"
    | "configure_provider"
    | "implementation_missing"
    | "blocked";
  piApiSurface: {
    checkedAt: string;
    nodeVersion: string;
    packages: Array<{
      packageName: string;
      expectedVersion: string;
      installedVersion?: string;
      versionMatches: boolean;
      importAvailable: boolean;
      missingExports: string[];
      error?: string;
    }>;
  };
  providerReadiness: Record<string, unknown>;
  productSurface: ProductSurfaceReport;
}

export interface ProductSurfaceReport {
  coreEventSystemAvailable: true;
  manifestReducerAvailable: true;
  boardProjectorAvailable: true;
  tuiWorkbenchAvailable: true;
  questionUiAdapterAvailable: true;
  roleRuntimeAvailable: true;
  memoryResearchAvailable: true;
  routeLockAvailable: true;
  fullTuiAvailable: boolean;
  chartingAvailable: true;
  autopilotAvailable: true;
  verificationCloseoutAvailable: true;
  installDoctorAvailable: boolean;
  updateAvailable: boolean;
  uninstallAvailable: boolean;
  productAuditAvailable: boolean;
}

export interface InstallCommandResult {
  ok: boolean;
  dryRun: boolean;
  scope: InstallScope;
  root: string;
  manifestPath: string;
  manifest: InstallManifest;
  plannedFiles: InstallManifestFile[];
  writtenFiles: string[];
  skippedFiles: InstallManifest["skippedFiles"];
  warnings: string[];
}

export interface UpdateCommandResult {
  ok: boolean;
  dryRun: boolean;
  approvalRequired: boolean;
  backupRoot?: string;
  install?: InstallCommandResult;
  postUpdateDoctor?: DoctorReport;
  currentVersion?: string;
  targetVersion?: string;
  source: "local_package";
  managedFilesThatWillChange: string[];
  preservedUserOwnedFiles: string[];
  warnings: string[];
}

export interface UninstallCommandResult {
  ok: boolean;
  dryRun: boolean;
  approvalRequired: boolean;
  scope: InstallScope;
  manifestPath?: string;
  reportPath?: string;
  removedFiles: string[];
  preservedFiles: string[];
  skippedFiles: Array<{ path: string; reason: string }>;
  warnings: string[];
}

export type ProductAuditStatus = "proved" | "contradicted" | "incomplete" | "missing" | "not_applicable";

export interface ProductAuditRequirement {
  requirementId: string;
  requirementText: string;
  category:
    | "north_star"
    | "core_authority"
    | "pi_runtime"
    | "tui"
    | "question_ui"
    | "manifest_board"
    | "role_runtime"
    | "memory_research"
    | "route_lock"
    | "autopilot"
    | "verification"
    | "install_doctor"
    | "security"
    | "release";
  requiredEvidence: ProductAuditEvidenceRef[];
  status: ProductAuditStatus;
  reason: string;
}

export interface ProductAuditEvidenceRef {
  kind:
    | "schema"
    | "unit_test"
    | "replay_test"
    | "tui_pty"
    | "live_pi_provider"
    | "live_agent_session"
    | "package_install"
    | "doctor"
    | "role_run"
    | "artifact"
    | "manual_review";
  ref: string;
  coverage: string;
}

export interface NoMockAuditRecord {
  path: string;
  kind: "mock" | "fixture" | "fake_provider" | "headless_driver" | "synthetic_data";
  allowedFor: "unit_test" | "contract_test" | "ci_only";
  forbiddenFor: string[];
  productClaimBlocked: boolean;
  reason: string;
}

export interface ProductAuditResult {
  schemaVersion: "helmsman.product-audit.v1";
  auditId: string;
  createdAt: string;
  ok: boolean;
  releaseReady: boolean;
  requirementsProved: boolean;
  auditRoot: string;
  artifacts: {
    auditPlan: string;
    requirements: string;
    evidenceIndex: string;
    commandLog: string;
    installState: string;
    liveProvider: string;
    noMockAudit: string;
    report: string;
  };
  requirementSummary: Record<ProductAuditStatus, number>;
  blockedReasons: string[];
}
