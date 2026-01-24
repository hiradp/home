#!/usr/bin/env bash
#
# Minimal logging library for clean, informative output
#

# Colors (with TTY detection for fallback)
if [[ -t 1 ]]; then
  _LOG_GREEN='\033[32m'
  _LOG_RED='\033[31m'
  _LOG_YELLOW='\033[33m'
  _LOG_DIM='\033[2m'
  _LOG_RESET='\033[0m'
else
  _LOG_GREEN=''
  _LOG_RED=''
  _LOG_YELLOW=''
  _LOG_DIM=''
  _LOG_RESET=''
fi

# Clean section divider for start/end
log_banner() {
  echo ""
  echo "─── $1 ───"
  echo ""
}

# Major step (▸ prefix, blank line before)
log_section() {
  echo ""
  echo "▸ $1"
}

# Sub-step (indented)
log_info() {
  echo "  $1"
}

# Success (✓ prefix, indented, green)
log_ok() {
  echo -e "  ${_LOG_GREEN}✓${_LOG_RESET} $1"
}

# Error (✗ prefix, indented, red, stderr)
log_error() {
  echo -e "  ${_LOG_RED}✗${_LOG_RESET} $1" >&2
}

# Warning (! prefix, indented, yellow)
log_warn() {
  echo -e "  ${_LOG_YELLOW}!${_LOG_RESET} $1"
}

# Secondary info (dim gray, indented)
log_dim() {
  echo -e "  ${_LOG_DIM}$1${_LOG_RESET}"
}
