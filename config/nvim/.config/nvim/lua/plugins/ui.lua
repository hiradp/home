return {
  -- Follow the terminal background, which Neovim updates on theme changes.
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "system",
    },
  },
  -- colorscheme
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000, -- make sure to load this before all the other start plugins
    opts = {
      contrast = "hard",
      palette_overrides = {
        dark0 = "#4f3829",
        dark1 = "#654735",
        dark2 = "#6f5645",
        dark3 = "#6f6259",
        dark4 = "#6f6259",
        faded_aqua = "#3f6f52",
        faded_blue = "#45707a",
        faded_green = "#596526",
        faded_orange = "#8f4d12",
        faded_purple = "#7f4f6d",
        faded_red = "#a83f3f",
        faded_yellow = "#8a5607",
        gray = "#6f6259",
        light0_hard = "#fbf1c7",
        neutral_aqua = "#3f6f52",
        neutral_blue = "#45707a",
        neutral_green = "#596526",
        neutral_orange = "#8f4d12",
        neutral_purple = "#7f4f6d",
        neutral_red = "#a83f3f",
        neutral_yellow = "#8a5607",
      },
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
