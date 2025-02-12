return {
  {
    "mrcjkb/rustaceanvim",
    opts = {
      server = {
        default_settings = {
          ["rust-analyzer"] = {
            procMacro = {
              ignored = {
                ["async-trait"] = {},
                ["napi-derive"] = { "napi" },
                ["async-recursion"] = { "async_recursion" },
              },
            },
          },
        },
      },
    },
  },
  -- {
  --   "neovim/nvim-lspconfig",
  --   opts = {
  --     servers = {
  --       rust_analyzer = {
  --         settings = {
  --           ["rust-analyzer"] = {
  --             procMacro = {
  --               enable = true,
  --               ignored = {
  --                 -- Add any macros you want to ignore here
  --                 -- ["async_trait"] = { "async_trait" },
  --               },
  --             },
  --           },
  --         },
  --       },
  --     },
  --   },
  -- },
}
