function claude --wraps=claude --description 'claude: always run at max effort'
    # Single Claude identity: ~/.claude, run as the unset default so it keeps its
    # macOS Keychain login (the plain `Claude Code-credentials` item). Setting an
    # explicit CLAUDE_CONFIG_DIR would point at a suffixed Keychain item and force
    # a re-login, so leave it alone. This wrapper now only forces max effort.
    command claude --effort=max $argv
end
