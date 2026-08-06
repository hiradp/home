import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionMutationTargets, isInside, resolvePathForPolicy } from "../path-policy.ts";
import { block, type GuardrailPolicy } from "../policy.ts";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function protectedLocations(): Array<{ path: string; directory: boolean }> {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return [
    { path: join(agentDir, "settings.json"), directory: false },
    { path: extensionRoot, directory: true },
  ].map((entry) => ({
    ...entry,
    path: resolvePathForPolicy(entry.path) ?? resolve(entry.path),
  }));
}

function protectedTarget(path: string): string | undefined {
  const target = resolvePathForPolicy(path) ?? resolve(path);
  for (const location of protectedLocations()) {
    if (target === location.path || (location.directory && isInside(target, location.path))) {
      return location.path;
    }
  }
}

export const selfProtectionPolicy = {
  name: "self-protection",
  async guidance({ maintenance }) {
    if (maintenance) return "Guardrail maintenance mode is active for this session.";
    return "Guardrail safety controls are protected from modification. Do not edit Pi guardrail settings or extension sources.";
  },
  async check(action, { cwd, maintenance }) {
    if (maintenance) return;
    for (const target of actionMutationTargets(action.toolName, action.input, cwd)) {
      const protectedPath = protectedTarget(target);
      if (protectedPath) {
        return block(`Blocked modification of guardrail safety controls at '${protectedPath}'.`);
      }
    }
  },
} satisfies GuardrailPolicy;
