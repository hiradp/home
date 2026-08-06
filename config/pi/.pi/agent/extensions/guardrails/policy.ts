import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GuardrailsConfig } from "./config.ts";

export type GuardrailAction =
  | {
      source: "agent";
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      source: "user";
      toolName: "bash";
      input: { command: string };
    };

export type GuardrailOutcome = "allow" | "review" | "confirm" | "block";

export interface GuardrailDecision {
  outcome: GuardrailOutcome;
  reason: string;
}

export interface GuardrailContext {
  pi: ExtensionAPI;
  cwd: string;
  config: GuardrailsConfig;
  maintenance: boolean;
  signal?: AbortSignal;
}

export interface GuardrailPolicy {
  name: string;
  guidance?(context: GuardrailContext): Promise<string | undefined>;
  check(action: GuardrailAction, context: GuardrailContext): Promise<GuardrailDecision | undefined>;
}

export function block(reason: string): GuardrailDecision {
  return { outcome: "block", reason };
}

export function confirm(reason: string): GuardrailDecision {
  return { outcome: "confirm", reason };
}

export function review(reason: string): GuardrailDecision {
  return { outcome: "review", reason };
}
