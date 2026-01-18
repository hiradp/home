# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a personal dotfiles repository managed with GNU Stow. It contains configuration files for a macOS development environment including Neovim, Fish shell, tmux, and various terminal tools.

## Installation

```bash
# Install all default configs (aerospace, fish, ghostty, git, nvim, starship, tmux)
./install.sh

# Install specific folders only
STOW_FOLDERS="nvim fish" ./install.sh

# Use a different dotfiles location
DOTFILES=/path/to/dotfiles ./install.sh
```

The install script uses `stow` to symlink each folder's contents to `$HOME`. Each top-level directory follows the stow convention where files are placed relative to where they'll be symlinked (e.g., `nvim/.config/nvim/` → `~/.config/nvim/`).

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `nvim/` | Neovim config with lazy.nvim plugin manager |
| `fish/` | Fish shell config and custom functions |
| `git/` | Global gitconfig |
| `tmux/` | tmux configuration |
| `starship/` | Starship prompt configuration |
| `ghostty/` | Ghostty terminal config |
| `aerospace/` | AeroSpace window manager config |
| `brew/` | Homebrew package lists (essentials, casks) |
| `scripts/` | Utility scripts (tmux-sessionizer) |

## Neovim Architecture

- **Plugin Manager**: lazy.nvim with automatic updates enabled
- **Config Location**: `nvim/.config/nvim/`
- **Plugin Configs**: `lua/plugins/*.lua` (each file auto-loaded by lazy.nvim)
- **Leader Key**: Space

Key plugin files:
- `code.lua` - LSP setup (Mason, nvim-lspconfig)
- `telescope.lua` - Fuzzy finder
- `harpoon.lua` - Quick file navigation
- `conform.lua` - Code formatting
- `neo-tree.lua` - File explorer
- `treesitter.lua` - Syntax highlighting

## Key Bindings Reference

**Neovim:**
- `<leader>` = Space
- `gd` - Go to definition
- `gr` - Go to references
- `<C-h/j/k/l>` - Navigate splits
- `bd` - Close all buffers except current
- `J/K` in visual mode - Move lines up/down

**tmux:**
- Prefix: `Ctrl+A` (not default Ctrl+B)
