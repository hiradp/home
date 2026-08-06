import { basename } from "node:path";
import { findCommandInvocations } from "../command-parser.ts";
import type { KubectlInvocationConfig } from "../config.ts";
import { block, type GuardrailPolicy } from "../policy.ts";

const GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "--as",
  "--as-group",
  "--cache-dir",
  "--certificate-authority",
  "--client-certificate",
  "--client-key",
  "--cluster",
  "--context",
  "--kubeconfig",
  "--namespace",
  "--password",
  "--profile",
  "--profile-output",
  "--request-timeout",
  "--server",
  "--tls-server-name",
  "--token",
  "--user",
  "--username",
  "--v",
  "-n",
  "-s",
]);
const GLOBAL_BOOLEAN_OPTIONS = new Set([
  "--disable-compression",
  "--help",
  "--insecure-skip-tls-verify",
  "--match-server-version",
  "--warnings-as-errors",
]);
const NESTED_COMMANDS = new Set(["auth", "config", "rollout"]);

interface ParsedKubectlCommand {
  command?: string;
  error?: string;
}

interface PositionalArgument {
  value?: string;
  nextIndex: number;
  help?: boolean;
  error?: string;
}

function optionName(argument: string): string {
  return argument.split("=", 1)[0];
}

function nextPositional(args: string[], startIndex: number): PositionalArgument {
  let cursor = startIndex;
  while (cursor < args.length) {
    const argument = args[cursor];
    if (argument === "--") {
      return { value: args[cursor + 1], nextIndex: cursor + 2 };
    }
    if (!argument.startsWith("-")) {
      return { value: argument, nextIndex: cursor + 1 };
    }

    const option = optionName(argument);
    if (option === "--help") return { nextIndex: cursor + 1, help: true };
    if (GLOBAL_BOOLEAN_OPTIONS.has(option) || argument.includes("=")) {
      cursor++;
      continue;
    }
    if (GLOBAL_OPTIONS_WITH_VALUE.has(option)) {
      if (cursor + 1 >= args.length) {
        return { nextIndex: cursor + 1, error: `missing value for ${option}` };
      }
      cursor += 2;
      continue;
    }
    if (/^-[nsv].+/.test(argument)) {
      cursor++;
      continue;
    }
    return { nextIndex: cursor + 1, error: `unknown option ${argument}` };
  }
  return { nextIndex: cursor };
}

function parseCommand(args: string[], invocation: KubectlInvocationConfig): ParsedKubectlCommand {
  const kubectlArgs = args.slice(invocation.skipArguments);
  const verb = nextPositional(kubectlArgs, 0);
  if (verb.error) return { error: verb.error };
  if (verb.help) return { command: "help" };
  if (!verb.value) return {};
  if (!NESTED_COMMANDS.has(verb.value)) return { command: verb.value };

  const subcommand = nextPositional(kubectlArgs, verb.nextIndex);
  if (subcommand.error) return { error: subcommand.error };
  if (subcommand.help) return { command: "help" };
  return {
    command: subcommand.value ? `${verb.value} ${subcommand.value}` : verb.value,
  };
}

export const kubectlPolicy = {
  name: "kubectl",
  async guidance({ config }) {
    const { allowedCommands, invocations } = config.kubectl;
    if (invocations.length === 0) return;
    return `Kubectl guardrail: only run these commands through ${invocations.map(({ command }) => command).join(", ")}: ${allowedCommands.join(", ")}. All other kubectl commands are prohibited.`;
  },
  async check(action, { config }) {
    if (action.toolName !== "bash" || typeof action.input.command !== "string") return;
    const { allowedCommands, invocations } = config.kubectl;
    const byCommand = new Map(
      invocations.map((invocation) => [basename(invocation.command), invocation]),
    );
    const allowed = new Set(allowedCommands);

    for (const invocation of findCommandInvocations(
      action.input.command,
      new Set(byCommand.keys()),
    )) {
      const configured = byCommand.get(invocation.command);
      if (!configured) continue;
      const parsed = parseCommand(invocation.args, configured);
      if (parsed.error) {
        return block(
          `Blocked '${invocation.command}': unable to safely classify command (${parsed.error}).`,
        );
      }
      if (!parsed.command || allowed.has(parsed.command)) continue;
      return block(
        `Blocked Kubernetes command '${invocation.command} ${parsed.command}'. Allowed commands: ${allowedCommands.join(", ")}.`,
      );
    }
  },
} satisfies GuardrailPolicy;
