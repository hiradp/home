import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  loadBlockedCommandsConfig,
  loadGuardrailsConfig,
  loadKubectlGuardConfig,
} from "../config.ts";
import { blockedCommandsPolicy } from "../policies/blocked-commands.ts";
import { kubectlPolicy } from "../policies/kubectl.ts";
import type { GuardrailPolicy } from "../policy.ts";

const pi = {} as ExtensionAPI;
let tempRoot: string;
let agentDir: string;
let previousAgentDir: string | undefined;

const settings = {
  guardrails: {
    commands: {
      blocked: ["wrangler"],
    },
    kubectl: {
      invocations: [
        { command: "kubectl" },
        { command: "k" },
        { command: "pskube", skipArguments: 1 },
      ],
      allowedCommands: [
        "auth can-i",
        "config current-context",
        "config view",
        "get",
        "logs",
        "rollout history",
        "rollout status",
      ],
    },
  },
};

async function writeSettings(value: unknown = settings): Promise<void> {
  await writeFile(join(agentDir, "settings.json"), JSON.stringify(value));
}

async function check(policy: GuardrailPolicy, command: string): Promise<string | undefined> {
  const { config } = await loadGuardrailsConfig();
  const decision = await policy.check(
    { source: "agent", toolName: "bash", input: { command } },
    { pi, cwd: "/work/project", config, maintenance: false },
  );
  return decision?.reason;
}

before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "pi-command-guardrails-"));
  agentDir = join(tempRoot, "agent");
  await mkdir(agentDir);
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

beforeEach(async () => {
  await writeSettings();
});

after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(tempRoot, { recursive: true, force: true });
});

describe("blocked command guard", () => {
  test("loads blocked commands from settings", async () => {
    assert.deepEqual(await loadBlockedCommandsConfig(), { blockedCommands: ["wrangler"] });
  });

  test("blocks direct and wrapped executable paths", async () => {
    for (const command of [
      "wrangler deploy",
      "./node_modules/.bin/wrangler deploy",
      "command wrangler deploy",
      "env CF_ENV=prod wrangler deploy",
    ]) {
      assert.match((await check(blockedCommandsPolicy, command)) ?? "", /Blocked command/);
    }
  });

  test("blocks package-runner invocations", async () => {
    for (const command of [
      "npx wrangler deploy",
      "npx --yes wrangler@latest deploy",
      "npm exec -- wrangler deploy",
      "pnpm exec wrangler deploy",
      "pnpm dlx wrangler deploy",
      "bunx wrangler deploy",
      "yarn dlx wrangler deploy",
    ]) {
      assert.match((await check(blockedCommandsPolicy, command)) ?? "", /Blocked command/);
    }
  });

  test("does not block a command name used as ordinary text", async () => {
    assert.equal(await check(blockedCommandsPolicy, "echo wrangler deploy"), undefined);
  });
});

describe("kubectl guard", () => {
  test("loads aliases and wrapper argument offsets", async () => {
    assert.deepEqual(await loadKubectlGuardConfig(), {
      invocations: [
        { command: "kubectl", skipArguments: 0 },
        { command: "k", skipArguments: 0 },
        { command: "pskube", skipArguments: 1 },
      ],
      allowedCommands: settings.guardrails.kubectl.allowedCommands,
    });
  });

  test("allows configured read commands through every invocation", async () => {
    for (const command of [
      "kubectl get pods",
      "kubectl --context production get pods",
      "k logs api-0",
      "pskube production get pods",
      "/usr/local/bin/pskube staging rollout status deployment/api",
      "kubectl rollout --namespace production status deployment/api",
      "kubectl config --kubeconfig ~/.kube/config view",
      "kubectl auth can-i create pods",
    ]) {
      assert.equal(await check(kubectlPolicy, command), undefined);
    }
  });

  test("blocks mutating commands through every invocation", async () => {
    for (const command of [
      "kubectl apply -f deployment.yaml",
      "k delete pod api-0",
      "pskube production patch deployment api --patch {}",
      "/usr/local/bin/pskube staging rollout restart deployment/api",
      "kubectl config use-context production",
    ]) {
      assert.match((await check(kubectlPolicy, command)) ?? "", /Blocked Kubernetes command/);
    }
  });

  test("blocks unknown options before the kubectl command", async () => {
    assert.match(
      (await check(kubectlPolicy, "kubectl --future-option get pods")) ?? "",
      /unable to safely classify/,
    );
  });

  test("checks every command in a shell chain", async () => {
    assert.match(
      (await check(kubectlPolicy, "kubectl get pods && k delete pod api-0")) ?? "",
      /Blocked Kubernetes command/,
    );
  });
});
