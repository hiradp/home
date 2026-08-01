import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface GuardrailContext {
  pi: ExtensionAPI;
  cwd: string;
  signal?: AbortSignal;
}

export interface GuardrailPolicy {
  name: string;
  guidance?(context: GuardrailContext): Promise<string | undefined>;
  checkCommand(command: string, context: GuardrailContext): Promise<string | undefined>;
}
