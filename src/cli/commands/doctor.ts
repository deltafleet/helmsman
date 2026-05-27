import { buildDoctorReport } from "../../install-doctor/service.ts";
export { buildDoctorReport } from "../../install-doctor/service.ts";
export type { DoctorReport } from "../../install-doctor/types.ts";

export async function runDoctorCommand(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const workspace = flagValue(args, "--workspace") ?? cwd;
  const report = await buildDoctorReport({ cwd, workspace });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.ok ? "Helmsman doctor: ok" : "Helmsman doctor: failed");
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    console.log(`Next: ${report.nextRecommendedAction}`);
    if (report.checks.some((check) => check.severity !== "info")) {
      for (const check of report.checks.filter((item) => item.severity !== "info")) {
        console.log(`${check.severity}: ${check.id}: ${check.message}`);
      }
    }
  }
  return report.ok ? 0 : 1;
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
