function claude --wraps=claude --description 'claude: pick config dir + statusline tag by context'
    # Two identities live in separate config dirs: ~/.claude-work and ~/.claude-personal.
    # The machine DEFAULT profile uses the unset ~/.claude (which symlinks to its dir) so it
    # keeps its macOS Keychain login; the non-default profile gets an explicit CLAUDE_CONFIG_DIR.
    #
    # The machine DEFAULT profile is read straight from the ~/.claude symlink target
    # (single source of truth — no shell-startup var needed, so it can't go stale).
    # An explicit $claude_default_profile overrides it if ever required.
    #
    # Per-machine policy (set in the work repo's fish config; absent on a personal-only
    # machine → personal default, no overrides):
    #   set -g claude_personal_dirs    <dirs that force the personal profile>
    #   set -g claude_work_dirs        <dirs that force the work profile>
    set -l default_profile personal
    switch (readlink ~/.claude 2>/dev/null)
        case '*/.claude-work';     set default_profile work
        case '*/.claude-personal'; set default_profile personal
    end
    set -q claude_default_profile; and set default_profile $claude_default_profile
    set -q claude_personal_dirs; or set -l claude_personal_dirs
    set -q claude_work_dirs;     or set -l claude_work_dirs

    set -l work_tag     '🪐 PlanetScale'; set -l work_color     '\033[1;38;2;90;160;255m'
    set -l personal_tag '👤 personal';    set -l personal_color '\033[1;38;2;200;120;255m'

    # Start from the machine default, then let per-repo overrides win.
    set -l profile $default_profile
    for dir in $claude_personal_dirs
        if string match -q -- "$dir" "$PWD"; or string match -q -- "$dir/*" "$PWD"
            set profile personal; break
        end
    end
    for dir in $claude_work_dirs
        if string match -q -- "$dir" "$PWD"; or string match -q -- "$dir/*" "$PWD"
            set profile work; break
        end
    end

    switch $profile
        case work
            test "$default_profile" = work; or set -fx CLAUDE_CONFIG_DIR $HOME/.claude-work
            set -fx CLAUDE_STATUS_TAG $work_tag
            set -fx CLAUDE_STATUS_TAG_COLOR $work_color
        case personal
            test "$default_profile" = personal; or set -fx CLAUDE_CONFIG_DIR $HOME/.claude-personal
            set -fx CLAUDE_STATUS_TAG $personal_tag
            set -fx CLAUDE_STATUS_TAG_COLOR $personal_color
    end

    command claude --effort=max $argv
end
