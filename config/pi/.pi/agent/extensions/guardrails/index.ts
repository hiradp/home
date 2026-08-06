/**
 * Guardrails
 *
 * Deterministic safety policies for agent tools and user shell commands.
 * Configure policy data under "guardrails" in ~/.pi/agent/settings.json.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_GUARDRAILS_CONFIG,
  loadGuardrailsConfig,
  type GuardrailsConfig,
} from "./config.ts";
import { blockedCommandsPolicy } from "./policies/blocked-commands.ts";
import { defaultBranchPolicy } from "./policies/default-branch.ts";
import { kubectlPolicy } from "./policies/kubectl.ts";
import { pathsPolicy } from "./policies/paths.ts";
import { selfProtectionPolicy } from "./policies/self-protection.ts";
import { semanticReviewPolicy } from "./policies/semantic-review.ts";
import { systemSafetyPolicy } from "./policies/system-safety.ts";
import type {
  GuardrailAction,
  GuardrailContext,
  GuardrailDecision,
  GuardrailPolicy,
} from "./policy.ts";
import {
  actionSummary,
  emptyState,
  formatDenials,
  formatSemanticReviews,
  recordDenial,
  recordSemanticReview,
  restoreState,
  type GuardrailState,
} from "./state.ts";
import {
  classifySemanticAction,
  latestDirectUserInstruction,
  type SemanticClassifier,
} from "./semantic-review.ts";

const policies: GuardrailPolicy[] = [
  selfProtectionPolicy,
  systemSafetyPolicy,
  blockedCommandsPolicy,
  defaultBranchPolicy,
  kubectlPolicy,
  pathsPolicy,
  semanticReviewPolicy,
];
const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const PRIORITY: Record<GuardrailDecision["outcome"], number> = {
  allow: 0,
  review: 1,
  confirm: 2,
  block: 3,
};

interface PolicyDecision {
  policy: string;
  decision: GuardrailDecision;
}

function copyDefaultConfig(): GuardrailsConfig {
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

function asInput(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function registerGuardrails(
  pi: ExtensionAPI,
  semanticClassifier: SemanticClassifier = classifySemanticAction,
) {
  let config = copyDefaultConfig();
  let configSource = "~/.pi/agent/settings.json";
  let configDiagnostics: string[] = [];
  let hasValidConfig = false;
  let staleConfig = false;
  let maintenanceUntil = 0;
  let state: GuardrailState = emptyState();

  const maintenanceActive = () => maintenanceUntil > Date.now();

  async function reloadConfig(): Promise<boolean> {
    const result = await loadGuardrailsConfig();
    configSource = result.source;
    configDiagnostics = result.diagnostics;
    if (result.valid) {
      config = result.config;
      hasValidConfig = true;
      staleConfig = false;
      return true;
    }
    staleConfig = hasValidConfig;
    if (!hasValidConfig) config = result.config;
    return false;
  }

  function context(ctx: ExtensionContext, cwd = ctx.cwd): GuardrailContext {
    return {
      pi,
      cwd,
      config,
      maintenance: maintenanceActive(),
      signal: ctx.signal,
    };
  }

  async function evaluate(
    action: GuardrailAction,
    ctx: ExtensionContext,
    cwd = ctx.cwd,
  ): Promise<PolicyDecision | undefined> {
    if (!hasValidConfig && !READ_ONLY_TOOLS.has(action.toolName)) {
      return {
        policy: "configuration",
        decision: {
          outcome: "block",
          reason:
            "Guardrails configuration is invalid and no last-known-good configuration is available.",
        },
      };
    }

    let selected: PolicyDecision | undefined;
    for (const policy of policies) {
      let decision: GuardrailDecision | undefined;
      try {
        decision = await policy.check(action, context(ctx, cwd));
      } catch (error) {
        decision = {
          outcome: "block",
          reason: `Guardrail policy '${policy.name}' failed closed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (!decision) continue;
      if (!selected || PRIORITY[decision.outcome] > PRIORITY[selected.decision.outcome]) {
        selected = { policy: policy.name, decision };
      }
      if (decision.outcome === "block") break;
    }
    return selected;
  }

  async function resolveDecision(
    action: GuardrailAction,
    ctx: ExtensionContext,
    cwd = ctx.cwd,
  ): Promise<PolicyDecision | undefined> {
    let result = await evaluate(action, ctx, cwd);
    if (!result || result.decision.outcome === "allow") return;
    if (result.decision.outcome === "block") return result;

    if (
      result.decision.outcome === "review" &&
      result.policy === semanticReviewPolicy.name &&
      config.semanticReview.enabled
    ) {
      try {
        const semantic = await semanticClassifier(
          {
            action,
            requestingPolicy: result.policy,
            policyReason: result.decision.reason,
            cwd,
            latestUserInstruction: latestDirectUserInstruction(ctx),
            config: config.semanticReview,
          },
          ctx,
        );
        recordSemanticReview(pi, state, {
          timestamp: Date.now(),
          mode: config.semanticReview.mode,
          decision: semantic.decision,
          model: semantic.model,
          reason: semantic.reason,
          action: actionSummary(action),
        });

        if (config.semanticReview.mode === "enforce") {
          if (semantic.decision === "allow") return;
          result = {
            policy: semanticReviewPolicy.name,
            decision: {
              outcome: semantic.decision,
              reason: `Semantic review: ${semantic.reason}`,
            },
          };
          if (semantic.decision === "block") return result;
        } else {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `Semantic shadow review suggested '${semantic.decision}': ${semantic.reason}`,
              semantic.decision === "block" ? "warning" : "info",
            );
          }
          result = {
            ...result,
            decision: {
              outcome: "review",
              reason: `${result.decision.reason}\nSemantic shadow suggestion: ${semantic.decision} — ${semantic.reason}`,
            },
          };
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordSemanticReview(pi, state, {
          timestamp: Date.now(),
          mode: config.semanticReview.mode,
          decision: "error",
          model: config.semanticReview.model ?? "active model",
          reason,
          action: actionSummary(action),
        });
        result = {
          ...result,
          decision: {
            outcome: "review",
            reason: `${result.decision.reason}\nSemantic classifier unavailable (${reason}); falling back to user confirmation.`,
          },
        };
      }
    }

    if (!ctx.hasUI) {
      return {
        policy: result.policy,
        decision: {
          outcome: "block",
          reason: `${result.decision.reason} No UI is available for confirmation.`,
        },
      };
    }

    const title =
      result.decision.outcome === "review"
        ? "Guardrail review requires approval"
        : "Guardrail confirmation";
    const allowed = await ctx.ui.confirm(
      title,
      `${result.decision.reason}\n\nAction:\n${actionSummary(action)}\n\nAllow once?`,
      { signal: ctx.signal },
    );
    if (allowed) return;
    return {
      policy: result.policy,
      decision: {
        outcome: "block",
        reason: `User declined guardrail confirmation: ${result.decision.reason}`,
      },
    };
  }

  function recordBlock(
    action: GuardrailAction,
    result: PolicyDecision,
    ctx: ExtensionContext,
  ): string {
    const reason = result.decision.reason;
    recordDenial(pi, state, {
      timestamp: Date.now(),
      policy: result.policy,
      source: action.source,
      toolName: action.toolName,
      reason,
      action: actionSummary(action),
    });
    if (ctx.hasUI) ctx.ui.notify(`Guardrail blocked ${action.toolName}: ${reason}`, "warning");
    return `[guardrails:${result.policy}] ${reason}`;
  }

  pi.on("session_start", async (_event, ctx) => {
    await reloadConfig();
    state = restoreState(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const guidance = (
      await Promise.all(policies.map((policy) => policy.guidance?.(context(ctx))))
    ).filter((value): value is string => Boolean(value));
    if (!hasValidConfig) {
      guidance.unshift(
        "Guardrails configuration is invalid. Read-only inspection is allowed, but side-effecting actions are blocked until the configuration is fixed.",
      );
    } else if (staleConfig) {
      guidance.unshift(
        "The latest guardrails configuration is invalid; enforcement is using the last known-good configuration.",
      );
    }
    if (guidance.length === 0) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance.join("\n")}` };
  });

  pi.on("tool_call", async (event, ctx) => {
    const action: GuardrailAction = {
      source: "agent",
      toolName: event.toolName,
      input: asInput(event.input),
    };
    const result = await resolveDecision(action, ctx);
    if (result) return { block: true, reason: recordBlock(action, result, ctx) };
  });

  pi.on("user_bash", async (event, ctx) => {
    const action: GuardrailAction = {
      source: "user",
      toolName: "bash",
      input: { command: event.command },
    };
    const result = await resolveDecision(action, ctx, event.cwd);
    if (!result) return;
    const reason = recordBlock(action, result, ctx);
    return { result: { output: reason, exitCode: 1, cancelled: false, truncated: false } };
  });

  async function handleCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const [command = "status", value] = args.trim().split(/\s+/).filter(Boolean);

    if (command === "status") {
      const remaining = maintenanceActive()
        ? `${Math.max(1, Math.ceil((maintenanceUntil - Date.now()) / 60_000))}m remaining`
        : "off";
      ctx.ui.notify(
        [
          `config: ${hasValidConfig ? (staleConfig ? "last-known-good" : "valid") : "invalid"}`,
          `source: ${configSource}`,
          `maintenance: ${remaining}`,
          `semantic review: ${config.semanticReview.enabled ? config.semanticReview.mode : "off"}`,
          `semantic reviews: ${state.semanticReviews}`,
          `blocked actions: ${state.blockedActions}`,
          `policies: ${policies.map((policy) => policy.name).join(", ")}`,
          `diagnostics: ${configDiagnostics.length}`,
        ].join("\n"),
        hasValidConfig ? "info" : "warning",
      );
      return;
    }

    if (command === "config") {
      ctx.ui.notify(
        JSON.stringify(
          {
            source: configSource,
            valid: hasValidConfig && !staleConfig,
            usingLastKnownGood: staleConfig,
            diagnostics: configDiagnostics,
            config,
          },
          null,
          2,
        ),
        configDiagnostics.length > 0 ? "warning" : "info",
      );
      return;
    }

    if (command === "reload") {
      const valid = await reloadConfig();
      ctx.ui.notify(
        valid
          ? "Guardrails configuration reloaded."
          : staleConfig
            ? "Invalid configuration; continuing with the last known-good version."
            : "Invalid configuration; side-effecting actions are blocked.",
        valid ? "info" : "warning",
      );
      return;
    }

    if (command === "denials") {
      ctx.ui.notify(formatDenials(state), state.recentDenials.length > 0 ? "warning" : "info");
      return;
    }

    if (command === "reviews") {
      ctx.ui.notify(
        formatSemanticReviews(state),
        state.recentSemanticReviews.some(
          (review) => review.decision === "block" || review.decision === "error",
        )
          ? "warning"
          : "info",
      );
      return;
    }

    if (command === "reset") {
      state = emptyState();
      pi.appendEntry("pi-guardrails-state", state);
      ctx.ui.notify("Guardrail denial history reset.", "info");
      return;
    }

    if (command === "maintenance") {
      if (value === "off") {
        maintenanceUntil = 0;
        ctx.ui.notify("Guardrail maintenance mode disabled.", "info");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("Maintenance mode requires an interactive confirmation.", "error");
        return;
      }
      const match = (value ?? "10m").match(/^(\d+)(m|h)?$/);
      const amount = Number(match?.[1]);
      const unit = match?.[2] ?? "m";
      const minutes = unit === "h" ? amount * 60 : amount;
      if (!match || !Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
        ctx.ui.notify("Usage: /guardrails maintenance [1m-60m|off]", "error");
        return;
      }
      const confirmed = await ctx.ui.confirm(
        "Enable guardrail maintenance mode?",
        `Self-protection will be disabled for ${minutes} minute${minutes === 1 ? "" : "s"}. Other policies remain active.`,
      );
      if (!confirmed) return;
      maintenanceUntil = Date.now() + minutes * 60_000;
      ctx.ui.notify(`Guardrail maintenance mode enabled for ${minutes}m.`, "warning");
      return;
    }

    ctx.ui.notify(
      "Usage: /guardrails [status|config|reload|denials|reviews|reset|maintenance [1m-60m|off]]",
      "error",
    );
  }

  pi.registerCommand("guardrails", {
    description: "Inspect and control deterministic and semantic guardrails",
    handler: handleCommand,
  });
}

export default registerGuardrails;
