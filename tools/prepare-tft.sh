#!/bin/sh
# Prepare an Arduino IDE sketch for the display board using the shared firmware.
set -eu
cd "$(dirname "$0")/.."
src=firmware/vfd_studio
sketch=build/tft_studio
mkdir -p "$sketch"
cp "$src"/*.h "$sketch/"
cp firmware/tft_studio/partitions.csv "$sketch/"
{
  printf '#define STUDIO_TFT 1\n'
  cat "$src/vfd_studio.ino"
} > "$sketch/tft_studio.ino"
printf 'Arduino sketch: %s/tft_studio.ino\n' "$sketch"
