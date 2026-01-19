return {
    -- Autoformat
    {
        'stevearc/conform.nvim',
        lazy = false,
        keys = {
            {
                '<leader>f',
                function()
                    require('conform').format { async = true, lsp_fallback = true }
                end,
                mode = '',
                desc = '[F]ormat buffer',
            },
        },
        opts = {
            notify_on_error = false,
            formatters_by_ft = {
                lua = { 'stylua' },
                rust = { 'rustfmt', lsp_format = 'fallback' },
            },
            format_on_save = {
                lsp_fallback = true,
            },
        },
    },
}
