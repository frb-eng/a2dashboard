#!/usr/bin/env bash
# Install npm dependencies for the root, server, and client packages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_in() {
  local dir="$1"
  echo "==> npm install ($dir)"
  (cd "$ROOT/$dir" && npm install)
}

echo "==> npm install (root)"
(cd "$ROOT" && npm install)

install_in server
install_in client

echo "==> done"
