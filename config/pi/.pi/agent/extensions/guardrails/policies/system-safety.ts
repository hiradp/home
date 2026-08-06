import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseShellSegments, shellSegmentInvocation } from "../command-parser.ts";
import { actionMutationTargets, resolveInputPath, resolvePathForPolicy } from "../path-policy.ts";
import { block, type GuardrailPolicy } from "../policy.ts";

const home = homedir();
const authorizedKeysPath = resolve(home, ".ssh/authorized_keys");
const canonicalAuthorizedKeysPath = resolvePathForPolicy(authorizedKeysPath) ?? authorizedKeysPath;
const profilePaths = new Set(
  [
    ".bashrc",
    ".bash_profile",
    ".bash_login",
    ".bash_logout",
    ".profile",
    ".zshrc",
    ".zprofile",
    ".zshenv",
    ".zlogin",
    ".zlogout",
  ].map((path) => {
    const absolute = resolve(home, path);
    return resolvePathForPolicy(absolute) ?? absolute;
  }),
);
for (const path of ["/etc/profile", "/etc/environment", "/etc/bash.bashrc"]) {
  profilePaths.add(resolvePathForPolicy(path) ?? path);
}

function protectedIdentityPath(path: string): string | undefined {
  const resolved = resolvePathForPolicy(path) ?? resolve(path);
  if (resolved === canonicalAuthorizedKeysPath) {
    return "SSH authorized_keys modification is hard-denied";
  }
  if (profilePaths.has(resolved)) return "shell profile modification is hard-denied";
}

export function isRootHomeOrSystemPath(path: string, userHome = home): boolean {
  const systemRoots = [
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/private",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
  ];
  if (path.startsWith(`${userHome}/`)) return false;
  return (
    path === "/" ||
    path === userHome ||
    systemRoots.some((root) => path === root || path.startsWith(`${root}/`))
  );
}

function recursiveRmArgument(argument: string): boolean {
  return (
    argument === "--recursive" ||
    /^-[A-Za-z]*r[A-Za-z]*f?[A-Za-z]*$/.test(argument) ||
    /^-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*$/.test(argument)
  );
}

function systemOrSshPath(path: string): boolean {
  const resolved = resolvePathForPolicy(path) ?? resolve(path);
  return ["/etc", "/usr", "/bin", "/sbin", "/System", resolve(home, ".ssh")].some(
    (root) => resolved === root || resolved.startsWith(`${root}/`),
  );
}

function shellSafetyReason(command: string, cwd: string): string | undefined {
  for (const segment of parseShellSegments(command)) {
    for (const word of segment.words) {
      if (/^(NODE_TLS_REJECT_UNAUTHORIZED=0|GIT_SSL_NO_VERIFY=(1|true))$/i.test(word)) {
        return "TLS verification weakening is hard-denied";
      }
      if (/sslverify=false/i.test(word)) return "TLS verification weakening is hard-denied";
    }

    const invocation = shellSegmentInvocation(segment);
    if (!invocation) continue;
    const { command: name, args } = invocation;
    const lowerArgs = args.map((argument) => argument.toLowerCase());

    if (
      ["curl", "wget"].includes(name) &&
      lowerArgs.some((argument) =>
        ["--insecure", "-k", "--no-check-certificate"].includes(argument),
      )
    ) {
      return "certificate verification weakening is hard-denied";
    }
    if (
      ["npm", "pnpm", "yarn"].includes(name) &&
      lowerArgs[0] === "config" &&
      lowerArgs[1] === "set" &&
      ["strict-ssl", "cafile"].includes(lowerArgs[2] ?? "") &&
      ["false", "null"].includes(lowerArgs[3] ?? "")
    ) {
      return "package-manager TLS weakening is hard-denied";
    }
    if (
      name === "git" &&
      lowerArgs[0] === "config" &&
      lowerArgs.some((argument) => argument === "sslverify" || argument.endsWith(".sslverify")) &&
      lowerArgs.includes("false")
    ) {
      return "git TLS verification weakening is hard-denied";
    }
    if (name === "crontab" && !lowerArgs.includes("-l")) {
      return "persistence mutation is hard-denied";
    }
    if (name === "launchctl" && ["load", "bootstrap", "enable"].includes(lowerArgs[0] ?? "")) {
      return "persistence mutation is hard-denied";
    }
    if (name === "systemctl" && ["enable", "start"].includes(lowerArgs[0] ?? "")) {
      return "persistence mutation is hard-denied";
    }
    if (name === "security" && lowerArgs[0] === "add-trusted-cert") {
      return "platform security weakening is hard-denied";
    }
    if (name === "spctl" && lowerArgs.includes("--master-disable")) {
      return "platform security weakening is hard-denied";
    }
    if (name === "csrutil" && lowerArgs[0] === "disable") {
      return "platform security weakening is hard-denied";
    }

    if (name === "rm" && args.some(recursiveRmArgument)) {
      for (const argument of args.filter((value) => !value.startsWith("-"))) {
        const path = resolveInputPath(cwd, argument);
        if (path && isRootHomeOrSystemPath(path)) {
          return "irreversible deletion of home, root, or system paths is hard-denied";
        }
      }
    }
    if (name === "find" && lowerArgs.includes("-delete")) {
      const path = resolveInputPath(
        cwd,
        args.find((argument) => !argument.startsWith("-")),
      );
      if (path && isRootHomeOrSystemPath(path)) return "system-wide delete is hard-denied";
    }
    if (["chmod", "chown"].includes(name)) {
      for (const argument of args.filter((value) => !value.startsWith("-"))) {
        const path = resolveInputPath(cwd, argument);
        if (path && systemOrSshPath(path)) {
          return "system or SSH permission mutation is hard-denied";
        }
      }
    }
  }
}

export const systemSafetyPolicy = {
  name: "system-safety",
  async guidance() {
    return "System safety guardrail: do not weaken security controls, add persistence, modify shell/SSH identity files, or destructively delete home, root, or system paths.";
  },
  async check(action, { cwd }) {
    for (const path of actionMutationTargets(action.toolName, action.input, cwd)) {
      const reason = protectedIdentityPath(path);
      if (reason) return block(reason);
    }
    if (action.toolName !== "bash" || typeof action.input.command !== "string") return;
    const reason = shellSafetyReason(action.input.command, cwd);
    if (reason) return block(reason);
  },
} satisfies GuardrailPolicy;
