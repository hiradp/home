import { basename } from "node:path";
import { parseShellSegments, shellSegmentInvocation, shellWords } from "../command-parser.ts";
import { actionMutationTargets, matchesPathPattern } from "../path-policy.ts";
import { review, type GuardrailPolicy } from "../policy.ts";

export function matchesReviewCommand(command: string, pattern: string): boolean {
  const expected = shellWords(pattern).filter((word) => word !== ";");
  if (expected.length === 0) return false;
  const expectedCommand = basename(expected[0]);
  const expectedArguments = expected.slice(1);

  return parseShellSegments(command).some((segment) => {
    const invocation = shellSegmentInvocation(segment);
    if (!invocation || invocation.command !== expectedCommand) return false;
    return expectedArguments.every((argument, index) => invocation.args[index] === argument);
  });
}

export const semanticReviewPolicy = {
  name: "semantic-review",
  async guidance({ config }) {
    if (!config.semanticReview.enabled) return;
    return "Semantic guardrail: selected external-effect commands and sensitive paths require an independent review; deterministic guardrails always take precedence.";
  },
  async check(action, { config, cwd }) {
    if (!config.semanticReview.enabled || action.source !== "agent") return;

    for (const target of actionMutationTargets(action.toolName, action.input, cwd)) {
      const pattern = config.semanticReview.paths.find((candidate) =>
        matchesPathPattern(target, cwd, candidate),
      );
      if (pattern) {
        return review(`Modification of '${target}' matched semantic review rule '${pattern}'.`);
      }
    }

    if (action.toolName !== "bash" || typeof action.input.command !== "string") return;
    const pattern = config.semanticReview.commands.find((candidate) =>
      matchesReviewCommand(action.input.command as string, candidate),
    );
    if (pattern) return review(`Command matched semantic review rule '${pattern}'.`);
  },
} satisfies GuardrailPolicy;
