if vim.o.background == "light" then
  require("gruvbox").load()
else
  require("tokyonight").load({ style = "night" })
end

vim.g.colors_name = "system"
