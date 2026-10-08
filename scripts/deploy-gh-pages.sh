#!/usr/bin/env bash
# Baut die Seite für GitHub Pages (Werte aus .env) und veröffentlicht dist/
# als Branch "gh-pages" im Remote "origin". Pages-Quelle: Branch gh-pages, Ordner "/".
#   bash scripts/deploy-gh-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -f dist/_headers              # nur für Netlify relevant
touch dist/.nojekyll             # GitHub Pages: Dateien unverändert ausliefern (kein Jekyll)
REMOTE_URL="$(git remote get-url origin)"
TMP="$(mktemp -d)"
cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" \
  commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Hinweis: --force ersetzt den bisherigen Stand des gh-pages-Branches (er enthält nur Build-Dateien).
git push -q ${FORCE:+--force} "$REMOTE_URL" gh-pages
echo "Veröffentlicht: Branch gh-pages"
