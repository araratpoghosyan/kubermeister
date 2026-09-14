#!/usr/bin/env bash
# Regenerate the app icon set from resources/icon.svg (the editable source).
# Requires: rsvg-convert, sips, iconutil (macOS), magick (ImageMagick).
set -euo pipefail
cd "$(dirname "$0")"

# 1024 master PNG
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png

# macOS .icns via an iconset of all required sizes
ICONSET="icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for spec in "16:16x16" "32:16x16@2x" "32:32x32" "64:32x32@2x" \
            "128:128x128" "256:128x128@2x" "256:256x256" "512:256x256@2x" \
            "512:512x512" "1024:512x512@2x"; do
    px="${spec%%:*}"
    name="${spec##*:}"
    rsvg-convert -w "$px" -h "$px" icon.svg -o "$ICONSET/icon_${name}.png"
done
iconutil -c icns "$ICONSET" -o icon.icns
rm -rf "$ICONSET"

# Windows .ico (cheap cross-platform future-proofing)
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

echo "Generated: icon.png icon.icns icon.ico"
