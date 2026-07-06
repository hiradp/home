function claude --wraps=claude --description 'claude: default identity, always max effort'
    # Default Claude identity: ~/.claude, run with CLAUDE_CONFIG_DIR unset so it
    # keeps the plain `Claude Code-credentials` Keychain login. An explicit
    # CLAUDE_CONFIG_DIR would point at a suffixed Keychain item and force a re-login,
    # so leave it unset here. The `claude-ps` sibling opts into exactly that to run a
    # second identity from ~/.claude-ps. This wrapper only forces max effort.
    command claude --effort=max $argv
end
