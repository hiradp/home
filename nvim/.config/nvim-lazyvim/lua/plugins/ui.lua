return {
  {
    "scottmckendry/cyberdream.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      require("cyberdream").setup({
        transparent = true,
      })

      vim.cmd("colorscheme cyberdream")
    end,
  },
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      filesystem = {
        filtered_items = {
          hide_dotfiles = false,
          hide_gitignored = false,
          hide_by_name = {
            ".DS_Store",
            ".git",
            ".idea",
            "target",
          },
        },
        follow_current_file = {
          enabled = true,
        },
      },
      window = {
        position = "right",
        mappings = {
          ["<bs>"] = "none",
          ["<space>"] = "none",
        },
      },
    },
  },
  {
    "lewis6991/gitsigns.nvim",
    opts = {
      current_line_blame = true,
    },
  },
}
