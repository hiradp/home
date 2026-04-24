#!/bin/bash
# Single-line Claude Code statusline:
#   folder@branch (git status) | model | [progress bar with label inside]

set -f # disable globbing

input=$(cat)

if [ -z "$input" ]; then
  printf "Claude"
  exit 0
fi

# ===== Colors =====
dim='\033[2m'
reset='\033[0m'
# Subdued colors for git status indicators
git_add_color='\033[38;2;0;180;0m'
git_del_color='\033[38;2;200;60;60m'
git_branch_color='\033[38;2;100;160;200m'

sep="${dim} | ${reset}"

# ===== Extract data =====
cwd=$(echo "$input" | jq -r '.cwd // empty')
model_name=$(echo "$input" | jq -r '.model.display_name // "Claude"')
# Strip " (NNk context)" / " (NM context)" suffix
model_name=$(echo "$model_name" | sed 's/ *([0-9.]*[kKmM]* context)//')
effort_level=$(echo "$input" | jq -r '.effort.level // empty')

# Context window
size=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
[ "$size" -eq 0 ] 2>/dev/null && size=200000

input_tokens=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
cache_create=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
cache_read=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
current=$((input_tokens + cache_create + cache_read))

if [ "$size" -gt 0 ]; then
  pct_real=$((current * 100 / size))
else
  pct_real=0
fi

# Scale: 80% real -> 100% displayed; cap at 100
pct_scaled=$(( pct_real * 100 / 80 ))
[ "$pct_scaled" -gt 100 ] && pct_scaled=100

# ===== Progress bar (10 chars) =====
# Bright colors for the progress bar
bright_green='\033[1;32m'
bright_yellow='\033[1;33m'
bright_orange='\033[1;38;2;255;140;0m'
bright_red='\033[1;31m'

filled=$(( pct_scaled * 10 / 100 ))
[ "$filled" -gt 10 ] && filled=10
empty=$((10 - filled))

# Pick bar color based on scaled percentage
if [ "$pct_scaled" -ge 95 ]; then
  bar_color="$bright_red"
elif [ "$pct_scaled" -ge 65 ]; then
  bar_color="$bright_orange"
elif [ "$pct_scaled" -ge 50 ]; then
  bar_color="$bright_yellow"
else
  bar_color="$bright_green"
fi

bar="${bar_color}"
i=0
while [ "$i" -lt "$filled" ]; do
  bar+="█"
  i=$((i + 1))
done
i=0
while [ "$i" -lt "$empty" ]; do
  bar+="░"
  i=$((i + 1))
done
bar+="${reset}"

# ===== Folder + git =====
folder_part=""
if [ -n "$cwd" ]; then
  display_dir="${cwd##*/}"
  folder_part="${display_dir}"

  git_branch=$(git -C "${cwd}" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -n "$git_branch" ]; then
    folder_part+="${dim}@${reset}${git_branch_color}${git_branch}${reset}"
    git_stat=$(git -C "${cwd}" --no-optional-locks diff --numstat 2>/dev/null | awk '{a+=$1; d+=$2} END {if (a+d>0) printf "+%d -%d", a, d}')
    if [ -n "$git_stat" ]; then
      add_part="${git_stat%% *}"
      del_part="${git_stat##* }"
      folder_part+="${dim} (${reset}${git_add_color}${add_part}${reset}${dim} ${reset}${git_del_color}${del_part}${reset}${dim})${reset}"
    fi
  fi
fi

# ===== Assemble =====
out=""
[ -n "$folder_part" ] && out+="${folder_part}${sep}"
model_part="${model_name}"
if [ -n "$effort_level" ]; then
  # Ramp matches the context bar: green → yellow → orange → red
  case "$effort_level" in
    low|medium) effort_color='\033[1;32m' ;;
    high)       effort_color='\033[1;33m' ;;
    xhigh)      effort_color='\033[1;38;2;255;140;0m' ;;
    max)        effort_color='\033[1;31m' ;;
    *)          effort_color='\033[1;38;2;180;140;255m' ;;
  esac
  model_part+="${dim} · ${reset}${effort_color}${effort_level}${reset}"
fi
out+="${model_part}${sep}"
# Format context limit: 1000000 → 1M, 200000 → 200k
if [ "$size" -ge 1000000 ]; then
  size_fmt="$(( size / 1000000 ))M"
elif [ "$size" -ge 1000 ]; then
  size_fmt="$(( size / 1000 ))k"
else
  size_fmt="$size"
fi
out+="${bar} ${bar_color}${pct_scaled}%${reset}${dim} / ${size_fmt}${reset}"

printf "%b" "$out"
exit 0
