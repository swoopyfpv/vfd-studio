# VFD Studio

## Info
Project and Structure is a bit too much, could be sorted way better, but fine for me now.
You could just build your own projects (or let an ai make them) and build as you like.
If you push, or do a better project link me, so i can take a look :)

this was a weekend project to make use of the vfd i had laying around. coded is by claude, use with caution.


## Video
https://youtu.be/l3FNjZksX_U

## Device
i used a:
GP1294AI 256×48 VFD
EPC-INBN0BV1294UD from EEI TECHNOLOGY ELECTRONIC STUDIO
(the one with all electronics, light sensor, usb c input, not just the module)

## Description

Firmware and web apps for a **GP1294AI 256×48 VFD** (EEI Technology module EPC-INBN0BV1294UD) driven by an **ESP32-S3 Super Mini** over Wi-Fi.

- **Firmware** (`firmware/vfd_studio`): renders projects on the display itself, serves the apps, weather, OTA updates.
- **VFD Studio** (`http://vfd.local`): manage projects, settings, system status, firmware and app updates.
- **VFD Studio Builder** (`http://vfd.local/builder`): animation editor with layers, timeline and keyframes.

Projects are plain JSON. The browser preview and the display use the same render core (JavaScript in `src/core.js`, C++ in `firmware/vfd_studio/render.h`) and produce identical pixels.

## Features

**Firmware**
- 60 frames per second on a fixed time grid; fast software SPI (about 10 ms per full frame, only changed tiles are sent); controller init per datasheet
- Brightness limit (default 300 of 1023), night mode, ±1 px pixel shift against burn-in
- Display self-healing: full frame every second, settings re-sent every 10 s and at every project switch, soft re-init every 5 min (adjustable), manual re-init
- Boot logo animation, Wi-Fi setup portal (`VFD-SETUP-…`), mDNS name, web and Arduino OTA updates with rollback
- Project playlist, Open-Meteo weather (no API key), NTP time with time zone, shared font library
- Offline: time and last weather stay on the display, with a small no-Wi-Fi mark; reconnects by itself
- Event log on the device (`/api/log`): starts, Wi-Fi, weather, project switches, a status line every 5 minutes, and a watcher that records where the main loop hangs
- Request checks: answers only to its own name or IP, and changes need the header `X-VFD: 1` (see below)

**VFD Studio**
- Projects: select, rotate, send, delete; live mirror; text messages with duration
- Settings: name, time zone, location, brightness limit, auto brightness (off by default), display refresh, night mode, rotation
- System: storage, firmware slot, RAM, CPU, ambient light, chip temperature, Wi-Fi, uptime, re-init count
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
| LII_SW (pin 11, optional) | GPIO 1 with a 47 kΩ resistor from GPIO 1 to 3.3 V |

Power the module through its USB-C or DC jack (5 V, at least 1 A).

## Build

Requirements: Node.js; Arduino IDE with ESP32 core 3.x, U8g2 and ArduinoJson 7.

```sh
./build.sh
```

This writes `dist/vfd-studio.html`, `dist/vfd-builder.html` and the generated headers `fonts.h`, `demos.h` and `studio.h` in `firmware/vfd_studio`. Then open `firmware/vfd_studio/vfd_studio.ino` in Arduino IDE, select **ESP32S3 Dev Module**, enable USB CDC On Boot, and set Partition Scheme to **Custom**. The build uses the sketch's `partitions.csv`. After the first USB flash, updates run over Wi-Fi. Details in [firmware/vfd_studio/README.md](firmware/vfd_studio/README.md).

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

## Credits

The project started from an example sketch by upir (MIT License): `assets/book.ino` uses his code and technique, with
book bitmaps of my own (the "the-book" demo). License text in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
