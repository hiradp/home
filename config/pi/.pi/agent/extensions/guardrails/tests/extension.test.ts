import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import guardrails, { registerGuardrails } from "../index.ts";
import type { SemanticClassifier } from "../semantic-review.ts";

interface FakeRuntime {
  handlers: Map<string, Array<(event: any, ctx: any) => Promise<any>>>;
  commands: Map<string, (args: string, ctx: any) => Promise<void>>;
  entries: Array<{ type: string; customType: string; data: unknown }>;
  notifications: Array<{ message: string; level: string }>;
  pi: ExtensionAPI;
}

let tempRoot: string;
let agentDir: string;
let previousAgentDir: string | undefined;

function createRuntime(): FakeRuntime {
  const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
  const entries: Array<{ type: string; customType: string; data: unknown }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, command.handler);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ type: "custom", customType, data: structuredClone(data) });
    },
    async exec() {
      return { stdout: "", stderr: "", code: 1, killed: false };
    },
  } as unknown as ExtensionAPI;
  return { handlers, commands, entries, notifications, pi };
}

interface ContextOptions {
  hasUI?: boolean;
  confirm?: boolean;
  entries?: unknown[];
  branch?: unknown[];
}

function createContext(runtime: FakeRuntime, options: ContextOptions = {}): ExtensionContext {
  return {
    cwd: tempRoot,
    hasUI: options.hasUI ?? true,
    signal: undefined,
    ui: {
      async confirm() {
        return options.confirm ?? false;
      },
      notify(message: string, level: string) {
        runtime.notifications.push({ message, level });
      },
    },
    sessionManager: {
      getEntries() {
        return options.entries ?? runtime.entries;
      },
      getBranch() {
        return (
          options.branch ?? [
            {
              type: "message",
              message: {
                role: "user",
                content: [{ type: "text", text: "Perform the requested guardrail test." }],
              },
            },
          ]
        );
      },
    },
  } as unknown as ExtensionContext;
}

async function emit(runtime: FakeRuntime, name: string, event: unknown, ctx: ExtensionContext) {
  let result: unknown;
  for (const handler of runtime.handlers.get(name) ?? []) result = await handler(event, ctx);
  return result as any;
}

async function writeSettings(value: unknown): Promise<void> {
  await writeFile(join(agentDir, "settings.json"), JSON.stringify(value));
}

async function start(
  settings: unknown,
  options: ContextOptions & { classifier?: SemanticClassifier } = {},
): Promise<{ runtime: FakeRuntime; ctx: ExtensionContext }> {
  await writeSettings(settings);
  const runtime = createRuntime();
  if (options.classifier) registerGuardrails(runtime.pi, options.classifier);
  else guardrails(runtime.pi);
  const ctx = createContext(runtime, options);
  await emit(runtime, "session_start", { reason: "startup" }, ctx);
  return { runtime, ctx };
}

before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "pi-guardrail-extension-"));
  agentDir = join(tempRoot, "agent");
  await mkdir(agentDir);
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

beforeEach(async () => {
  await writeSettings({ guardrails: {} });
});

after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(tempRoot, { recursive: true, force: true });
});

