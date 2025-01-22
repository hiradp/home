return {
    -- File explorer until git gud.
    {
        'nvim-neo-tree/neo-tree.nvim',
        branch = 'v3.x',
        dependencies = {
            'nvim-lua/plenary.nvim',
            'MunifTanjim/nui.nvim',
        },
        opts = {
            sources = {
                'filesystem',
                'buffers',
                'git_status',
                'document_symbols',
            },
            enable_cursor_hijack = true, -- keep the cursor on the first letter of the filename when moving in the tree.
            default_component_configs = {
                icon = {
                    folder_closed = '*',
                    folder_open = '*',
                    folder_empty = '*',
                    default = '•',
                    highlight = 'NeoTreeFileIcon',
                },
                git_status = {
                    symbols = {
                        -- Change type
                        added = '+',
                        modified = '~',
                        deleted = 'x',
                        renamed = '->',
                        -- Status type
                        untracked = '?',
                        ignored = 'i',
                        unstaged = 'u',
                        staged = 's',
                        conflict = 'c',
                    },
                },
            },
            filesystem = {
                filtered_items = {
                    hide_dotfiles = false,
                    hide_gitignored = false,
                    hide_by_name = {
                        '.DS_Store',
                        '.git',
                        '.idea',
                        'target',
                    },
                },
                follow_current_file = {
                    enabled = true,
                },
            },
            window = {
                position = 'right',
                mappings = {
                    ['<bs>'] = 'none',
                    ['<space>'] = 'none',
                },
            },
        },
        init = function()
            vim.keymap.set(
                'n',
                '<leader>e',
                '<cmd>Neotree toggle<cr>',
                { desc = 'File [E]xplorer' }
            )
        end,
    },
}
