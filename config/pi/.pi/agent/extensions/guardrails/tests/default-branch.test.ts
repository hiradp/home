import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGitInvocations } from "../command-parser.ts";
import { loadDefaultBranchGuardConfig, loadGuardrailsConfig } from "../config.ts";
import { defaultBranchPolicy } from "../policies/default-branch.ts";

const pi = {
  async exec(command: string, args: string[], options?: { cwd?: string }) {
    const result = spawnSync(command, args, {
      cwd: options?.cwd,
      encoding: "utf8",
      timeout: 3000,
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: result.status ?? 1,
      killed: result.signal !== null,
    };
  },
} as unknown as ExtensionAPI;

let tempRoot: string;
let agentDir: string;
let previousAgentDir: string | undefined;

async function configureAllowed(allowed: string[]): Promise<void> {
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({ guardrails: { defaultBranch: { allowed } } }),
  );
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

async function createRepository(remoteOwner = "someone-else"): Promise<string> {
  const cwd = await mkdtemp(join(tempRoot, "repo-"));
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.name", "Guardrails Test");
  git(cwd, "config", "user.email", "guardrails@example.com");
  await writeFile(join(cwd, "README.md"), "fixture\n");
  git(cwd, "add", "README.md");
  git(cwd, "commit", "-m", "fixture");
  git(cwd, "remote", "add", "origin", `git@github.com:${remoteOwner}/fixture.git`);
  return cwd;
}

async function guardContext(cwd: string) {
  const { config } = await loadGuardrailsConfig();
  return { pi, cwd, config, maintenance: false };
}

async function check(command: string, cwd: string): Promise<string | undefined> {
  const decision = await defaultBranchPolicy.check(
    { source: "agent", toolName: "bash", input: { command } },
    await guardContext(cwd),
  );
  return decision?.reason;
}

describe("default branch guard", { concurrency: false }, () => {
  before(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "pi-guardrails-"));
    agentDir = join(tempRoot, "agent");
    await mkdir(agentDir);
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  beforeEach(async () => {
    await configureAllowed([]);
  });

  after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("loads the nested guardrails configuration", async () => {
    await configureAllowed(["hiradp/*", "other/repo"]);
    assert.deepEqual(await loadDefaultBranchGuardConfig(), {
      allowedRepositories: ["hiradp/*", "other/repo"],
    });
  });

  test("ignores the retired top-level configuration", async () => {
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ defaultBranchGuard: { allowed: ["hiradp/*"] } }),
    );
    assert.deepEqual(await loadDefaultBranchGuardConfig(), { allowedRepositories: [] });
  });

  test("blocks commits and pushes from a default branch", async () => {
    const cwd = await createRepository();
    assert.match((await check("git commit -m test", cwd)) ?? "", /Blocked git commit/);
    assert.match((await check("git push origin feature", cwd)) ?? "", /Blocked git push/);
  });

  test("allows commits and feature pushes from a feature branch", async () => {
    const cwd = await createRepository();
    git(cwd, "switch", "-c", "feature");
    assert.equal(await check("git commit -m test", cwd), undefined);
    assert.equal(await check("git push origin feature", cwd), undefined);
  });

  test("blocks an explicit default-branch push from a feature branch", async () => {
    const cwd = await createRepository();
    git(cwd, "switch", "-c", "feature");
    assert.match((await check("git push origin HEAD:main", cwd)) ?? "", /Blocked git push/);
    assert.match(
      (await check("git push origin HEAD:refs/heads/main", cwd)) ?? "",
      /Blocked git push/,
    );
  });

  test("resolves git aliases before evaluating them", async () => {
    const cwd = await createRepository();
    git(cwd, "config", "alias.ci", "commit");
    git(cwd, "config", "alias.publish", "!git push origin main");
    assert.match((await check("git ci -m test", cwd)) ?? "", /Blocked git commit/);
    assert.match((await check("git publish", cwd)) ?? "", /Blocked git push/);
  });

  test("allows repositories matching an owner wildcard", async () => {
    const cwd = await createRepository("hiradp");
    await configureAllowed(["hiradp/*"]);
    assert.equal(await check("git commit -m test", cwd), undefined);
    assert.equal(await defaultBranchPolicy.guidance?.(await guardContext(cwd)), undefined);
  });

  test("does not allow repositories owned by someone else", async () => {
    const cwd = await createRepository("not-hiradp");
    await configureAllowed(["hiradp/*"]);
    assert.match((await check("git commit -m test", cwd)) ?? "", /Blocked git commit/);
  });
});

describe("git command parsing", () => {
  test("finds chained, wrapped, and -C git invocations", () => {
    const invocations = findGitInvocations(
      "echo ok && command git -C ../repo commit -m test; env FOO=bar git push origin main",
      "/work/project",
    );

    assert.deepEqual(invocations, [
      {
        cwd: "/work/repo",
        subcommand: "commit",
        args: ["-m", "test"],
      },
      {
        cwd: "/work/project",
        subcommand: "push",
        args: ["origin", "main"],
      },
    ]);
  });

  test("does not treat ordinary arguments as git commands", () => {
    assert.deepEqual(findGitInvocations("echo git commit", "/work/project"), []);
  });
});
