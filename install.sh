#!/usr/bin/env bash

if [[ -z $STOW_FOLDERS ]]; then
  STOW_FOLDERS="aerospace fish ghostty git nvim starship tmux"
fi

if [[ -z $DOTFILES ]]; then
  DOTFILES=$HOME/Code/hiradp/home/
fi

pushd $DOTFILES
for folder in $STOW_FOLDERS; do
  echo "Installing $folder..."
  stow -D $folder
  stow $folder -t $HOME
done
popd

echo "Done!"
