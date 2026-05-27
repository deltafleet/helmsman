import { runDoctorCommand } from "./commands/doctor.ts";
import { runCoreCommand } from "./commands/core.ts";
import { runPiRuntimeCommand } from "./commands/pi-runtime.ts";
import { runRoleRuntimeCommand } from "./commands/role-runtime.ts";
import { runMemoryResearchCommand } from "./commands/memory-research.ts";
import { runRouteLockCommand } from "./commands/route-lock.ts";
import { runAutopilotCommand } from "./commands/autopilot.ts";
import { runCloseoutCommand, runVerificationCommand } from "./commands/verification-closeout.ts";
import { runInitCommand, runInstallCommand, runProductAuditCommand, runUninstallCommand, runUpdateCommand, runVerifyCommand } from "./commands/product-lifecycle.ts";
import { runTuiCommand } from "./commands/tui.ts";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  let exitCode = 2;
  try {
    if (command === "doctor") {
      exitCode = await runDoctorCommand(rest);
    } else if (command === "install") {
      exitCode = await runInstallCommand(rest);
    } else if (command === "init") {
      exitCode = await runInitCommand(rest);
    } else if (command === "update") {
      exitCode = await runUpdateCommand(rest);
    } else if (command === "uninstall") {
      exitCode = await runUninstallCommand(rest);
    } else if (command === "product-audit") {
      exitCode = await runProductAuditCommand(rest);
    } else if (command === "verify") {
      exitCode = await runVerifyCommand(rest);
    } else if (command === "core") {
      exitCode = await runCoreCommand(rest);
    } else if (command === "pi-runtime") {
      exitCode = await runPiRuntimeCommand(rest);
    } else if (command === "role-runtime") {
      exitCode = await runRoleRuntimeCommand(rest);
    } else if (command === "memory-research") {
      exitCode = await runMemoryResearchCommand(rest);
    } else if (command === "route-lock") {
      exitCode = await runRouteLockCommand(rest);
    } else if (command === "autopilot") {
      exitCode = await runAutopilotCommand(rest);
    } else if (command === "verification") {
      exitCode = await runVerificationCommand(rest);
    } else if (command === "closeout") {
      exitCode = await runCloseoutCommand(rest);
    } else if (command === "tui") {
      exitCode = await runTuiCommand(rest);
    } else {
      console.error("Usage: helmsman <doctor|install|init|update|uninstall|product-audit|verify|core|pi-runtime|role-runtime|memory-research|route-lock|autopilot|verification|closeout|tui>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 1;
  }
  process.exitCode = exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
