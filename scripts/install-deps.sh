#!/usr/bin/env bash
# Install npm dependencies for the server and client packages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_in() {
  local dir="$1"
  echo "==> npm install ($dir)"
  (cd "$ROOT/$dir" && npm install)
}

install_in server
install_in client

echo "==> done"
