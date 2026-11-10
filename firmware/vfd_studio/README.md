# VFD Studio firmware 2.5.3

ESP32-S3 Super Mini + GP1294AI 256×48 VFD (EEI module).

## Wiring

| Display     | S3 Super Mini                |
|-------------|------------------------------|
| +5V OUT / GND (pins 8/7) | 5V / GND — the module powers the ESP |
| CLK         | GPIO 4                       |
| DATA        | GPIO 5                       |
| CS          | GPIO 6                       |
| RESET       | GPIO 7                       |
| FILAMENT_EN | GPIO 8 (direct, no resistor) |

Power the **module** (USB-C or DC jack, 5 V ≥ 1 A; it draws up to ~680 mA). Its pin 8 "+5V OUT" is an output
and feeds the ESP. Don't power the module from the ESP's 5V pin: the ESP's USB port and its diode can't
deliver the current reliably, and dips at power-up or on bright frames upset the controller.
Updates run over Wi-Fi (Studio → Firmware or Arduino OTA), so the ESP's USB isn't needed in normal use.
For a USB flash, unplug the module's own supply first, so two 5 V sources never meet on the 5V pin.

## Flashing 2.1 (once over USB when coming from 1.x, because the flash layout changes)

1. Library Manager: **U8g2** (2.37+) and **ArduinoJson** (7.x). Board package **esp32 by Espressif** 3.x.
2. Tools: Board **ESP32S3 Dev Module**, USB CDC On Boot **Enabled**, Flash Size **4MB**, PSRAM **QSPI PSRAM**.
   Partition Scheme: leave as it is — `partitions.csv` in this folder is used automatically
   (2 × 1.5 MB app for updates over Wi-Fi, 896 KB for projects, fonts and studio updates).
3. Upload, then press RESET.

Wi-Fi settings survive this update. The project storage is rebuilt, and the demo projects are written again.
Send your own projects again from the studio, or keep them via Export JSON beforehand.

## After that: no more compiling for design changes

| What changes                     | How                                                             |
|----------------------------------|-----------------------------------------------------------------|
| Designs, layouts, fonts, GIFs    | Studio → Send project (pure data)                               |
| The studio itself                | Studio → Device → Studio update (upload `vfd-studio.html`)      |
| Firmware                         | Studio → Device → Firmware update (`vfd_studio.ino.bin`)        |

## Layer types

Segment clock · Text (fonts, animation, rotating phrases) · Marquee · Shape (circle, ring, half, quarter,
triangle, rect, diamond; patterns incl. 80s sunset stripes; spin) · Polygon · 80s grid · Time in dots
(year, month, week, day, hour, life) · Globe (with your location) · Weather icon · Weather graph ·
Progress bar · Rectangle · Corners · Line · Bitmap · Animation (GIF frames) · FX: glitch, scanline, noise.
Every non-FX layer can move: slide, ping-pong, sine, circle.

## Timeline (sequences)

Set a loop length in the studio's Timeline panel. Each layer can get a time slot:
`at` (start ms), `length` (ms, 0 = until loop end), `in` / `out` transition
(dissolve, wipe, slide, type, scramble) with `tr` ms, and `dip` (brightness dip at start and end).
Layers without `at` are always visible. Sequences restart whenever a project appears on the display.

## Keyframes

Inside a timeline loop, each layer can animate `dx` / `dy` (offset in px), `o` (opacity 0–100, shown as a dither fade,
so two layers can cross-dissolve), `w`, `h` and `scale`:
`"keys": { "dx": [[0, -40, "out"], [800, 0]], "o": [[0, 0], [400, 100]] }` — each key is [time ms, value, easing]
with easing `linear`, `in`, `out`, `inout` or `hold`.

## System

Studio → Device shows storage, firmware slot, RAM, PSRAM, render load, chip temperature, Wi-Fi and uptime.
Tokens for any layer: `{CPU} {RAM} {FS} {TEMPC} {RSSI} {UPTIME} {IP}`; progress bars can use `cpu`, `ram`, `fs`.

## Display init (datasheet)

The controller is set up exactly as on page 15 of the EPC-INBN0BV1294UD datasheet: reset, 10 ms wait,
VFD mode, dimming, clear GRAM, 20 ms, window, display mode, oscillator init (0x78 0x08).
U8g2 alone waits only 1 ms after the reset and skips the oscillator init.
The fast SPI keeps ≥ 1200 ns between bytes (datasheet tDOFF ≥ 360 ns; 400 ns up to 2.5.2).

## Brightness limit

Studio → Device → Settings → Brightness limit (default 300 of 1023). Project brightness 0–255 is scaled to
0…limit. The datasheet recommends staying below 300 to delay aging; raise it if you need more.

## Display self-healing

- Normally only the changed tiles of a frame are sent. Once a second the whole frame goes out (about 10 ms), so a
  tile the controller missed is corrected within a second instead of staying until that spot changes.
- Every 10 seconds, at every project switch of the rotation and whenever Wi-Fi drops or returns, the firmware
  re-sends the controller's mode and window settings (no reset, no flicker).
- Every 5 minutes (Settings → Display refresh, 0 = off) it re-initialises the controller with a software reset
  and writes the current image straight back: a very short blink, and a frozen image comes back.
- Studio → Device → Re-init display does a full reset at any time. System shows how many re-inits ran.

## Frame rate and smooth motion

The display renders 60 frames per second on a fixed wall-clock grid, and keyframes are sampled on the same grid
(the studio preview does the same). A linear move is smooth at even speeds: 15, 20, 30, 60, 120, 180 px/s.
The Builder's Motion tab shows the speed of the move at the playhead and can even it out.

