return {
    -- Git helpers and visual aids
    {
        'lewis6991/gitsigns.nvim',
        opts = {
            current_line_blame = true,
            signs = {
                add = { text = '+' },
                change = { text = '~' },
                delete = { text = '_' },
                topdelete = { text = '‾' },
                changedelete = { text = '~' },
            },
        },
    },
}
