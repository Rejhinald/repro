#!/usr/bin/env bash
# Prepares the demo. Makes workspace/ a git repo with a LOCAL bare remote, so the
# "before" mode has something real to talk about committing and pushing to. The
# remote is a directory on your disk; nothing here can reach a real repository.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Reset the site to its starting state so the demo always begins the same way.
cat > workspace/style.css <<'CSS'
:root { --brand: #1f6feb; }
body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 60rem; padding: 2rem; }
header { display: flex; align-items: center; justify-content: space-between; }
.logo { width: 120px; height: auto; }
h1 { color: var(--brand); }
CSS

rm -rf workspace/.git remote.git live history
git init --quiet --bare remote.git
(
  cd workspace
  git init --quiet -b main
  git config user.email "demo@example.invalid"
  git config user.name "Demo"
  git remote add origin ../remote.git
  git add -A
  git commit --quiet -m "Initial site"
  git push --quiet -u origin main
)

mkdir -p history
cp -r workspace live
rm -rf live/.git live/CLAUDE.md

echo "Ready. Now run:  node server.mjs"
