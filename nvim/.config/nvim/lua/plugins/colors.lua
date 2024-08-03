return {
    -- Colors for my eyes
    {
        'EdenEast/nightfox.nvim',
        opts = {
            options = {
                transparent = true,
            },
        },
        init = function()
            vim.cmd [[colorscheme carbonfox]]
        end,
    },
}
