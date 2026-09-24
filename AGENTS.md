# AGENTS.md

This file provides guidance to coding agents working in this repository.

## What this repo is

Personal dotfiles, managed by the `home` CLI in `bin/home`. Most of the repo is bash + GNU stow + Homebrew package lists. Coding agent configuration (Pi, Claude, Codex, herdr) lives in the separate private `bots` repository.

## Common commands

```bash
home setup                # First-time machine setup (brew + ssh + remotes + bots clone + install + bots setup + link)
home install [type]       # Install packages: essentials | casks | langs | tools | all (default); runs `work install` when $WORK_DIR exists
home link [folders...]    # Stow configs into $HOME (default: all in $DEFAULT_FOLDERS); `bots` runs `bots link`
home upgrade              # git pull --ff-only, `bots upgrade`, brew update/upgrade, nvim Lazy! sync; runs `work upgrade` when $WORK_DIR exists
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

### Claude config (two identities)

Claude Code's tracked config — `settings.json`, the statusline, and the global `CLAUDE.md` — lives in the `bots` repo under `claude/`, which `bots link claude` Stows into `~/.claude` for the **default** identity. A **second** identity lives in `~/.claude-ps`, reached via the `claude-ps` wrapper, which stays in this repo because it is shell config. Its login, sessions and history are separate, but `bots link claude` also symlinks its `settings.json` and `CLAUDE.md` to the same tracked files — so **settings and statusline are identical across both**. See below.

**Why the default leaves `CLAUDE_CONFIG_DIR` unset (important):** on macOS the login is stored in the Keychain, keyed per config dir — the unset default gets the plain `Claude Code-credentials` item, while an explicit `CLAUDE_CONFIG_DIR` gets a *suffixed* one. So the default `claude` must run with `CLAUDE_CONFIG_DIR` **unset** (it resolves `~/.claude` plus the home-level `~/.claude.json`); pointing it at an explicit dir would hit a different Keychain item and force a re-login. `claude.fish` leaves it alone on purpose.

**The two wrappers** live in `config/fish/.config/fish/functions/`:
- `claude.fish` — the default identity. Leaves `CLAUDE_CONFIG_DIR` unset (see above) and only forces `--effort=max`.
- `claude-ps.fish` — a second identity. Sets `CLAUDE_CONFIG_DIR=~/.claude-ps` (function-scoped, so it never leaks into the shell) and also forces `--effort=max`. The explicit dir gives it its own *suffixed* Keychain login, separate from the default — that separation is the entire point. `home link` symlinks `~/.claude-ps/settings.json` → the tracked `settings.json`, so settings + statusline stay identical to the default; only login, sessions and history diverge. Claude prompts a one-time login on the first `claude-ps` run.

**Statusline** is `claude/statusline.sh` in `bots`, linked to `~/.claude/statusline.sh` and referenced by that path from the shared `settings.json`. Since both identities run the same script, it self-detects the identity from `$CLAUDE_CONFIG_DIR` and prints a trailing chip — `max` (purple) for the default, `enterprise` (blue) for `claude-ps` — so the active identity is always visible.

### Bots (agent config)

Agent configuration lives in the private `bots` repository, cloned to `$BOTS_DIR` (default `~/Code/hiradp/bots`) from `$BOTS_REPO`. It has its own `bin/bots` CLI, and this repo only chains to it, the same way it chains to `work`: `home setup` clones it and runs `bots setup`, the `bots` entry in `DEFAULT_FOLDERS` makes `home link` run `bots link`, and `home upgrade` runs `bots upgrade`. Pi's config (Stowed into `~/.pi/agent`), Claude's config (see below), Codex's config (including the `config.managed.toml` merge into `~/.codex/config.toml`), herdr's `config.toml`, and the skills shared across those agents live there; keep agent settings, extensions, skills, and their linking logic in that repository. This repo keeps only what is not agent config: Homebrew packages (including `herdr`), the `claude-ps` fish wrapper, and `bin/h`, the herdr workspace launcher.

### Package lists

`pkg/brew/{essentials,cask}` are plain newline-separated text files; `#` comments and blank lines are skipped. `pkg/lang/*` are shell snippets (one per runtime: go, rust) that get **sourced** (not executed) from `_install_langs`, so they share the parent shell's environment and `log_*` helpers.

`pkg/tool/*` follow the same pattern for standalone tools installed outside Homebrew (e.g. cursor CLI). Sourced from `_install_tools`.

Everything here must be tap-free — plain `brew install` off homebrew-core or a cask. A package that needs its own tap belongs somewhere else or nowhere; carrying a tap file for one binary is what got `dark-notify` dropped.

Work-only packages live in the work repo's own `pkg/` (see `$WORK_DIR/AGENTS.md`), not here — `home install` chains to `work install`, so both lists get applied on a work machine. Slack, Notion, and Ruby are work-owned for that reason.

### Logging convention

All scripts (except `bootstrap`, which inlines its own copy because it runs before the repo exists) source `lib/log.sh` and use `log_banner / log_section / log_info / log_ok / log_warn / log_error / log_dim`. Use these instead of raw `echo` to keep output consistent. Every bash file starts with `set -euo pipefail`.

### Two-remote setup

`origin` points to the **private** mirror `git@github.com:hiradp/home-private.git`; `upstream` points to the **public** `git@github.com:hiradp/home.git`. `home setup` configures these automatically when the user has access to the private repo. `main` tracks `origin/main`. To publish a subset of private commits to upstream, use the `manage-upstream` skill at `.claude/skills/manage-upstream/SKILL.md` — do not push to `upstream` ad-hoc.

### tmux-sessionizer

`bin/tmux-sessionizer` is a substantial script that creates tmux sessions from `.tmux-config.yaml` files (or auto-discovers from subdirectories). Full schema is documented in the script header — read it before changing layout/pane logic. Supports preset layouts (`main-horizontal` etc.), recursive tree layouts (split maps with `panes`), and absolute / `~`-prefixed `dir` values.

### tmux colours

Dark only, all of it in `.tmux.conf`. The *surface* (`@bg`/`@fg`/`status-bg`/`pane-border-style`) is set inline near the top of the Style section. There used to be `themes/{light,dark}.conf` and a `bin/tmux-theme` watcher that swapped them on macOS appearance changes; both are gone, so don't reintroduce a `~/.config/tmux/themes` lookup.

`@theme` is the per-session *accent*, mapping the **session name** to a status-bar colour, re-evaluated per session via `#{E:@theme}`: `planetscale` → red, `hiradp` → green, and everything else → blue.

## Commit style

Conventional Commits with a tool-scoped prefix: `feat(nvim): …`, `chore(brew): …`, `fix(tmux): …`, `style(home): …`. Match recent `git log` exactly when in doubt. Commits are typically tight and single-purpose.
