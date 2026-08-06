import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GuardrailAction } from "./policy.ts";

const HISTORY_LIMIT = 12;
const STATE_ENTRY = "pi-guardrails-state";

export interface GuardrailDenial {
  timestamp: number;
  policy: string;
  source: GuardrailAction["source"];
  toolName: string;
  reason: string;
  action: string;
}

export interface SemanticReviewRecord {
  timestamp: number;
  mode: "shadow" | "enforce";
  decision: "allow" | "confirm" | "block" | "error";
  model: string;
  reason: string;
  action: string;
}

export interface GuardrailState {
  blockedActions: number;
  semanticReviews: number;
  recentDenials: GuardrailDenial[];
  recentSemanticReviews: SemanticReviewRecord[];
}

export function emptyState(): GuardrailState {
  return {
    blockedActions: 0,
    semanticReviews: 0,
    recentDenials: [],
    recentSemanticReviews: [],
  };
}

function truncate(value: string, maxLength = 500): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function redactCommand(value: string): string {
  return value
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|AUTH)[A-Za-z0-9_]*)\s*=\s*([^\s;&|]+)/gi,
      "$1=<redacted>",
    )
    .replace(
      /(\s--?(?:token|secret|password|passwd|api-key|private-key|authorization)(?:=|\s+))([^\s;&|]+)/gi,
      "$1<redacted>",
    )
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[opusr]_[A-Za-z0-9_-]{12,})\b/g, "<redacted-token>")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/g, "$1<redacted>@");
}

/** Summarize an action without persisting file contents or arbitrary tool payload values. */
export function actionSummary(action: GuardrailAction): string {
  if (action.toolName === "bash" && typeof action.input.command === "string") {
    return `bash ${truncate(redactCommand(action.input.command))}`;
  }
  const input = action.input as Record<string, unknown>;
  if (typeof input.path === "string") {
    return `${action.toolName} ${truncate(input.path)}`;
  }
  return `${action.toolName} fields=[${Object.keys(action.input).sort().join(", ")}]`;
}

export function recordDenial(
  pi: ExtensionAPI,
  state: GuardrailState,
  denial: GuardrailDenial,
): void {
  state.blockedActions++;
  state.recentDenials = [...state.recentDenials.slice(-(HISTORY_LIMIT - 1)), denial];
  pi.appendEntry(STATE_ENTRY, state);
}

export function recordSemanticReview(
  pi: ExtensionAPI,
  state: GuardrailState,
  review: SemanticReviewRecord,
): void {
  state.semanticReviews++;
  state.recentSemanticReviews = [
    ...state.recentSemanticReviews.slice(-(HISTORY_LIMIT - 1)),
    review,
  ];
  pi.appendEntry(STATE_ENTRY, state);
}

export function restoreState(ctx: ExtensionContext): GuardrailState {
  const entries = ctx.sessionManager.getEntries();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index] as {
      type?: string;
      customType?: string;
      data?: Partial<GuardrailState>;
    };
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY || !entry.data) continue;
    return {
      blockedActions: entry.data.blockedActions ?? 0,
      semanticReviews: entry.data.semanticReviews ?? 0,
      recentDenials: Array.isArray(entry.data.recentDenials)
        ? entry.data.recentDenials.slice(-HISTORY_LIMIT)
        : [],
      recentSemanticReviews: Array.isArray(entry.data.recentSemanticReviews)
        ? entry.data.recentSemanticReviews.slice(-HISTORY_LIMIT)
        : [],
    };
  }
  return emptyState();
}

export function formatDenials(state: GuardrailState): string {
  if (state.recentDenials.length === 0) return "No recent guardrail denials.";
  return state.recentDenials
    .slice()
    .reverse()
    .map(
      (denial) =>
        `${new Date(denial.timestamp).toLocaleTimeString()} ${denial.policy} ${denial.toolName} (${denial.source})\n${denial.reason}\n  ${denial.action}`,
    )
    .join("\n\n");
}

export function formatSemanticReviews(state: GuardrailState): string {
  if (state.recentSemanticReviews.length === 0) return "No recent semantic reviews.";
  return state.recentSemanticReviews
    .slice()
    .reverse()
    .map(
      (review) =>
        `${new Date(review.timestamp).toLocaleTimeString()} ${review.mode}/${review.decision} ${review.model}\n${review.reason}\n  ${review.action}`,
    )
    .join("\n\n");
}
