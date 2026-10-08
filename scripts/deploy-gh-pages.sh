#!/usr/bin/env bash
# Baut die Seite für GitHub Pages (Werte aus .env) und veröffentlicht dist/
# als Branch "gh-pages" im Remote "origin". Pages-Quelle: Branch gh-pages, Ordner "/".
#   bash scripts/deploy-gh-pages.sh
# Existiert gh-pages schon, wird er geklont und der neue Build als weiterer Commit
# obendrauf gelegt (normaler Fast-Forward-Push, kein --force nötig).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
npm run build
rm -f dist/_headers              # nur für Netlify relevant
touch dist/.nojekyll             # GitHub Pages: Dateien unverändert ausliefern (kein Jekyll)
REMOTE_URL="$(git remote get-url origin)"
TMP="$(mktemp -d)"
if git ls-remote --exit-code --heads "$REMOTE_URL" gh-pages >/dev/null 2>&1; then
  git clone -q --depth 1 --branch gh-pages "$REMOTE_URL" "$TMP"
  find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
  git init -q -b gh-pages "$TMP"
fi
cp -R dist/. "$TMP"
cd "$TMP"
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
# FORCE=1 nur als Notfall (ersetzt die gh-pages-Historie; der Branch enthält nur Build-Dateien).
git push -q ${FORCE:+--force} origin gh-pages
echo "Veröffentlicht: Branch gh-pages ($(git rev-parse --short HEAD))"
