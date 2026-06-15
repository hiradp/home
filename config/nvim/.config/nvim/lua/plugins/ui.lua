return {
  -- automatic dark mode
  {
    "cormacrelf/dark-notify",
    config = function()
      require("dark_notify").run({
        schemes = {
          dark = "tokyonight",
          light = "gruvbox",
        },
      })
    end,
  },
  -- colorscheme
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000, -- make sure to load this before all the other start plugins
    opts = {
      contrast = "hard",
      transparent_mode = true,
    },
  },
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      style = "night",
      transparent = true,
      styles = {
        floats = "transparent",
        sidebars = "transparent",
      },
    },
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
        position = "left",
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
