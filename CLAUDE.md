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

### Claude config (named per-identity dirs)

Two **identities** live in two real config dirs, each holding its own login + history; only their settings are tracked (runtime stays out of the repo):

- `config/claude-work/.claude-work/` → `~/.claude-work` — work identity (also tracks the `create-pr` skill).
- `config/claude-personal/.claude-personal/` → `~/.claude-personal` — personal identity.

`~/.claude` is a **symlink to whichever identity is this machine's default** (here `~/.claude-work`). The default profile is selected at setup, not hardcoded.

**Why the default stays "unset" (important):** on macOS the login is stored in the Keychain, keyed per config dir — an explicit `CLAUDE_CONFIG_DIR` gets a *suffixed* Keychain item, while the unset default gets the plain `Claude Code-credentials`. So the default profile must run with `CLAUDE_CONFIG_DIR` **unset** (just `~/.claude` → its dir, plus the home-level `~/.claude.json`); giving it an explicit dir would point at a different Keychain item and force a re-login. Only the *non-default* profile gets an explicit `CLAUDE_CONFIG_DIR`.

**The wrapper lives here** (`config/fish/.config/fish/functions/claude.fish`), not in the work repo. It derives the **default profile from the `~/.claude` symlink target** (so it can't go stale between shell restarts), and reads the per-repo override lists from machine policy (set in the work repo's `config/fish/config.fish`; absent on a personal-only machine → personal default, no overrides):

```fish
set -g claude_personal_dirs   <dirs>        # repos that force the personal profile
set -g claude_work_dirs       <dirs>        # repos that force the work profile (used when default=personal)
# optional: set -g claude_default_profile work|personal  to override the ~/.claude-derived default
```

To make a machine personal-default: point `~/.claude` → `~/.claude-personal` and list work repos in `claude_work_dirs`. (The override lists are read at shell startup, so a new shell is needed after changing them.)

To avoid copy-paste:

- **Settings** are one shared file, `lib/claude/settings.json`. Each package's `settings.json` is a committed symlink to it; edit the base and both identities get it. (Each dir's `.gitignore` tracks only `settings.json`/`skills` + `.gitignore`; sessions, projects, creds stay ignored.)
- **Statusline** is one shared script, `lib/claude/statusline.sh` (referenced by absolute path from the base `settings.json`). It's profile-agnostic: the tag (`🪐 PlanetScale` / `👤 personal`) comes from `$CLAUDE_STATUS_TAG` / `$CLAUDE_STATUS_TAG_COLOR`, which the wrapper exports. No env var → no tag (so the unset default on a fresh/personal-only machine never mislabels).

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

### tmux-control (htools home base)

`bin/tmux-control` create-or-attaches the **`ctrl`** session — the htools control point, bound to `prefix + !`. It boots into the `htask` dashboard (typed into a fresh shell, not exec'd, so quitting `htask` drops to a shell for `htask`/`htree`/`hmux`). Re-running re-enters the session rather than rebuilding it, mirroring `hmux open`'s idempotency. The `ctrl` name is what keys its cyan accent in the `@theme` map.

### Per-session accent colours (`@theme`)

`@theme` in `.tmux.conf` maps the **session name** to a status-bar accent, re-evaluated per session via `#{E:@theme}`: `hprobe-*` → red (incident), `htask-*` → magenta (active task), `ctrl` → cyan, plus the originals `planetscale` → red, `hiradp` → green, everything else → blue. The `htask-*` / `hprobe-*` prefixes match the tmux sessions [htools](https://github.com/hiradp/htools) opens (`htask start`, `hprobe`), so a dev task, an incident probe, and the control session are colour-coded apart at a glance.

## Commit style

Conventional Commits with a tool-scoped prefix: `feat(nvim): …`, `chore(brew): …`, `fix(tmux): …`, `style(home): …`. Match recent `git log` exactly when in doubt. Commits are typically tight and single-purpose.
