return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        rust_analyzer = {
          settings = {
            ["rust-analyzer"] = {
              procMacro = {
                enable = true,
                ignored = {
                  -- Add any macros you want to ignore here
                  -- ["async_trait"] = { "async_trait" },
                },
              },
              cargo = {
                loadOutDirsFromCheck = true,
                buildScripts = {
                  enable = true,
                },
              },
            },
          },
        },
      },
    },
  },
}
