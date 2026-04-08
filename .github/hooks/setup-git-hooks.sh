#!/usr/bin/env sh

if [ ! -e .git ]; then
  exit 0
fi

git config core.hooksPath .github/hooks
echo "Git hooks set up successfully."