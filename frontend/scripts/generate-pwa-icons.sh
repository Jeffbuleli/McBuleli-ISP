#!/usr/bin/env bash
# Regénère les PNG PWA (macOS : qlmanage + sips). À relancer après modification du logo SVG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/public"
SVG="$PUB/mcbuleli-logo.svg"
ICONS="$PUB/icons"
TMP="$ICONS/_ql-src.png"

if [[ ! -f "$SVG" ]]; then
  echo "Missing $SVG" >&2
  exit 1
fi
mkdir -p "$ICONS"

cd "$ICONS"
rm -f "$TMP" _inner.png

qlmanage -t -s 512 -o . "$SVG"
# qlmanage produit « mcbuleli-logo.svg.png »
mv -f "mcbuleli-logo.svg.png" "$TMP"

sips -z 192 192 "$TMP" --out icon-192.png >/dev/null
sips -z 512 512 "$TMP" --out icon-512.png >/dev/null
sips -Z 410 icon-512.png --out _inner.png >/dev/null
sips -p 512 512 --padColor 0a0a0a _inner.png --out icon-maskable-512.png >/dev/null

rm -f "$TMP" _inner.png
echo "OK — icon-192.png, icon-512.png, icon-maskable-512.png"
