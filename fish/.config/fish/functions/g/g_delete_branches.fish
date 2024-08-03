function g_delete_branches
    git branch | grep -v "main" | xargs git branch -D
end
