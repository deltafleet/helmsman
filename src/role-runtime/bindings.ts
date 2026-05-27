import type { RoleBindingContract, RolePurpose } from "../core/authority/types.ts";
import { getLiveModelCandidates } from "../runtime/pi/session-factory.ts";

export function buildLivePiRoleBinding(input: {
  cwd: string;
  roleId: string;
  purpose: RolePurpose;
  timeoutMs?: number;
  allowedToolNames?: string[];
  allowedReadRoots?: string[];
  allowedWriteRoots?: string[];
}): RoleBindingContract {
  const [model] = getLiveModelCandidates(input.cwd);
  if (!model) {
    throw new Error("live_provider_unavailable:no_configured_model");
  }

  const allowedReadRoots = input.allowedReadRoots ?? [input.cwd];
  const allowedWriteRoots = input.allowedWriteRoots ?? [];
  return {
    roleId: input.roleId,
    purpose: input.purpose,
    runtime: "pi_agent_session",
    provider: String(model.provider),
    model: model.id,
    api: model.api,
    thinking: model.reasoning ? "minimal" : "off",
    mode: "auto",
    toolPolicy: {
      allowedToolNames: input.allowedToolNames ?? [],
      network: "forbidden",
      filesystem: allowedWriteRoots.length > 0 ? "declared_writes_only" : "read_only",
      shell: "forbidden",
      customTools: [],
    },
    sandboxPolicy: {
      cwd: input.cwd,
      allowedReadRoots,
      allowedWriteRoots,
      deniedRoots: [],
      secretsPolicy: "provider_auth_only",
    },
    concurrency: {
      class: concurrencyClass(input.purpose),
      maxParallel: 1,
      queue: "fifo",
      leaseMs: input.timeoutMs ?? 120000,
    },
    budgets: {
      maxTurns: 1,
      timeoutMs: input.timeoutMs ?? 120000,
    },
    fallback: {
      onMissingAuth: "block",
      onModelUnsupportedThinking: "clamp_and_record",
      onRuntimeUnavailable: "block",
    },
    requiredArtifacts: [],
    forbiddenAuthorityClaims: [
      "Do not claim Route Lock.",
      "Do not mutate Manifest or Board directly.",
      "Do not accept artifacts.",
      "Do not mark verification, closeout, or product completion.",
      "Final prose is evidence only.",
    ],
  };
}

function concurrencyClass(purpose: RolePurpose): RoleBindingContract["concurrency"]["class"] {
  if (purpose === "research" || purpose === "memory_scan") return "research_worker";
  if (purpose === "audit") return "auditor";
  if (purpose === "verification") return "verifier";
  if (purpose === "autopilot") return "implementation_worker";
  return "lead";
}
