function claude-ps --wraps=claude --description 'claude: second identity in ~/.claude-ps'
    # Second Claude identity, kept in its own config dir. An explicit
    # CLAUDE_CONFIG_DIR resolves to a *suffixed* macOS Keychain item, so this
    # profile logs in separately from the default `claude` (which leaves the var
    # unset — see AGENTS.md); that separation is the whole point. Only login,
    # sessions and history diverge — settings + statusline are shared, since
    # `home link` symlinks ~/.claude-ps/settings.json to the file `bots link` generates.
    # Function-scoped (`set -fx`) so it never leaks into the interactive shell.
    set -fx CLAUDE_CONFIG_DIR $HOME/.claude-ps
    command claude $argv
end
