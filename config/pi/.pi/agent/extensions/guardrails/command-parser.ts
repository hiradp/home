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
