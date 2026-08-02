import { basename } from "node:path";
import { findCommandInvocations } from "../command-parser.ts";
import { loadBlockedCommandsConfig } from "../config.ts";
import type { GuardrailPolicy } from "../policy.ts";

const PACKAGE_RUNNERS = new Set(["bunx", "npm", "npx", "pnpm", "yarn"]);

function packageName(value: string): string {
  const name = basename(value);
  if (name.startsWith("@")) {
    const versionAt = name.lastIndexOf("@");
    return versionAt > 0 ? name.slice(0, versionAt) : name;
  }
  return name.split("@", 1)[0];
}

async function blockedCommands(): Promise<Set<string>> {
  const { blockedCommands } = await loadBlockedCommandsConfig();
  return new Set(blockedCommands.map((command) => basename(command)));
}

export const blockedCommandsPolicy = {
  name: "blocked-commands",
  async guidance() {
    const blocked = await blockedCommands();
    if (blocked.size === 0) return;
    return `Command guardrail: never run these commands or invoke them through package runners: ${[...blocked].join(", ")}.`;
  },
  async checkCommand(command) {
    const blocked = await blockedCommands();
    if (blocked.size === 0) return;

    const direct = findCommandInvocations(command, blocked)[0];
    if (direct) return `Blocked command '${direct.command}' by guardrails configuration.`;

    for (const runner of findCommandInvocations(command, PACKAGE_RUNNERS)) {
      const nested = runner.args.find((argument) => blocked.has(packageName(argument)));
      if (nested) {
        return `Blocked command '${packageName(nested)}' invoked through '${runner.command}'.`;
      }
    }
  },
} satisfies GuardrailPolicy;
