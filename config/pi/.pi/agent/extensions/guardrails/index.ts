/**
 * Guardrails
 *
 * Central entry point for Pi safety policies. The default-branch policy blocks
 * Git commits and pushes while a repository is on its default branch. Pushes
 * that explicitly target a default branch are blocked too.
 *
 * Repositories or entire owners can be exempted in ~/.pi/agent/settings.json:
 *   "guardrails": { "defaultBranch": { "allowed": ["owner/repo", "owner/*"] } }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defaultBranchPolicy } from "./policies/default-branch.ts";
import type { GuardrailContext, GuardrailPolicy } from "./policy.ts";

const policies: GuardrailPolicy[] = [defaultBranchPolicy];

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
