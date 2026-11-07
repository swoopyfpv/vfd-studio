# VFD Studio

Firmware and web apps for a **GP1294AI 256×48 VFD** (EEI Technology module EPC-INBN0BV1294UD) driven by an **ESP32-S3 Super Mini** over Wi-Fi.

- **Firmware** (`firmware/vfd_studio`): renders projects on the display itself, serves the apps, weather, OTA updates.
- **VFD Studio** (`http://vfd.local`): manage projects, settings, system status, firmware and app updates.
- **VFD Studio Builder** (`http://vfd.local/builder`): animation editor with layers, timeline and keyframes.

Projects are plain JSON. The browser preview and the display use the same render core (JavaScript in `src/core.js`, C++ in `firmware/vfd_studio/render.h`) and produce identical pixels.

## Features

**Firmware**
- 60 frames per second on a fixed time grid; fast software SPI (about 6 ms per frame, only changed tiles are sent); controller init per datasheet
- Brightness limit (default 300 of 1023), night mode, ±1 px pixel shift against burn-in
- Display self-healing: settings re-sent every 30 s, soft re-init every 5 min (adjustable), manual re-init
- Boot logo animation, Wi-Fi setup portal (`VFD-SETUP-…`), mDNS name, web and Arduino OTA updates with rollback
- Project playlist, Open-Meteo weather (no API key), NTP time with time zone, shared font library
- Request checks: answers only to its own name or IP, and changes need the header `X-VFD: 1` (see below)

**VFD Studio**
- Projects: select, rotate, send, delete; live mirror; text messages with duration
- Settings: name, time zone, location, brightness limit, display refresh, night mode, rotation
- System: storage, firmware slot, RAM, CPU, chip temperature, Wi-Fi, uptime, re-init count
- Image / GIF / U8g2 code import, XBM export, Builder install, firmware update

**VFD Studio Builder**
- Layer list, display canvas with drag, resize and snapping, inspector (Layer, Motion, Project, JSON)
- Timeline: time slots with transitions (dissolve, wipe, slide, type, scramble), brightness dip, cross-dissolve
- Keyframes for offset, opacity, width, height and scale with eases; auto-key; presets; smooth-motion check that evens out move speeds
- Undo / redo, templates, shortcuts, Google or custom fonts baked to pixels, text to bitmap
- JSON import / export with validation, AI base prompt, send to display, live mirror

**Layer types**: text, marquee, segment clock, shape, rectangle, line, polygon, corner brackets, time in dots, progress bar, weather icon, weather graph, globe, 80s grid, bitmap, animation, glitch, scanline, noise.

## API

Endpoints are listed in [firmware/vfd_studio/README.md](firmware/vfd_studio/README.md). Every change (POST / DELETE) needs the
header `X-VFD: 1`, so other web pages in your browser cannot send commands to the display:

```sh
curl -X POST -H "X-VFD: 1" -H "Content-Type: application/json" -d '{"text":"HELLO","sec":10}' http://vfd.local/api/msg
```

## Firmware update over Wi-Fi

Arduino IDE → Sketch → Export Compiled Binary, then Studio → Device → Firmware update with
`build/esp32.esp32.esp32s3/vfd_studio.ino.bin` (not the `merged` file). Or pick the display's network port in Arduino IDE.

## Wiring

| Display module | ESP32-S3 Super Mini |
|---|---|
| +5V OUT / GND | 5V / GND (the module powers the ESP) |
| CLK | GPIO 4 |
| DATA | GPIO 5 |
| CS | GPIO 6 |
| RESET | GPIO 7 |
| FILAMENT_EN | GPIO 8 (direct, no resistor) |

Power the module through its USB-C or DC jack (5 V, at least 1 A).

## Build

Requirements: Node.js; Arduino IDE with ESP32 core 3.x, U8g2 and ArduinoJson 7.

```sh
./build.sh
```

This writes `dist/vfd-studio.html`, `dist/vfd-builder.html` and the generated headers `fonts.h`, `demos.h` and `studio.h` in `firmware/vfd_studio`. Then open `firmware/vfd_studio/vfd_studio.ino` in Arduino IDE (board: ESP32S3 Dev Module, USB CDC On Boot enabled; the sketch's `partitions.csv` is used automatically) and upload. After the first USB flash, updates run over Wi-Fi. Details in [firmware/vfd_studio/README.md](firmware/vfd_studio/README.md).

Install the Builder from the Studio: Device → Install Builder → `dist/vfd-builder.html`.

The boot logo header `logo.h` is generated from `assets/logo.png` with `python3 tools/logo.py assets/logo.png firmware/vfd_studio/logo.h`.

## Tests

```sh
# firmware compiles against host mocks (needs ArduinoJson on the include path)
g++ -std=gnu++17 -fsyntax-only -DARDUINOJSON_ENABLE_ARDUINO_STRING=1 -Itest/mock -I<ArduinoJson>/src -Ifirmware/vfd_studio -x c++ test/ino_check.cpp

# JS and C++ renderers produce the same pixels
g++ -std=gnu++17 -O2 -I<ArduinoJson>/src test/c_render.cpp -o test/c_render
# timestamps.txt: one epoch-ms value per line; my-project.json: any project
node test/js_render.js dist/vfd-studio.html timestamps.txt my-project.json | grep '^my-project ' > js.txt
./test/c_render timestamps.txt my-project.json | grep '^my-project ' > c.txt && cmp js.txt c.txt

# browser end-to-end tests against a mock device (Playwright)
python3 test/e2e_builder.py
python3 test/e2e_http.py
```

## Notes

`assets/book.ino` is a third-party example sketch by upir (2023); its bitmaps become the "the-book" demo. Check its license before making this repository public.
