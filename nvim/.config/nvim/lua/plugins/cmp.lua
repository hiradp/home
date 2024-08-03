return {
    -- Copilot
    {
        'zbirenbaum/copilot.lua',
        cmd = 'Copilot',
        build = ':Copilot auh',
        opts = {
            suggestion = { enabled = false },
            panel = { enabled = false },
        },
    },
    -- Autocompletion
    {
        'hrsh7th/nvim-cmp',
        event = 'InsertEnter',
        dependencies = {
            -- Adds other completion capabilities.
            'hrsh7th/cmp-buffer',
            'hrsh7th/cmp-cmdline',
            'hrsh7th/cmp-emoji',
            'hrsh7th/cmp-nvim-lsp',
            'hrsh7th/cmp-nvim-lua',
            'hrsh7th/cmp-path',
            { 'zbirenbaum/copilot-cmp', dependencies = 'copilot.lua', opts = {} },
        },
        config = function()
            local cmp = require 'cmp'
            cmp.setup {
                completion = { completeopt = 'menu,menuone,noinsert' },

                mapping = cmp.mapping.preset.insert {
                    ['<C-y>'] = cmp.mapping.confirm { select = true },
                    ['<C-Space>'] = cmp.mapping.complete {},
                    ['<C-n>'] = cmp.mapping.select_next_item(),
                    ['<C-p>'] = cmp.mapping.select_prev_item(),
                    ['<C-b>'] = cmp.mapping.scroll_docs(-4),
                    ['<C-f>'] = cmp.mapping.scroll_docs(4),
                },
                sources = {
                    { name = 'buffer' },
                    { name = 'cmdline' },
                    { name = 'copilot', group_index = 1, priority = 100 },
                    { name = 'emoji' },
                    { name = 'nvim_lsp' },
                    { name = 'nvim_lua' },
                    { name = 'lazydev', group_index = 0 },
                    { name = 'path' },
                },
            }
        end,
    },
}