describe("guardrail extension", { concurrency: false }, () => {
  test("registers its management command", async () => {
    const { runtime } = await start({ guardrails: {} });
    assert.equal(runtime.commands.has("guardrails"), true);
  });

  test("asks for configured path confirmation and records a declined action", async () => {
    const { runtime, ctx } = await start(
      { guardrails: { paths: { confirm: [".env"] } } },
      { confirm: false },
    );
    const result = await emit(
      runtime,
      "tool_call",
      { toolName: "write", input: { path: ".env", content: "secret" } },
      ctx,
    );

    assert.equal(result.block, true);
    assert.match(result.reason, /User declined guardrail confirmation/);
    assert.equal(runtime.entries.length, 1);
    assert.equal(JSON.stringify(runtime.entries[0]).includes("secret"), false);
  });

  test("allows a confirmed path modification once", async () => {
    const { runtime, ctx } = await start(
      { guardrails: { paths: { confirm: [".env"] } } },
      { confirm: true },
    );
    const result = await emit(
      runtime,
      "tool_call",
      { toolName: "write", input: { path: ".env", content: "value" } },
      ctx,
    );
    assert.equal(result, undefined);
    assert.equal(runtime.entries.length, 0);
  });

  test("fails closed for confirmation rules without UI", async () => {
    const { runtime, ctx } = await start(
      { guardrails: { paths: { confirm: [".env"] } } },
      { hasUI: false },
    );
    const result = await emit(
      runtime,
      "tool_call",
      { toolName: "edit", input: { path: ".env" } },
      ctx,
    );
    assert.equal(result.block, true);
    assert.match(result.reason, /No UI is available/);
  });

  test("blocks side effects but permits reads when initial config is invalid", async () => {
    const { runtime, ctx } = await start({ guardrails: { commands: "invalid" } });
    const write = await emit(
      runtime,
      "tool_call",
      { toolName: "write", input: { path: "README.md", content: "x" } },
      ctx,
    );
    const read = await emit(
      runtime,
      "tool_call",
      { toolName: "read", input: { path: "README.md" } },
      ctx,
    );
    assert.equal(write.block, true);
    assert.match(write.reason, /configuration is invalid/);
    assert.equal(read, undefined);
  });

  test("keeps the last known-good config after a failed reload", async () => {
    const { runtime, ctx } = await start({
      guardrails: { commands: { blocked: ["wrangler"] } },
    });
    await writeSettings({ guardrails: { commands: { blocked: "invalid" } } });
    await runtime.commands.get("guardrails")?.("reload", ctx);

    const result = await emit(
      runtime,
      "tool_call",
      { toolName: "bash", input: { command: "wrangler deploy" } },
      ctx,
    );
    assert.equal(result.block, true);
    assert.match(result.reason, /guardrails:blocked-commands/);
    assert.equal(
      runtime.notifications.some((entry) => entry.message.includes("last known-good")),
      true,
    );
  });

  test("maintenance mode unlocks self-protection without disabling command policies", async () => {
    const { runtime, ctx } = await start(
      { guardrails: { commands: { blocked: ["wrangler"] } } },
      { confirm: true },
    );
    const settingsPath = join(agentDir, "settings.json");
    const before = await emit(
      runtime,
      "tool_call",
      { toolName: "edit", input: { path: settingsPath } },
      ctx,
    );
    assert.equal(before.block, true);
    assert.match(before.reason, /self-protection/);

    await runtime.commands.get("guardrails")?.("maintenance 10m", ctx);
    const after = await emit(
      runtime,
      "tool_call",
      { toolName: "edit", input: { path: settingsPath } },
      ctx,
    );
    const blockedCommand = await emit(
      runtime,
      "tool_call",
      { toolName: "bash", input: { command: "wrangler deploy" } },
      ctx,
    );
    assert.equal(after, undefined);
    assert.equal(blockedCommand.block, true);
    assert.match(blockedCommand.reason, /blocked-commands/);
  });

  test("enforces semantic decisions without overriding deterministic blocks", async () => {
    let calls = 0;
    const classifier: SemanticClassifier = async () => {
      calls++;
      return { decision: "allow", reason: "Directly requested.", model: "test/reviewer" };
    };
    const { runtime, ctx } = await start(
      {
        guardrails: {
          commands: { blocked: ["wrangler"] },
          semanticReview: {
            enabled: true,
            mode: "enforce",
            commands: ["gh", "wrangler"],
          },
        },
      },
      { classifier },
    );

    const allowed = await emit(
      runtime,
      "tool_call",
      { toolName: "bash", input: { command: "gh pr view 42" } },
      ctx,
    );
    assert.equal(allowed, undefined);
    assert.equal(calls, 1);

    const blocked = await emit(
      runtime,
      "tool_call",
      { toolName: "bash", input: { command: "wrangler deploy" } },
      ctx,
    );
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /blocked-commands/);
    assert.equal(calls, 1);
  });

  test("keeps shadow semantic decisions advisory and asks the user", async () => {
    const classifier: SemanticClassifier = async () => ({
      decision: "block",
      reason: "The request is ambiguous.",
      model: "test/reviewer",
    });
    const { runtime, ctx } = await start(
      {
        guardrails: {
          semanticReview: { enabled: true, mode: "shadow", commands: ["gh"] },
        },
      },
      { classifier, confirm: true },
    );
    const result = await emit(
      runtime,
      "tool_call",
      { toolName: "bash", input: { command: "gh pr merge 42" } },
      ctx,
    );

    assert.equal(result, undefined);
    assert.equal(
      runtime.notifications.some((entry) => entry.message.includes("suggested 'block'")),
      true,
    );
    assert.equal(runtime.entries.length, 1);
  });

  test("applies command policies to user shell commands", async () => {
    const { runtime, ctx } = await start({
      guardrails: { commands: { blocked: ["wrangler"] } },
    });
    const result = await emit(
      runtime,
      "user_bash",
      { command: "wrangler deploy", cwd: tempRoot, excludeFromContext: false },
      ctx,
    );
    assert.equal(result.result.exitCode, 1);
    assert.match(result.result.output, /blocked-commands/);
  });
});
