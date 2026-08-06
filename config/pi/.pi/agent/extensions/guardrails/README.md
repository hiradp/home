# Pi guardrails

Personal deterministic safety policies with an optional scoped semantic reviewer for Pi agent tools and user `!` / `!!` shell commands.

This extension is not a sandbox. It blocks high-confidence unsafe actions before execution, but it runs inside Pi with the current user's permissions and uses a deliberately small shell parser rather than a complete shell interpreter.

## Enforcement

Policies evaluate every agent tool call and user shell command. Decisions have this priority:

```text
block → confirm → review → allow
```

Deterministic blocks can never be overridden by confirmation or semantic review.

Built-in policies:

- **self-protection** — blocks changes to `~/.pi/agent/settings.json` and the guardrails extension source;
- **system safety** — blocks security weakening, persistence, shell/SSH identity-file changes, dangerous system deletion, and system permission changes;
- **blocked commands** — blocks configured executables, including package-runner invocations;
- **default branch** — blocks commits and pushes involving a repository default branch;
- **kubectl** — allows only configured read-oriented Kubernetes commands;
- **paths** — blocks or confirms writes matching configured path patterns;
- **semantic review** — sends only configured agent actions through an independent classifier.

Read-only tools remain available if the configuration cannot be loaded. Side-effecting tools fail closed until a valid configuration is available; a failed reload keeps the last known-good configuration.

## Semantic review

Semantic review is disabled by default and only runs for configured command prefixes and path patterns. It does not review ordinary reads, edits, writes, or shell commands.

The classifier receives only:

- a redacted action summary, never write/edit contents;
- the requesting policy and reason;
- the latest direct user instruction, not the full transcript;
- the action source, tool name, and working directory.

Common credential forms are redacted before the request. No heuristic redactor can guarantee detection of every possible secret, so review scopes should remain narrow.

Modes:

- `shadow` — records and displays the classifier suggestion, then still asks the user;
- `enforce` — applies `allow`, `confirm`, or `block` from the classifier.

Classifier errors, missing credentials, invalid responses, and timeouts fall back to user confirmation. Without an interactive UI, confirmation fails closed. Direct user shell commands remain subject to deterministic policies but skip semantic classification because the user already expressed the action directly.

The configured model is used when `model` is set to `provider/model`; otherwise the active Pi model is used with low reasoning effort. `/guardrails reviews` shows recent sanitized results.

## Configuration

Configuration lives under `guardrails` in `~/.pi/agent/settings.json`:

```json
{
  "guardrails": {
    "commands": {
      "blocked": ["wrangler"]
    },
    "defaultBranch": {
      "allowed": ["hiradp/*"]
    },
    "paths": {
      "blocked": [".git", ".git/**", "~/.ssh"],
      "confirm": [".env", ".env.*", ".pi", ".pi/**", "~/.ssh/**"]
    },
    "semanticReview": {
      "enabled": true,
      "mode": "shadow",
      "timeoutMs": 15000,
      "commands": ["gh", "git push", "terraform"],
      "paths": [".github/workflows", ".github/workflows/**"]
    },
    "kubectl": {
      "invocations": [
        { "command": "kubectl" },
        { "command": "k" },
        { "command": "pskube", "skipArguments": 1 }
      ],
      "allowedCommands": ["get", "logs", "describe", "rollout status"]
    }
  }
}
```

Relative path patterns apply only inside the current working tree. Absolute and `~`-prefixed patterns are supported. `*` matches within one path segment; `**` spans directories. Paths are resolved through symlinks where possible.

Semantic command entries are executable/argument prefixes. For example, `git push` reviews `git push origin main` but not `git status`; a bare `gh` reviews every `gh` invocation. Common wrappers such as `env`, `sudo`, and `command` are resolved.

Project-owned configuration is intentionally not loaded, so a checked-in repository cannot weaken personal guardrails.

## Commands

```text
/guardrails status
/guardrails config
/guardrails reload
/guardrails denials
/guardrails reviews
/guardrails reset
/guardrails maintenance 10m
/guardrails maintenance off
```

Maintenance mode is interactive, lasts at most 60 minutes, and disables only self-protection. Command, Git, Kubernetes, path, system-safety, and semantic policies remain active. Maintenance mode is not persisted across extension reloads or sessions.
