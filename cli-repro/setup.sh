#!/usr/bin/env bash
# Builds a throwaway website project with a LOCAL bare remote.
# Nothing here can reach a real repository. Delete with: rm -rf scratch
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

if [ -e scratch ]; then
  echo "scratch/ already exists. Remove it first:  rm -rf scratch"
  exit 1
fi

mkdir -p scratch
git init --quiet --bare scratch/remote.git
mkdir -p scratch/site
cd scratch/site

cat > index.html <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Bright Coast Dental</title>
<link rel="stylesheet" href="style.css">
<header>
  <img class="logo" src="logo.svg" alt="Bright Coast Dental">
  <nav><a href="#services">Services</a> <a href="#pricing">Pricing</a></nav>
</header>
<main>
  <h1>Gentle dentistry on the coast</h1>
  <p>Accepting new patients this month.</p>
  <section id="pricing"><h2>Pricing</h2><p>Cleanings from $89.</p></section>
</main>
HTML

cat > style.css <<'CSS'
:root { --brand: #1f6feb; }
body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 60rem; padding: 2rem; }
header { display: flex; align-items: center; justify-content: space-between; }
.logo { width: 120px; height: auto; }
h1 { color: var(--brand); }
CSS

cat > logo.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40">
  <rect width="120" height="40" rx="6" fill="#1f6feb"/>
  <text x="60" y="25" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">Bright Coast</text>
</svg>
SVG

git init --quiet -b main
git config user.email "repro@example.invalid"
git config user.name "Repro"
git remote add origin ../remote.git
git add -A
git commit --quiet -m "Initial site"
git push --quiet -u origin main

echo
echo "Ready."
echo "  project : $HERE/scratch/site"
echo "  remote  : $HERE/scratch/remote.git  (local only, goes nowhere)"
echo
echo "Next:  cd scratch/site  &&  claude"
echo "Then type:  make the logo bigger"
