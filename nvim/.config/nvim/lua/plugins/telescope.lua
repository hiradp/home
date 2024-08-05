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
            vim.keymap.set('n', '<leader><leader>', function()
                local ok = pcall(builtin.git_files)
                if not ok then
                    builtin.find_files()
                end
            end, { desc = '[ ] Search files' })
            vim.keymap.set('n', '<leader>sb', builtin.buffers, { desc = '[S]earch [B]uffers' })
            vim.keymap.set('n', '<leader>st', builtin.builtin, { desc = '[S]earch [T]elescope' })
        end,
    },
}
