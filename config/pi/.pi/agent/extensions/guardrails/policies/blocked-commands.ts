import { basename } from "node:path";
import { findCommandInvocations } from "../command-parser.ts";
import { block, type GuardrailPolicy } from "../policy.ts";

const PACKAGE_RUNNERS = new Set(["bunx", "npm", "npx", "pnpm", "yarn"]);

function packageName(value: string): string {
  const name = basename(value);
  if (name.startsWith("@")) {
    const versionAt = name.lastIndexOf("@");
    return versionAt > 0 ? name.slice(0, versionAt) : name;
  }
  return name.split("@", 1)[0];
}

function blockedCommands(configured: string[]): Set<string> {
  return new Set(configured.map((command) => basename(command)));
}

export const blockedCommandsPolicy = {
  name: "blocked-commands",
  async guidance({ config }) {
    const blocked = blockedCommands(config.commands.blockedCommands);
    if (blocked.size === 0) return;
    return `Command guardrail: never run these commands or invoke them through package runners: ${[...blocked].join(", ")}.`;
  },
  async check(action, { config }) {
    if (action.toolName !== "bash" || typeof action.input.command !== "string") return;
    const blocked = blockedCommands(config.commands.blockedCommands);
    if (blocked.size === 0) return;

    const direct = findCommandInvocations(action.input.command, blocked)[0];
    if (direct) return block(`Blocked command '${direct.command}' by guardrails configuration.`);

    for (const runner of findCommandInvocations(action.input.command, PACKAGE_RUNNERS)) {
      const nested = runner.args.find((argument) => blocked.has(packageName(argument)));
      if (nested) {
        return block(
          `Blocked command '${packageName(nested)}' invoked through '${runner.command}'.`,
        );
      }
    }
  },
} satisfies GuardrailPolicy;
