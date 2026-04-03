#!/usr/bin/env sh

if git rev-parse --git-dir > /dev/null; then
  git config core.hooksPath .github/hooks
else
  echo "Error: This script must be run inside a Git repository."
fi