## Startup

Logo animation with the firmware version (the logo is built from `tools/logo.py` into `logo.h`), Wi-Fi connects
in the background meanwhile, then "CONNECTING TO WI-FI" if needed and the address (vfd.local) for 6 seconds.

## Wi-Fi

- **Boot:** up to 22 s to connect. If an attempt fails, the firmware starts it over every 8 s (the ESP32 core
  retries some failures by itself, but stops for good after others, e.g. `AUTH_FAIL` from a router that is still
  starting or still holds the display's old session).
- **No connection:** setup network `VFD-SETUP-XXXX` (setup page at 192.168.4.1). With a saved network, the display
  alternates "THEN OPEN …" with the reason of the last failed attempt (e.g. `NO CONNECTION: 202 AUTH FAIL`), the setup
  page shows it too, and the display restarts every 3 minutes to try again while nobody is connected to the setup network.
- **No connection after a restart** (crash, update, brown-out; the clock still knows the time): no setup network. The
  display carries on offline with the time and the last weather (kept in RTC memory, used if at most 3 hours old) and
  keeps trying in the background. After a power cut the time is gone, so the setup network opens as described above.
- **Connection lost while running:** the core retries by itself for 30 s (enough for a short dropout). After that
  its retry is switched off and the firmware makes one attempt every 30 s until the network is back; in between the
  radio is quiet. (Before, the core searched without a pause for as long as the network was gone, and transfers to
  the display could go wrong for just as long.) The clock keeps running and the last weather stays on the display;
  NTP and weather resync afterwards. After every attempt the display settings and a full frame are sent again.
- **Offline mark:** a small Wi-Fi symbol with an x in the bottom right corner (13 × 7 px) appears after 10 s without
  Wi-Fi, or when Wi-Fi is up but two weather fetches in a row got no answer. `/api/info` returns it as `offline`.
- **Weather retries:** after a failed fetch the next one follows after 1, 2, 4, 8, then every 15 minutes
  (before: every 5 s), and soon after the connection is back.
- **Diagnosis:** the serial log prints every drop with its reason (`[vfd] wifi: dropped, reason 202 AUTH_FAIL`),
  `/api/system` returns `wifiReason` (last drop) and `wifiRetries` (own reconnect attempts since boot).
- **Hold BOOT for 5 s:** forget the network and restart in setup mode.

## Builder

`http://vfd.local/builder` serves the VFD Studio Builder once it is installed:
Studio → Device → Install Builder → pick `vfd-builder.html`. It lives in the display's storage, not in the firmware,
so it can be updated without flashing. Builder and Studio share the font library (same address, same browser).

## Demos

Since 2.3.0 only the clock ships inside the firmware (first boot and fallback), which frees about 58 KB in the
firmware slot. Projects already on the display stay. The other demos are templates in the Builder
(New project) and in the Studio (Restore demo projects → Send).

## Fonts

Fonts live in a shared library (studio → Fonts…). Sending a project uploads the fonts it needs to `/fonts/` on the display.
Export JSON can embed the used fonts so the file is self-contained.

## Pixel shift

Per project: ±1 px (orbit around the centre, default), +1 px (right/down), −1 px (left/up) or off, every 5 minutes.
The studio's "Safe area" option marks the rows and columns a shift can push off the display.

## Text tokens

Time: `{HH} {MM} {SS} {DD} {MO} {MON} {YYYY} {YY} {WD} {KW} {DOY} {DLEFT} {YPCT} {TZ} {HEX} {HEX8}`
Weather: `{TEMP} {TEMP1} {FEELS} {TMAX} {TMIN} {HUM} {RAIN} {RAINNOW} {POP} {WIND} {WX} {SUNRISE} {SUNSET} {CITY}`

## Weather

Open-Meteo (free, no API key). Set the location in Studio → Device → Settings. Refreshes every 15 minutes.

## API (for n8n, Home Assistant, curl …)

Every change (POST / DELETE) needs the header `X-VFD: 1`, and the display only answers requests addressed to its own
name (`vfd`, `vfd.local`, `vfd.fritz.box`, `vfd.lan` …) or IP address. This keeps other web pages in your browser from
sending commands to it. Studio and Builder do this automatically. Example:
`curl -X POST -H "X-VFD: 1" -H "Content-Type: application/json" -d '{"text":"HELLO","sec":10}' http://vfd.local/api/msg`

```
POST /api/msg        {"text":"RENDER DONE","sec":15}     show a message
POST /api/active     {"id":"weather-now"}                switch project
POST /api/brightness {"value":120}                       brightness 0–255
GET  /api/info · /api/weather · /api/settings · /api/fonts · /api/system
POST /api/display/reinit                                 reset the display controller
```

## Display transfer

`#define VFD_SPI` at the top of `vfd_studio.ino`:
`0` fast software SPI (default, ~1.5 MHz, about 10 ms per full frame), `1` hardware SPI (4 MHz),
`2` U8g2's own software SPI (slow, ~70 ms per frame). Only the changed parts of the image are sent.

## Files

- `vfd_studio.ino` – Wi-Fi, web server, API, weather, rotation, OTA, night mode
- `render.h` – drawing engine (1:1 port of the studio's renderer, pixel-identical)
- `project.h` – project / font / weather JSON loader
- `fonts.h`, `demos.h`, `studio.h` – generated from the studio, do not edit by hand
- `partitions.csv` – flash layout
