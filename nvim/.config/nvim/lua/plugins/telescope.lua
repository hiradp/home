return {
    -- Search and fzf
    {
        'nvim-telescope/telescope.nvim',
        event = 'VimEnter',
        branch = '0.1.x',
        dependencies = {
            'nvim-lua/plenary.nvim',
            {
                'nvim-telescope/telescope-fzf-native.nvim',
                build = 'make',
            },
            { 'nvim-telescope/telescope-ui-select.nvim' },
        },
        config = function()
            require('telescope').setup {
                extensions = {
                    ['ui-select'] = {
                        require('telescope.themes').get_dropdown(),
                    },
                },
            }

            require('telescope').load_extension 'fzf'
            require('telescope').load_extension 'ui-select'

            local builtin = require 'telescope.builtin'
            vim.keymap.set(
                'n',
                '<leader><leader>',
                builtin.git_files,
                { desc = '[ ] Search git files' }
            )
            vim.keymap.set('n', '<leader>sf', builtin.find_files, { desc = '[S]earch [F]iles' })
            vim.keymap.set('n', '<leader>st', builtin.builtin, { desc = '[S]earch [T]elescope' })
        end,
    },
}
