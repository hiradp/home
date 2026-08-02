import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface GuardSettings {
  guardrails?: {
    commands?: {
      blocked?: unknown;
    };
    defaultBranch?: {
      allowed?: unknown;
    };
    kubectl?: {
      allowedCommands?: unknown;
      invocations?: unknown;
    };
  };
}

export interface BlockedCommandsConfig {
  blockedCommands: string[];
}

export interface DefaultBranchGuardConfig {
  allowedRepositories: string[];
}

export interface KubectlInvocationConfig {
  command: string;
  skipArguments: number;
}

export interface KubectlGuardConfig {
  allowedCommands: string[];
  invocations: KubectlInvocationConfig[];
}

const DEFAULT_KUBECTL_COMMANDS = [
  "api-resources",
  "api-versions",
  "auth can-i",
  "auth whoami",
  "completion",
  "config current-context",
  "config get-contexts",
  "config view",
  "describe",
  "explain",
  "get",
  "help",
  "logs",
  "options",
  "rollout history",
  "rollout status",
  "top",
  "version",
  "wait",
];

async function loadSettings(): Promise<GuardSettings> {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  try {
    return JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8")) as GuardSettings;
  } catch {
    // Invalid or unavailable settings fail closed.
    return {};
  }
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return;
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export async function loadBlockedCommandsConfig(): Promise<BlockedCommandsConfig> {
  const settings = await loadSettings();
  return {
    blockedCommands: stringArray(settings.guardrails?.commands?.blocked) ?? [],
  };
}

export async function loadDefaultBranchGuardConfig(): Promise<DefaultBranchGuardConfig> {
  const settings = await loadSettings();
  return {
    allowedRepositories: stringArray(settings.guardrails?.defaultBranch?.allowed) ?? [],
  };
}

export async function loadKubectlGuardConfig(): Promise<KubectlGuardConfig> {
  const settings = await loadSettings();
  const configuredInvocations = settings.guardrails?.kubectl?.invocations;
  const invocations = Array.isArray(configuredInvocations)
    ? configuredInvocations.flatMap((entry): KubectlInvocationConfig[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const { command, skipArguments = 0 } = entry as {
          command?: unknown;
          skipArguments?: unknown;
        };
        if (
          typeof command !== "string" ||
          command.length === 0 ||
          !Number.isInteger(skipArguments) ||
          (skipArguments as number) < 0
        ) {
          return [];
        }
        return [{ command, skipArguments: skipArguments as number }];
      })
    : [{ command: "kubectl", skipArguments: 0 }];

  return {
    allowedCommands:
      stringArray(settings.guardrails?.kubectl?.allowedCommands) ?? DEFAULT_KUBECTL_COMMANDS,
    invocations,
  };
}
