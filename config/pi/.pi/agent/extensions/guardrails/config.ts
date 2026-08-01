import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface GuardSettings {
  guardrails?: {
    defaultBranch?: {
      allowed?: unknown;
    };
  };
}

export interface DefaultBranchGuardConfig {
  allowedRepositories: string[];
}

export async function loadDefaultBranchGuardConfig(): Promise<DefaultBranchGuardConfig> {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  try {
    const settings = JSON.parse(
      await readFile(join(agentDir, "settings.json"), "utf8"),
    ) as GuardSettings;
    const configured = settings.guardrails?.defaultBranch?.allowed;
    return {
      allowedRepositories: Array.isArray(configured)
        ? configured.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    // Invalid or unavailable settings fail closed.
    return { allowedRepositories: [] };
  }
}
