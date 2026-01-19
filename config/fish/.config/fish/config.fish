# Hirad's Fish Config

# Disable greeting message
set -U fish_greeting

# set project directory
set -x HOME_DIR $HOME/Code/hiradp/home
set -x WORK_DIR $HOME/Code/hiradp/work

# Set local bin
set -x PATH $PATH $HOME/.local/bin
set -x PATH $PATH $HOME_DIR/bin

# Allow for subdirs in ./functions/
set -x fish_function_path ~/.config/fish/functions/*/ $fish_function_path
set -x fish_function_path ~/.config/fish/functions $fish_function_path

switch (uname)
    case Darwin
        # brew
        eval (/opt/homebrew/bin/brew shellenv)
end

# Go Lang
set -x GOPATH $HOME/.local/go
set -U fish_user_paths $GOPATH/bin $fish_user_paths

# Rust
set -U fish_user_paths $HOME/.cargo/bin $fish_user_paths

if status is-interactive
    # Commands to run in interactive sessions can go here
end

if test -f $WORK_DIR/fish/work.fish
    source $WORK_DIR/fish/work.fish
end

# --- starship.rs ---
starship init fish | source

# --- languages ---
set -gx PATH /opt/homebrew/opt/node@22/bin $PATH

# --- Tools ---
fzf --fish | source

# The next line updates PATH for the Google Cloud SDK.
if test -f ~/.local/opt/google-cloud-sdk/path.fish.inc
    source ~/.local/opt/google-cloud-sdk/path.fish.inc
end
set -x USE_GKE_GCLOUD_AUTH_PLUGIN True

# Set kubectl editor
set -x KUBE_EDITOR nvim
