function qq --wraps='tmux kill-session' --description 'alias qq tmux kill-session'
  tmux kill-session $argv
end
