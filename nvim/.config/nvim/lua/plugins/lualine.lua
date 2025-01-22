return {
    -- Statusline
    {
        'nvim-lualine/lualine.nvim',
        opts = {
            options = {
                icons_enabled = false,
                component_separators = { left = '', right = '' },
                section_separators = { left = '', right = '' },
                disabled_filetypes = {
                    'neo-tree',
                },
            },
            sections = {
                lualine_a = { 'buffers' },
                lualine_b = { 'branch', 'diff', 'diagnostics' },
                lualine_c = {},
                lualine_x = { 'encoding', 'filesize', 'fileformat', 'filetype' },
                lualine_y = { 'progress', 'location' },
                lualine_z = { 'mode' },
            },
            inactive_sections = {
                lualine_a = {},
                lualine_b = {},
                lualine_c = {},
                lualine_x = {},
                lualine_y = {},
                lualine_z = {},
            },
            extensions = { 'neo-tree' },
        },
    },
}
