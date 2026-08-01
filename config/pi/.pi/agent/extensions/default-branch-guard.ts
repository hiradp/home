/**
 * Default Branch Guard
 *
 * Blocks Git commits and pushes from Pi while the repository is on its default
 * branch. Pushes that explicitly target a default branch are blocked too.
 * Applies to both agent bash tool calls and user !/!! commands.
 *
 * Repositories can be exempted in ~/.pi/agent/settings.json:
 *   "defaultBranchGuard": { "allowed": ["owner/repo"] }
 */

import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface GitInvocation {
  cwd: string;
  subcommand: string;
  args: string[];
}

interface RepoState {
  branch: string;
  defaultBranches: Set<string>;
}

interface GuardSettings {
  defaultBranchGuard?: {
    allowed?: unknown;
  };
}

const FALLBACK_DEFAULT_BRANCHES = ["main", "master", "trunk"];
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--config-env",
  "--exec-path",
  "--git-dir",
  "--namespace",
  "--super-prefix",
  "--work-tree",
]);
const PUSH_OPTIONS_WITH_VALUE = new Set([
  "--exec",
  "--push-option",
  "--receive-pack",
  "--repo",
  "-o",
]);
const COMMAND_WRAPPERS = new Set(["command", "env", "exec", "nohup", "sudo"]);

function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const flush = () => {
    if (word) words.push(word);
    word = "";
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (escaped) {
      word += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char) || /[;&|()]/.test(char)) {
      flush();
      if (/[;&|()]/.test(char)) words.push(";");
      continue;
    }
    word += char;
  }
  flush();
  return words;
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

async function allowedRepositories(): Promise<string[]> {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  try {
    const settings = JSON.parse(
      await readFile(join(agentDir, "settings.json"), "utf8"),
    ) as GuardSettings;
    const configured = settings.defaultBranchGuard?.allowed;
    return Array.isArray(configured)
      ? configured.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    // Invalid or unavailable settings fail closed.
    return [];
  }
}

function repositorySlug(value: string): string | undefined {
  let candidate = value.trim();
  const scp = candidate.match(/^[^@]+@[^:]+:(.+)$/);
  if (scp) candidate = scp[1];
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname;
    } catch {
      return;
    }
  }

  candidate = candidate.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  return candidate.includes("/") ? candidate.toLowerCase() : undefined;
}

async function repositoryIsAllowed(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const configured = await allowedRepositories();
  if (configured.length === 0) return false;

  const root = await git(pi, cwd, ["rev-parse", "--show-toplevel"], signal);
  if (!root) return false;
  const normalizedRoot = await realpath(root);
  const slugs = new Set<string>();
  const remotes = (await git(pi, cwd, ["remote"], signal))?.split(/\s+/).filter(Boolean) ?? [];
  for (const remote of remotes) {
    const urls = await git(pi, cwd, ["remote", "get-url", "--all", remote], signal);
    for (const url of urls?.split("\n").filter(Boolean) ?? []) {
      const slug = repositorySlug(url);
      if (slug) slugs.add(slug);
    }
  }

  for (const entry of configured) {
    const expanded = expandHome(entry);
    if (isAbsolute(expanded)) {
      try {
        if ((await realpath(expanded)) === normalizedRoot) return true;
      } catch {
        // Ignore missing configured paths.
      }
    }
    const slug = repositorySlug(entry);
    if (slug !== undefined && slugs.has(slug)) return true;
  }
  return false;
}

function isCommandPosition(words: string[], index: number): boolean {
  let start = index - 1;
  while (start >= 0 && words[start] !== ";") start--;
  const prefix = words.slice(start + 1, index);
  if (prefix.every((word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word))) return true;
  return COMMAND_WRAPPERS.has(prefix[0]);
}

function findGitInvocations(command: string, baseCwd: string): GitInvocation[] {
  const words = shellWords(command);
  const invocations: GitInvocation[] = [];

  for (let i = 0; i < words.length; i++) {
    if (basename(words[i]) !== "git" || !isCommandPosition(words, i)) continue;

    let cwd = baseCwd;
    let cursor = i + 1;
    while (cursor < words.length && words[cursor] !== ";" && words[cursor].startsWith("-")) {
      const option = words[cursor];
      if (option === "-C" && words[cursor + 1] && words[cursor + 1] !== ";") {
        cwd = resolve(cwd, expandHome(words[cursor + 1]));
        cursor += 2;
        continue;
      }
      if (option.startsWith("-C") && option.length > 2) {
        cwd = resolve(cwd, expandHome(option.slice(2)));
        cursor++;
        continue;
      }
      if (GIT_OPTIONS_WITH_VALUE.has(option)) cursor += 2;
      else cursor++;
    }

    if (cursor >= words.length || words[cursor] === ";") continue;
    const subcommand = words[cursor];
    const args: string[] = [];
    for (cursor++; cursor < words.length && words[cursor] !== ";"; cursor++) {
      args.push(words[cursor]);
    }
    invocations.push({ cwd, subcommand, args });
  }

  return invocations;
}

