/**
 * Guardrails
 *
 * Central entry point for Pi safety policies. Policies can block configured
 * commands, restrict kubectl to read-oriented operations, and prevent Git
 * commits or pushes involving a repository's default branch.
 *
 * Configure policies under "guardrails" in ~/.pi/agent/settings.json.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { blockedCommandsPolicy } from "./policies/blocked-commands.ts";
import { defaultBranchPolicy } from "./policies/default-branch.ts";
import { kubectlPolicy } from "./policies/kubectl.ts";
import type { GuardrailContext, GuardrailPolicy } from "./policy.ts";

const policies: GuardrailPolicy[] = [blockedCommandsPolicy, defaultBranchPolicy, kubectlPolicy];

async function commandBlockedReason(
  command: string,
  context: GuardrailContext,
): Promise<string | undefined> {
  for (const policy of policies) {
    const reason = await policy.checkCommand(command, context);
    if (reason) return reason;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const guidance = (
      await Promise.all(
        policies.map((policy) => policy.guidance?.({ pi, cwd: ctx.cwd, signal: ctx.signal })),
      )
    ).filter((value): value is string => Boolean(value));
    if (guidance.length === 0) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${guidance.join("\n")}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;

    const reason = await commandBlockedReason(command, {
      pi,
      cwd: ctx.cwd,
      signal: ctx.signal,
    });
    if (reason) return { block: true, reason };
  });

  pi.on("user_bash", async (event, ctx) => {
    const reason = await commandBlockedReason(event.command, {
      pi,
      cwd: event.cwd,
      signal: ctx.signal,
    });
    if (!reason) return;
    ctx.ui.notify(reason, "error");
    return { result: { output: reason, exitCode: 1, cancelled: false, truncated: false } };
  });
}
