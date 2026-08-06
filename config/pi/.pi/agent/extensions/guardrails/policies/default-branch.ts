import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  findGitInvocations,
  shellWords,
  expandHome,
  type GitInvocation,
} from "../command-parser.ts";
import { block, type GuardrailPolicy } from "../policy.ts";

interface RepoState {
  branch: string;
  defaultBranches: Set<string>;
}

const FALLBACK_DEFAULT_BRANCHES = ["main", "master", "trunk"];
const PUSH_OPTIONS_WITH_VALUE = new Set([
  "--exec",
  "--push-option",
  "--receive-pack",
  "--repo",
  "-o",
]);

export const defaultBranchGuidance =
  "Git guardrail: never commit or push while on a repository's default branch. Create or switch to a feature branch first; pushes targeting a default branch are also prohibited.";

async function git(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await pi.exec("git", args, { cwd, signal, timeout: 3000 });
  return result.code === 0 ? result.stdout.trim() : undefined;
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

function repositorySlugIsAllowed(configured: string, repositories: Set<string>): boolean {
  if (!configured.endsWith("/*")) return repositories.has(configured);

  const owner = configured.slice(0, -2);
  if (!owner || owner.includes("/")) return false;
  return [...repositories].some((repository) => {
    const [repositoryOwner, repositoryName, ...rest] = repository.split("/");
    return repositoryOwner === owner && Boolean(repositoryName) && rest.length === 0;
  });
}

export async function repositoryIsAllowed(
  pi: ExtensionAPI,
  cwd: string,
  allowedRepositories: string[],
  signal?: AbortSignal,
): Promise<boolean> {
  if (allowedRepositories.length === 0) return false;

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

  for (const entry of allowedRepositories) {
    const expanded = expandHome(entry);
    if (isAbsolute(expanded)) {
      try {
        if ((await realpath(expanded)) === normalizedRoot) return true;
      } catch {
        // Ignore missing configured paths.
      }
    }
    const slug = repositorySlug(entry);
    if (slug !== undefined && repositorySlugIsAllowed(slug, slugs)) return true;
  }
  return false;
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

async function blockedDefaultBranchReason(
  pi: ExtensionAPI,
  command: string,
  cwd: string,
  allowedRepositories: string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  for (const invocation of findGitInvocations(command, cwd)) {
    const action = await resolveAction(pi, invocation, signal);
    if (!action) continue;
    if (await repositoryIsAllowed(pi, invocation.cwd, allowedRepositories, signal)) continue;

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

export const defaultBranchPolicy = {
  name: "default-branch",
  async guidance({ pi, cwd, config, signal }) {
    if (await repositoryIsAllowed(pi, cwd, config.defaultBranch.allowedRepositories, signal)) {
      return;
    }
    return defaultBranchGuidance;
  },
  async check(action, { pi, cwd, config, signal }) {
    if (action.toolName !== "bash" || typeof action.input.command !== "string") return;
    const reason = await blockedDefaultBranchReason(
      pi,
      action.input.command,
      cwd,
      config.defaultBranch.allowedRepositories,
      signal,
    );
    return reason ? block(reason) : undefined;
  },
} satisfies GuardrailPolicy;