async function git(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await pi.exec("git", args, { cwd, signal, timeout: 3000 });
  return result.code === 0 ? result.stdout.trim() : undefined;
}

async function resolveAction(
  pi: ExtensionAPI,
  invocation: GitInvocation,
  signal?: AbortSignal,
): Promise<"commit" | "push" | undefined> {
  let action = invocation.subcommand;
  const seen = new Set<string>();

  for (let depth = 0; depth < 5; depth++) {
    if (action === "commit" || action === "push") return action;
    if (seen.has(action)) return;
    seen.add(action);

    const alias = await git(pi, invocation.cwd, ["config", "--get", `alias.${action}`], signal);
    if (!alias) return;
    if (alias.startsWith("!")) {
      const nested = findGitInvocations(alias.slice(1), invocation.cwd);
      for (const candidate of nested) {
        const resolved = await resolveAction(pi, candidate, signal);
        if (resolved) return resolved;
      }
      return;
    }
    action = shellWords(alias)[0] ?? "";
  }
}

async function repoState(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<RepoState | undefined> {
  const branch = await git(pi, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], signal);
  if (!branch) return;

  const defaultBranches = new Set<string>();
  const remotes = (await git(pi, cwd, ["remote"], signal))?.split(/\s+/).filter(Boolean) ?? [];
  for (const remote of remotes) {
    const remoteHead = await git(
      pi,
      cwd,
      ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`],
      signal,
    );
    if (remoteHead?.startsWith(`${remote}/`))
      defaultBranches.add(remoteHead.slice(remote.length + 1));
  }

  const configuredDefault = await git(pi, cwd, ["config", "--get", "init.defaultBranch"], signal);
  if (configuredDefault) defaultBranches.add(configuredDefault);
  for (const fallback of FALLBACK_DEFAULT_BRANCHES) defaultBranches.add(fallback);

  return { branch, defaultBranches };
}

function targetsDefaultBranch(args: string[], defaults: Set<string>): boolean {
  if (args.some((arg) => arg === "--all" || arg === "--mirror")) return true;

  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (PUSH_OPTIONS_WITH_VALUE.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    positionals.push(arg);
  }

  // The first positional is the remote/repository; remaining values are refspecs.
  for (const refspec of positionals.slice(1)) {
    for (const branch of defaults) {
      if (
        refspec === branch ||
        refspec === `refs/heads/${branch}` ||
        refspec.endsWith(`:${branch}`) ||
        refspec.endsWith(`:refs/heads/${branch}`)
      ) {
        return true;
      }
    }
  }
  return false;
}

async function blockedReason(
  pi: ExtensionAPI,
  command: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  for (const invocation of findGitInvocations(command, cwd)) {
    const action = await resolveAction(pi, invocation, signal);
    if (!action) continue;
    if (await repositoryIsAllowed(pi, invocation.cwd, signal)) continue;

    const state = await repoState(pi, invocation.cwd, signal);
    if (!state) continue;
    const onDefaultBranch = state.defaultBranches.has(state.branch);

    if (action === "commit" && onDefaultBranch) {
      return `Blocked git commit on default branch '${state.branch}'. Switch to a feature branch first.`;
    }
    if (action === "push") {
      const pushRef = await git(
        pi,
        invocation.cwd,
        ["rev-parse", "--symbolic-full-name", "@{push}"],
        signal,
      );
      const pushesDefault =
        targetsDefaultBranch(invocation.args, state.defaultBranches) ||
        (pushRef !== undefined &&
          [...state.defaultBranches].some((branch) => pushRef.endsWith(`/${branch}`)));
      if (onDefaultBranch || pushesDefault) {
        return `Blocked git push involving a default branch while on '${state.branch}'. Push a feature branch instead.`;
      }
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (await repositoryIsAllowed(pi, ctx.cwd, ctx.signal)) return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\nGit guardrail: never commit or push while on a repository's default branch. Create or switch to a feature branch first; pushes targeting a default branch are also prohibited.",
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;

    const reason = await blockedReason(pi, command, ctx.cwd, ctx.signal);
    if (reason) return { block: true, reason };
  });

  pi.on("user_bash", async (event, ctx) => {
    const reason = await blockedReason(pi, event.command, event.cwd, ctx.signal);
    if (!reason) return;
    ctx.ui.notify(reason, "error");
    return { result: { output: reason, exitCode: 1, cancelled: false, truncated: false } };
  });
}
