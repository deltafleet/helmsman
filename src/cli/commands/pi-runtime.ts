import { randomUUID } from "node:crypto";
import { runDoctorCommand } from "./doctor.ts";
import { runPiProbe, type PiProbeMode } from "../../runtime/pi/session-runner.ts";

const MODES = new Set<PiProbeMode>(["import", "in-memory-session", "persisted-session", "timeout", "abort", "live-provider"]);

export async function runPiRuntimeCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand === "doctor") return runDoctorCommand(rest);
  if (subcommand === "probe") return runProbe(rest);
  console.error("Usage: helmsman pi-runtime <doctor|probe>");
  return 2;
}

async function runProbe(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = flagValue(args, "--session") ?? `gate1-${randomUUID()}`;
  const mode = flagValue(args, "--mode") as PiProbeMode | undefined;
  const json = args.includes("--json");
  if (!mode || !MODES.has(mode)) {
    console.error(`Missing or invalid --mode. Expected one of: ${[...MODES].join(", ")}`);
    return 2;
  }
  const timeoutMs = numberFlag(args, "--timeout-ms");
  const result = await runPiProbe({ cwd, runId, mode, timeoutMs });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.status}: ${result.message}`);
    console.log(result.runRoot);
  }
  if (result.status === "failed") return 1;
  if (result.status === "unavailable") return 3;
  return 0;
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function numberFlag(args: string[], name: string): number | undefined {
  const value = flagValue(args, name);
  return value ? Number.parseInt(value, 10) : undefined;
}
