import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface GuardSettings {
  guardrails?: unknown;
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

export interface PathGuardConfig {
  blocked: string[];
  confirm: string[];
}

export type SemanticReviewMode = "shadow" | "enforce";

export interface SemanticReviewConfig {
  enabled: boolean;
  mode: SemanticReviewMode;
  model?: string;
  timeoutMs: number;
  commands: string[];
  paths: string[];
}

export interface GuardrailsConfig {
  commands: BlockedCommandsConfig;
  defaultBranch: DefaultBranchGuardConfig;
  kubectl: KubectlGuardConfig;
  paths: PathGuardConfig;
  semanticReview: SemanticReviewConfig;
}

export interface GuardrailsConfigLoadResult {
  config: GuardrailsConfig;
  diagnostics: string[];
  valid: boolean;
  source: string;
}

export const DEFAULT_KUBECTL_COMMANDS = [
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

export const DEFAULT_GUARDRAILS_CONFIG: GuardrailsConfig = {
  commands: { blockedCommands: [] },
  defaultBranch: { allowedRepositories: [] },
  kubectl: {
    allowedCommands: DEFAULT_KUBECTL_COMMANDS,
    invocations: [{ command: "kubectl", skipArguments: 0 }],
  },
  paths: { blocked: [], confirm: [] },
  semanticReview: {
    enabled: false,
    mode: "shadow",
    timeoutMs: 15_000,
    commands: [],
    paths: [],
  },
};

function copyDefaults(): GuardrailsConfig {
  return {
    commands: { blockedCommands: [...DEFAULT_GUARDRAILS_CONFIG.commands.blockedCommands] },
    defaultBranch: {
      allowedRepositories: [...DEFAULT_GUARDRAILS_CONFIG.defaultBranch.allowedRepositories],
    },
    kubectl: {
      allowedCommands: [...DEFAULT_GUARDRAILS_CONFIG.kubectl.allowedCommands],
      invocations: DEFAULT_GUARDRAILS_CONFIG.kubectl.invocations.map((entry) => ({ ...entry })),
    },
    paths: {
      blocked: [...DEFAULT_GUARDRAILS_CONFIG.paths.blocked],
      confirm: [...DEFAULT_GUARDRAILS_CONFIG.paths.confirm],
    },
    semanticReview: {
      ...DEFAULT_GUARDRAILS_CONFIG.semanticReview,
      commands: [...DEFAULT_GUARDRAILS_CONFIG.semanticReview.commands],
      paths: [...DEFAULT_GUARDRAILS_CONFIG.semanticReview.paths],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(
  value: unknown,
  key: string,
  diagnostics: string[],
): { value?: string[]; valid: boolean } {
  if (value === undefined) return { valid: true };
  if (!Array.isArray(value)) {
    diagnostics.push(`${key} must be an array of non-empty strings.`);
    return { valid: false };
  }
  const result: string[] = [];
  let valid = true;
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      diagnostics.push(`${key}[${index}] must be a non-empty string.`);
      valid = false;
      continue;
    }
    result.push(entry);
  }
  return { value: result, valid };
}

function objectSection(
  root: Record<string, unknown>,
  key: string,
  diagnostics: string[],
): { value?: Record<string, unknown>; valid: boolean } {
  const value = root[key];
  if (value === undefined) return { valid: true };
  if (!isRecord(value)) {
    diagnostics.push(`guardrails.${key} must be an object.`);
    return { valid: false };
  }
  return { value, valid: true };
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix: string,
  diagnostics: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) diagnostics.push(`Unknown ${prefix}.${key} setting; it is ignored.`);
  }
}

export function parseGuardrailsSettings(
  settings: unknown,
  source = "settings.json",
): GuardrailsConfigLoadResult {
  const config = copyDefaults();
  const diagnostics: string[] = [];
  let valid = true;

  if (!isRecord(settings)) {
    return {
      config,
      diagnostics: [`${source}: root must be a JSON object.`],
      valid: false,
      source,
    };
  }

  const rawGuardrails = (settings as GuardSettings).guardrails;
  if (rawGuardrails === undefined) return { config, diagnostics, valid, source };
  if (!isRecord(rawGuardrails)) {
    return {
      config,
      diagnostics: [`${source}: guardrails must be an object.`],
      valid: false,
      source,
    };
  }

  unknownKeys(
    rawGuardrails,
    new Set(["commands", "defaultBranch", "kubectl", "paths", "semanticReview"]),
    "guardrails",
    diagnostics,
  );

  const commands = objectSection(rawGuardrails, "commands", diagnostics);
  valid &&= commands.valid;
  if (commands.value) {
    unknownKeys(commands.value, new Set(["blocked"]), "guardrails.commands", diagnostics);
    const blocked = stringArray(commands.value.blocked, "guardrails.commands.blocked", diagnostics);
    valid &&= blocked.valid;
    if (blocked.value) config.commands.blockedCommands = blocked.value;
  }

  const defaultBranch = objectSection(rawGuardrails, "defaultBranch", diagnostics);
  valid &&= defaultBranch.valid;
  if (defaultBranch.value) {
    unknownKeys(defaultBranch.value, new Set(["allowed"]), "guardrails.defaultBranch", diagnostics);
    const allowed = stringArray(
      defaultBranch.value.allowed,
      "guardrails.defaultBranch.allowed",
      diagnostics,
    );
    valid &&= allowed.valid;
    if (allowed.value) config.defaultBranch.allowedRepositories = allowed.value;
  }

  const kubectl = objectSection(rawGuardrails, "kubectl", diagnostics);
  valid &&= kubectl.valid;
  if (kubectl.value) {
    unknownKeys(
      kubectl.value,
      new Set(["allowedCommands", "invocations"]),
      "guardrails.kubectl",
      diagnostics,
    );
    const allowedCommands = stringArray(
      kubectl.value.allowedCommands,
      "guardrails.kubectl.allowedCommands",
      diagnostics,
    );
    valid &&= allowedCommands.valid;
    if (allowedCommands.value) config.kubectl.allowedCommands = allowedCommands.value;

    if (kubectl.value.invocations !== undefined) {
      if (!Array.isArray(kubectl.value.invocations)) {
        diagnostics.push("guardrails.kubectl.invocations must be an array of objects.");
        valid = false;
      } else {
        const invocations: KubectlInvocationConfig[] = [];
        for (const [index, entry] of kubectl.value.invocations.entries()) {
          if (!isRecord(entry)) {
            diagnostics.push(`guardrails.kubectl.invocations[${index}] must be an object.`);
            valid = false;
            continue;
          }
          unknownKeys(
            entry,
            new Set(["command", "skipArguments"]),
            `guardrails.kubectl.invocations[${index}]`,
            diagnostics,
          );
          const { command, skipArguments = 0 } = entry;
          if (
            typeof command !== "string" ||
            command.length === 0 ||
            !Number.isInteger(skipArguments) ||
            (skipArguments as number) < 0
          ) {
            diagnostics.push(
              `guardrails.kubectl.invocations[${index}] requires a command and a non-negative integer skipArguments.`,
            );
            valid = false;
            continue;
          }
          invocations.push({ command, skipArguments: skipArguments as number });
        }
        config.kubectl.invocations = invocations;
      }
    }
  }

  const paths = objectSection(rawGuardrails, "paths", diagnostics);
  valid &&= paths.valid;
  if (paths.value) {
    unknownKeys(paths.value, new Set(["blocked", "confirm"]), "guardrails.paths", diagnostics);
    const blocked = stringArray(paths.value.blocked, "guardrails.paths.blocked", diagnostics);
    const confirm = stringArray(paths.value.confirm, "guardrails.paths.confirm", diagnostics);
    valid &&= blocked.valid && confirm.valid;
    if (blocked.value) config.paths.blocked = blocked.value;
    if (confirm.value) config.paths.confirm = confirm.value;
  }

  const semanticReview = objectSection(rawGuardrails, "semanticReview", diagnostics);
  valid &&= semanticReview.valid;
  if (semanticReview.value) {
    unknownKeys(
      semanticReview.value,
      new Set(["enabled", "mode", "model", "timeoutMs", "commands", "paths"]),
      "guardrails.semanticReview",
      diagnostics,
    );
    const { enabled, mode, model, timeoutMs } = semanticReview.value;
    if (enabled !== undefined && typeof enabled !== "boolean") {
      diagnostics.push("guardrails.semanticReview.enabled must be a boolean.");
      valid = false;
    } else if (enabled !== undefined) {
      config.semanticReview.enabled = enabled;
    }
    if (mode !== undefined && mode !== "shadow" && mode !== "enforce") {
      diagnostics.push("guardrails.semanticReview.mode must be 'shadow' or 'enforce'.");
      valid = false;
    } else if (mode !== undefined) {
      config.semanticReview.mode = mode;
    }
    if (model !== undefined && (typeof model !== "string" || !/^[^/\s]+\/.+/.test(model.trim()))) {
      diagnostics.push("guardrails.semanticReview.model must be a provider/model string.");
      valid = false;
    } else if (typeof model === "string") {
      config.semanticReview.model = model.trim();
    }
    if (
      timeoutMs !== undefined &&
      (!Number.isInteger(timeoutMs) ||
        (timeoutMs as number) < 1_000 ||
        (timeoutMs as number) > 60_000)
    ) {
      diagnostics.push(
        "guardrails.semanticReview.timeoutMs must be an integer from 1000 to 60000.",
      );
      valid = false;
    } else if (typeof timeoutMs === "number") {
      config.semanticReview.timeoutMs = timeoutMs;
    }
    const commands = stringArray(
      semanticReview.value.commands,
      "guardrails.semanticReview.commands",
      diagnostics,
    );
    const reviewPaths = stringArray(
      semanticReview.value.paths,
      "guardrails.semanticReview.paths",
      diagnostics,
    );
    valid &&= commands.valid && reviewPaths.valid;
    if (commands.value) config.semanticReview.commands = commands.value;
    if (reviewPaths.value) config.semanticReview.paths = reviewPaths.value;
  }

  return {
    config,
    diagnostics: diagnostics.map((message) => `${source}: ${message}`),
    valid,
    source,
  };
}

export async function loadGuardrailsConfig(): Promise<GuardrailsConfigLoadResult> {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const source = join(agentDir, "settings.json");
  try {
    return parseGuardrailsSettings(JSON.parse(await readFile(source, "utf8")), source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: copyDefaults(), diagnostics: [], valid: true, source };
    }
    return {
      config: copyDefaults(),
      diagnostics: [
        `${source}: unable to load guardrails configuration (${error instanceof Error ? error.message : String(error)}).`,
      ],
      valid: false,
      source,
    };
  }
}

export async function loadBlockedCommandsConfig(): Promise<BlockedCommandsConfig> {
  return (await loadGuardrailsConfig()).config.commands;
}

export async function loadDefaultBranchGuardConfig(): Promise<DefaultBranchGuardConfig> {
  return (await loadGuardrailsConfig()).config.defaultBranch;
}

export async function loadKubectlGuardConfig(): Promise<KubectlGuardConfig> {
  return (await loadGuardrailsConfig()).config.kubectl;
}
