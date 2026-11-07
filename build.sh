#!/bin/sh
# Builds the two web apps and the generated firmware headers. Run from the repository root.
set -e
mkdir -p dist
node tools/build.js assets/book.ino dist/vfd-studio.html
node tools/build.js assets/book.ino dist/vfd-builder.html src/builder.html src/builder.js
node tools/gen.js dist/vfd-studio.html firmware/vfd_studio
