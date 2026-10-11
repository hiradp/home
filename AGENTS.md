# AGENTS.md

This file provides guidance to coding agents working in this repository.

## What this repo is

Personal dotfiles, managed by the `home` CLI in `bin/home`. Most of the repo is bash + GNU stow + Homebrew package lists. Coding agent configuration (Pi, Claude, Codex, herdr) lives in the separate `bots` repository.

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

Claude Code's tracked config — `settings.json`, the statusline, and the global `CLAUDE.md` — lives in the `bots` repo, and `bots link claude` links it into `~/.claude` for the **default** identity. A **second** identity lives in `~/.claude-ps`, reached via the `claude-ps` wrapper, which stays in this repo because it is shell config. Its login, sessions and history are separate, but `bots link claude` links both identities to the one settings file and the one instructions file it generates — so **settings and statusline are identical across both**. See below.

**Why the default leaves `CLAUDE_CONFIG_DIR` unset (important):** on macOS the login is stored in the Keychain, keyed per config dir — the unset default gets the plain `Claude Code-credentials` item, while an explicit `CLAUDE_CONFIG_DIR` gets a *suffixed* one. So the default `claude` must run with `CLAUDE_CONFIG_DIR` **unset** (it resolves `~/.claude` plus the home-level `~/.claude.json`); pointing it at an explicit dir would hit a different Keychain item and force a re-login. So there is deliberately no `claude` wrapper: the bare binary leaves it alone.

**The wrapper** is `config/fish/.config/fish/functions/claude-ps.fish`, for the second identity. It sets `CLAUDE_CONFIG_DIR=~/.claude-ps` (function-scoped, so it never leaks into the shell) and nothing else — no effort flag, so both identities follow `effortLevel` in the shared `settings.json`. The explicit dir gives it its own *suffixed* Keychain login, separate from the default — that separation is the entire point. `home link` symlinks `~/.claude-ps/settings.json` → the settings file `bots link` generates, so settings + statusline stay identical to the default; only login, sessions and history diverge. Claude prompts a one-time login on the first `claude-ps` run.

**Statusline** is `claude/statusline.sh` in `bots`, linked to `~/.claude/statusline.sh` and referenced by that path from the shared `settings.json`. Since both identities run the same script, it self-detects the identity from `$CLAUDE_CONFIG_DIR` and prints a trailing chip — `max` (purple) for the default, `enterprise` (blue) for `claude-ps` — so the active identity is always visible.

### Bots (agent config)

Agent configuration lives in the `bots` repository, cloned to `$BOTS_DIR` (default `~/Code/hiradp/bots`) from `$BOTS_REPO`. It has its own `bin/bots` CLI, and this repo only chains to it, the same way it chains to `work`: `home setup` clones it and runs `bots setup`, the `bots` entry in `DEFAULT_FOLDERS` makes `home link` run `bots link`, and `home upgrade` runs `bots upgrade`. Pi's config (Stowed into `~/.pi/agent`), Claude's config (see below), Codex's config (including the `config.managed.toml` merge into `~/.codex/config.toml`), herdr's `config.toml`, and the skills shared across those agents live there; keep agent settings, extensions, skills, and their linking logic in that repository. This repo keeps only what is not agent config: Homebrew packages (including `herdr`), the `claude-ps` fish wrapper, and the personal config for `desk` (`config/desk`), the CLI in `hiradp/desk` that builds the Rex workspace; `pkg/tool/desk` installs it, and the config includes the work targets from `$WORK_DIR/config/desk/desk.toml`.

### Package lists

`pkg/brew/{essentials,cask}` are plain newline-separated text files; `#` comments and blank lines are skipped. `pkg/lang/*` are shell snippets (one per runtime: go, node, rust, zig) that get **sourced** (not executed) from `_install_langs`, so they share the parent shell's environment and `log_*` helpers.

`pkg/tool/*` follow the same pattern for standalone tools installed outside Homebrew (e.g. cursor CLI, git-forest, desk). Sourced from `_install_tools`.

Everything here must be tap-free — plain `brew install` off homebrew-core or a cask. A package that needs its own tap belongs somewhere else or nowhere; carrying a tap file for one binary is what got `dark-notify` dropped.

Work-only packages live in the work repo's own `pkg/` (see `$WORK_DIR/AGENTS.md`), not here — `home install` chains to `work install`, so both lists get applied on a work machine. Slack, Notion, and Ruby are work-owned for that reason.

### Logging convention

All scripts (except `bootstrap`, which inlines its own copy because it runs before the repo exists) source `lib/log.sh` and use `log_banner / log_section / log_info / log_ok / log_warn / log_error / log_dim`. Use these instead of raw `echo` to keep output consistent. Every bash file starts with `set -euo pipefail`.

### Two-remote setup

`origin` points to the **private** mirror `git@github.com:hiradp/home-private.git`; `public` points to the **public** `git@github.com:hiradp/home.git`. `home setup` configures these automatically when the user has access to the private repo. `main` tracks `origin/main`. Publishing is a deliberate `git push public main` by the user — do not push to `public` ad-hoc.

### tmux-sessionizer

`bin/tmux-sessionizer` is a substantial script that creates tmux sessions from `.tmux-config.yaml` files (or auto-discovers from subdirectories). Full schema is documented in the script header — read it before changing layout/pane logic. Supports preset layouts (`main-horizontal` etc.), recursive tree layouts (split maps with `panes`), and absolute / `~`-prefixed `dir` values.

## Commit style

Conventional Commits with a tool-scoped prefix: `feat(nvim): …`, `chore(brew): …`, `fix(tmux): …`, `style(home): …`. Match recent `git log` exactly when in doubt. Commits are typically tight and single-purpose.
