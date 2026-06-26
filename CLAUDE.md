# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Personal dotfiles, managed by the `home` CLI in `bin/home`. There is no build, no test suite, and no language toolchain — it's bash + GNU stow + Homebrew package lists.

## Common commands

```bash
home setup                # First-time machine setup (brew + ssh + remotes + install + link)
home install [type]       # Install packages: essentials | casks | langs | tools | all (default); runs `work install` when $WORK_DIR exists
home link [folders...]    # Stow configs into $HOME (default: all in $DEFAULT_FOLDERS)
home upgrade              # git pull --ff-only, brew update/upgrade, nvim Lazy! sync; runs `work upgrade` when $WORK_DIR exists
home connect              # Join ZeroTier network using ID stored in iCloud
```

`bin/bootstrap` is the curl-piped fresh-Mac entrypoint: it installs Xcode CLI tools, clones the repo to `$DOTFILES` (default `~/Code/hiradp/home`), then runs `home setup`.

## Architecture

### Stow layout

Configs live under `config/<tool>/.config/<tool>/...` so that `stow -d config <tool> -t $HOME` materializes them at `~/.config/<tool>`. When adding a new tool:

1. Create `config/<tool>/.config/<tool>/...` with the actual config files.
2. Add `<tool>` to `DEFAULT_FOLDERS` in `bin/home`.
3. Re-run `home link` (it un-stows then re-stows, so it's idempotent).

A few configs target `$HOME` directly rather than `~/.config` — check the directory layout under `config/<tool>/` before assuming.

### Claude config (single identity)

One Claude config, tracked as `config/claude/.claude/` → `~/.claude`. Only the tracked bits are committed — `settings.json`, the `create-pr` skill under `skills/`, and the `.gitignore` that pins them; login, sessions, projects, and creds are runtime and stay out of the repo.

Cross-repo skills (the `htools-*` ones) live as **absolute symlinks** directly in `~/.claude/skills/`, *not* tracked here: GNU stow aborts on absolute symlinks inside a package, so they're maintained outside `home link` (created alongside their source repos). `home link` folds `create-pr` in next to them without touching them.

**Why `CLAUDE_CONFIG_DIR` stays unset (important):** on macOS the login is stored in the Keychain, keyed per config dir — the unset default gets the plain `Claude Code-credentials` item, while an explicit `CLAUDE_CONFIG_DIR` gets a *suffixed* one. So `claude` must run with `CLAUDE_CONFIG_DIR` **unset** (it resolves `~/.claude` plus the home-level `~/.claude.json`); pointing it at an explicit dir would hit a different Keychain item and force a re-login. The wrapper leaves it alone on purpose.

**The wrapper** (`config/fish/.config/fish/functions/claude.fish`) now only forces `--effort=max` on every invocation — no profile switching, no statusline tag.

**Statusline** is `lib/claude/statusline.sh`, referenced by absolute path from `settings.json` (it no longer renders a profile tag).

### Package lists

`pkg/brew/{taps,essentials,cask}` are plain newline-separated text files; `#` comments and blank lines are skipped. `pkg/lang/*` are shell snippets (one per runtime: bun, go, python, ruby, rust, zig) that get **sourced** (not executed) from `_install_langs`, so they share the parent shell's environment and `log_*` helpers.

`pkg/tool/*` follow the same pattern for standalone tools installed outside Homebrew (e.g. cursor CLI). Sourced from `_install_tools`.

### Logging convention

All scripts (except `bootstrap`, which inlines its own copy because it runs before the repo exists) source `lib/log.sh` and use `log_banner / log_section / log_info / log_ok / log_warn / log_error / log_dim`. Use these instead of raw `echo` to keep output consistent. Every bash file starts with `set -euo pipefail`.

### Two-remote setup

`origin` points to the **private** mirror `git@github.com:hiradp/home-private.git`; `upstream` points to the **public** `git@github.com:hiradp/home.git`. `home setup` configures these automatically when the user has access to the private repo. `main` tracks `origin/main`. To publish a subset of private commits to upstream, use the `manage-upstream` skill at `.claude/skills/manage-upstream/SKILL.md` — do not push to `upstream` ad-hoc.

### tmux-sessionizer

`bin/tmux-sessionizer` is a substantial script that creates tmux sessions from `.tmux-config.yaml` files (or auto-discovers from subdirectories). Full schema is documented in the script header — read it before changing layout/pane logic. Supports preset layouts (`main-horizontal` etc.), recursive tree layouts (split maps with `panes`), and absolute / `~`-prefixed `dir` values.

### tmux-theme

`bin/tmux-theme` matches tmux to macOS appearance. `--watch` mode uses `dark-notify` and PID-files itself in `$TMPDIR`; running it again kills the previous watcher. The theme files (`themes/{light,dark}.conf`) set only the light/dark *surface* (`@bg`/`@fg`/`status-bg`/`pane-border-style`) — the per-session *accent* is theme-independent and lives in `.tmux.conf` (see below).

### `hmux ctrl` (htools home base)

The **`ctrl`** session — the htools control center, bound to `prefix + !` — is created-or-attached by **`hmux ctrl`** (in the [htools](https://github.com/hiradp/htools) repo), which replaced the old `bin/tmux-control` script. It's a 2x3 grid in one `main` window: the `htask` dashboard, a clock, and the `hmux` dashboard across the top; a process/port pane, a plain driver shell (focused on entry), and an agents pane across the bottom. The clock/ports/agents panes run configurable commands (`[hmux]` `clock`/`ports`/`agents`, placeholders until `hclock`/`hps`/`hagent` ship). Beside `main` it opens a plain shell window per `[hmux] ctrl_repos` entry in `~/.config/htools/config.toml` (set to the core repos — absent ones are skipped). Re-running re-enters rather than rebuilding, mirroring `hmux open`. The `ctrl` name keys its cyan accent in the `@theme` map.

### Per-session accent colours (`@theme`)

`@theme` in `.tmux.conf` maps the **session name** to a status-bar accent, re-evaluated per session via `#{E:@theme}`: `hprobe-*` → red (incident), `htask-*` → magenta (active task), `ctrl` → cyan, plus the originals `planetscale` → red, `hiradp` → green, everything else → blue. The `htask-*` / `hprobe-*` prefixes match the tmux sessions [htools](https://github.com/hiradp/htools) opens (`htask start`, `hprobe`), so a dev task, an incident probe, and the control session are colour-coded apart at a glance.

## Commit style

Conventional Commits with a tool-scoped prefix: `feat(nvim): …`, `chore(brew): …`, `fix(tmux): …`, `style(home): …`. Match recent `git log` exactly when in doubt. Commits are typically tight and single-purpose.
