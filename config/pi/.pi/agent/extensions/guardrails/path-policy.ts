import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseShellSegments, shellSegmentInvocation } from "./command-parser.ts";

const MUTATING_COMMANDS = new Set([
  "chmod",
  "chown",
  "cp",
  "install",
  "ln",
  "mv",
  "perl",
  "python",
  "python3",
  "rm",
  "ruby",
  "sed",
  "tee",
  "touch",
  "truncate",
  "unlink",
]);

export function expandPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  if (value === "$HOME" || value === "${HOME}") return homedir();
  if (value.startsWith("$HOME/")) return resolve(homedir(), value.slice(6));
  if (value.startsWith("${HOME}/")) return resolve(homedir(), value.slice(8));
  return value;
}

export function resolveInputPath(cwd: string, value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return;
  const raw = value.trim().replace(/^@/, "");
  const expanded = expandPath(raw);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

/** Resolve symlinks through the nearest existing ancestor of a path. */
export function resolvePathForPolicy(path: string): string | undefined {
  return resolvePathForPolicyInner(resolve(path), new Set());
}

function resolvePathForPolicyInner(path: string, visitedSymlinks: Set<string>): string | undefined {
  let current = path;
  const missingSegments: string[] = [];

  while (true) {
    try {
      return resolve(realpathSync(current), ...missingSegments);
    } catch {
      try {
        const stat = lstatSync(current);
        if (!stat.isSymbolicLink() || visitedSymlinks.has(current)) return;
        visitedSymlinks.add(current);
        const target = resolve(dirname(current), readlinkSync(current));
        return resolvePathForPolicyInner(resolve(target, ...missingSegments), visitedSymlinks);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
        if (code !== "ENOENT" && code !== "ENOTDIR") return;
        const parent = dirname(current);
        if (parent === current) return;
        missingSegments.unshift(basename(current));
        current = parent;
      }
    }
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeForMatch(value: string): string {
  return value.split(sep).join("/");
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function resolveAbsolutePattern(pattern: string): string {
  const wildcard = pattern.search(/[*?]/);
  if (wildcard === -1) return resolvePathForPolicy(pattern) ?? resolve(pattern);
  const separator = pattern.lastIndexOf("/", wildcard);
  if (separator < 1) return pattern;
  const base = pattern.slice(0, separator);
  const suffix = pattern.slice(separator);
  return `${resolvePathForPolicy(base) ?? resolve(base)}${suffix}`;
}

export function matchesPathPattern(path: string, cwd: string, pattern: string): boolean {
  const resolvedPath = resolvePathForPolicy(path) ?? resolve(path);
  const expandedPattern = expandPath(pattern);
  if (isAbsolute(expandedPattern)) {
    return globToRegExp(normalizeForMatch(resolveAbsolutePattern(expandedPattern))).test(
      normalizeForMatch(resolvedPath),
    );
  }

  const resolvedCwd = resolvePathForPolicy(cwd) ?? resolve(cwd);
  if (!isInside(resolvedPath, resolvedCwd)) return false;
  const relativePath = normalizeForMatch(relative(resolvedCwd, resolvedPath));
  return globToRegExp(normalizeForMatch(expandedPattern)).test(relativePath);
}

function pathArguments(args: string[]): string[] {
  return args.filter((argument) => !argument.startsWith("-") && argument !== "--");
}

/**
 * Extract likely write targets from shell redirects and common mutating commands.
 * This is intentionally conservative and is not a complete shell interpreter.
 */
export function shellMutationTargets(command: string, cwd: string): string[] {
  const targets = new Set<string>();
  for (const segment of parseShellSegments(command)) {
    for (const redirect of segment.redirectTargets) {
      const path = resolveInputPath(cwd, redirect);
      if (path) targets.add(path);
    }

    const invocation = shellSegmentInvocation(segment);
    if (!invocation || !MUTATING_COMMANDS.has(invocation.command)) continue;
    for (const argument of pathArguments(invocation.args)) {
      const path = resolveInputPath(cwd, argument);
      if (path) targets.add(path);
    }
  }
  return [...targets];
}

export function actionMutationTargets(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): string[] {
  if (toolName === "write" || toolName === "edit") {
    const path = resolveInputPath(cwd, input.path);
    return path ? [path] : [];
  }
  if (toolName === "bash" && typeof input.command === "string") {
    return shellMutationTargets(input.command, cwd);
  }
  return [];
}
