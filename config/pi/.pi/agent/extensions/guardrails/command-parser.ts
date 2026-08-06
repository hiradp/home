import { homedir } from "node:os";
import { basename, resolve } from "node:path";

export interface CommandInvocation {
  command: string;
  args: string[];
}

export interface GitInvocation {
  cwd: string;
  subcommand: string;
  args: string[];
}

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
const COMMAND_WRAPPERS = new Set(["command", "env", "exec", "nohup", "sudo"]);

export function shellWords(command: string): string[] {
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

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

function isCommandPosition(words: string[], index: number): boolean {
  let start = index - 1;
  while (start >= 0 && words[start] !== ";") start--;
  const prefix = words.slice(start + 1, index);
  if (prefix.every((word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word))) return true;
  return COMMAND_WRAPPERS.has(prefix[0]);
}

export function findCommandInvocations(
  command: string,
  commandNames: ReadonlySet<string>,
): CommandInvocation[] {
  const words = shellWords(command);
  const invocations: CommandInvocation[] = [];

  for (let i = 0; i < words.length; i++) {
    const commandName = basename(words[i]);
    if (!commandNames.has(commandName) || !isCommandPosition(words, i)) continue;

    const args: string[] = [];
    for (let cursor = i + 1; cursor < words.length && words[cursor] !== ";"; cursor++) {
      args.push(words[cursor]);
    }
    invocations.push({ command: commandName, args });
  }

  return invocations;
}

export function findGitInvocations(command: string, baseCwd: string): GitInvocation[] {
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

export interface ShellSegment {
  text: string;
  words: string[];
  redirectTargets: string[];
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "|" || (char === "&" && next === "&")) {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((char === "|" && next === "|") || (char === "&" && next === "&")) i++;
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenizeShellSegment(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  const flush = () => {
    if (current) tokens.push(current);
    current = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === ">" || char === "<") {
      let operator = char;
      if (/^\d+$/.test(current)) operator = `${current}${char}`;
      else flush();
      if (text[i + 1] === ">" || text[i + 1] === "&") {
        operator += text[i + 1];
        i++;
      }
      tokens.push(operator);
      current = "";
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}

/**
 * Parse the shell structure needed by deterministic safety policies.
 * This intentionally is not a complete POSIX shell parser.
 */
export function parseShellSegments(command: string): ShellSegment[] {
  return splitShellSegments(command).map((text) => {
    const tokens = tokenizeShellSegment(text);
    const words: string[] = [];
    const redirectTargets: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^(?:\d?>|\d?>>|>|>>|&>|<)$/.test(token)) {
        const target = tokens[i + 1];
        if (target) redirectTargets.push(target);
        i++;
        continue;
      }
      words.push(token);
    }
    return { text, words, redirectTargets };
  });
}

const WRAPPERS = new Set(["command", "env", "exec", "nohup", "sudo"]);
const WRAPPER_OPTIONS_WITH_VALUE = new Set(["-C", "--chdir", "-g", "--group", "-u", "--user"]);

/** Resolve the executable and arguments after common command wrappers. */
export function shellSegmentInvocation(
  segment: ShellSegment,
): { command: string; args: string[] } | undefined {
  let index = 0;
  while (index < segment.words.length) {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(segment.words[index] ?? "")) index++;
    const command = basename(segment.words[index] ?? "");
    if (!command) return;
    if (!WRAPPERS.has(command)) {
      return { command, args: segment.words.slice(index + 1) };
    }

    index++;
    while (index < segment.words.length) {
      const argument = segment.words[index];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument)) {
        index++;
        continue;
      }
      if (WRAPPER_OPTIONS_WITH_VALUE.has(argument)) {
        index += 2;
        continue;
      }
      if (argument.startsWith("-")) {
        index++;
        continue;
      }
      break;
    }
  }
}
