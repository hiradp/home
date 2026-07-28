#!/usr/bin/env bash
#
# Shared package-list installers for `home` and `work`.
#
# Both repos use the same pkg/ layout — newline-separated Homebrew lists under
# pkg/brew/, sourced shell snippets under pkg/lang/ and pkg/tool/ — so the
# helpers take a path rather than assuming a repo root.
#
# Requires lib/log.sh to be sourced first.
#

# Install every package named in a Homebrew list file. Blank lines and `#`
# comments are skipped. `flag` is passed through to `brew install` (e.g. --cask).
pkg_install_from_file() {
  local file="$1"
  local flag="${2:-}"

  if [[ ! -f "$file" ]]; then
    log_error "File not found: $file"
    exit 1
  fi

  while IFS= read -r package || [[ -n "$package" ]]; do
    [[ -z "$package" || "$package" =~ ^# ]] && continue
    log_dim "Installing $package..."
    if ! brew install $flag "$package" </dev/null; then
      log_warn "Failed to install $package (may already exist outside Homebrew)"
    fi
  done <"$file"
}

# Source every snippet in a directory. Snippets are sourced, not executed, so
# they share the caller's environment and log_* helpers. A missing directory is
# not an error — neither repo is expected to carry every category.
pkg_source_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  for script in "$dir"/*; do
    [[ -f "$script" ]] || continue
    log_dim "$(basename "$script")"
    source "$script"
  done
}
