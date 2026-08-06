import { actionMutationTargets, matchesPathPattern } from "../path-policy.ts";
import { block, confirm, type GuardrailPolicy } from "../policy.ts";

export const pathsPolicy = {
  name: "paths",
  async guidance({ config }) {
    const parts: string[] = [];
    if (config.paths.blocked.length > 0) {
      parts.push(`never modify paths matching: ${config.paths.blocked.join(", ")}`);
    }
    if (config.paths.confirm.length > 0) {
      parts.push(`ask before modifying paths matching: ${config.paths.confirm.join(", ")}`);
    }
    return parts.length > 0 ? `Path guardrail: ${parts.join("; ")}.` : undefined;
  },
  async check(action, { config, cwd }) {
    for (const target of actionMutationTargets(action.toolName, action.input, cwd)) {
      const blockedPattern = config.paths.blocked.find((pattern) =>
        matchesPathPattern(target, cwd, pattern),
      );
      if (blockedPattern) {
        return block(`Blocked modification of '${target}' by path rule '${blockedPattern}'.`);
      }
      const confirmPattern = config.paths.confirm.find((pattern) =>
        matchesPathPattern(target, cwd, pattern),
      );
      if (confirmPattern) {
        return confirm(
          `Modification of '${target}' matched confirmation rule '${confirmPattern}'.`,
        );
      }
    }
  },
} satisfies GuardrailPolicy;
