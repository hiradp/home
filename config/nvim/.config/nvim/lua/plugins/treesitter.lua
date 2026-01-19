return {
    -- Highlight, edit, and navigate code
    {
        'nvim-treesitter/nvim-treesitter',
        build = ':TSUpdate',
        opts = {
            ensure_installed = {
                'bash',
                'diff',
                'json',
                'jsonc',
                'lua',
                'markdown',
                'markdown_inline',
                'python',
                'query',
                'rust',
                'toml',
                'vim',
                'vimdoc',
                'yaml',
            },
            auto_install = true,
            highlight = {
                enable = true,
            },
            incremental_selection = {
                enable = true,
                keymaps = {
                    init_selection = '<C-space>',
                    node_incremental = '<C-space>',
                    scope_incremental = false,
                    node_decremental = '<bs>',
                },
            },
            indent = { enable = true },
        },
        config = function(_, opts)
            require('nvim-treesitter.configs').setup(opts)
        end,
    },
}
