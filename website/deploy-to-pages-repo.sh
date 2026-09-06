#!/usr/bin/env bash
# Copy this site's files to the root of your GitHub Pages repo (Option A).
# Usage: ./deploy-to-pages-repo.sh /path/to/theactivityhub-website
set -euo pipefail

DEST="${1:?Usage: $0 /path/to/theactivityhub-website}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR"

if [[ ! -d "$DEST/.git" ]]; then
  echo "Error: $DEST does not look like a git repo (no .git folder)."
  exit 1
fi

cp "$SRC/index.html" "$DEST/"
mkdir -p "$DEST/css" "$DEST/images"
cp "$SRC/css/landing.css" "$DEST/css/"
shopt -s nullglob
for f in "$SRC/images"/*; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.png|*.jpg|*.jpeg|*.webp|*.gif) cp "$f" "$DEST/images/" ;;
  esac
done

echo "Copied into $DEST — review with: cd \"$DEST\" && git status"
echo "Keep CNAME, README.md, og-image.jpg unless you intend to replace them."
