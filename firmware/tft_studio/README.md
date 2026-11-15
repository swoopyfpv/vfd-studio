# TFT Studio for ESP32-8048S043C-I

This build targets the Sunton ESP32-8048S043C-I with the 800×480 RGB LCD, GT911 capacitive touch, 16 MB flash and 8 MB OPI PSRAM. It shares VFD Studio's project renderer, Wi-Fi setup, NTP, Open-Meteo weather, playlists, web Studio and Builder.

## Use the display

| Tab | Controls and content |
| --- | --- |
| Clock | Local time, seconds, current conditions and the next 12 hours of temperature data |
| Scenes | Active Studio project, playlist playback, live mirror and incoming messages |
| Settings | Ion, Sodium or Violet theme, backlight and 0°/180° orientation |

Settings → **Orientation** flips the image and touch input together. The angle, theme and backlight are saved immediately. The last Clock or Scenes view also comes back after a restart. Clock, Scenes and the setup portal share the same orientation. Tap a dark panel to wake it for 20 seconds during night mode.

Join the **TFT-SETUP-…** network on first boot and open **http://192.168.4.1**. After setup, open **http://tft.local** or the IP shown at startup. Under **Device → Settings** set the weather location, time zone, theme, panel orientation or backlight. **Device → Install Builder** takes `dist/vfd-builder.html` and enables **http://tft.local/builder**. Existing JSON projects keep their 256×48 composition and render at 3× size in Scenes. Sending a project to the device also opens Scenes.

## Build and flash

Run from the repository root with Node.js and the Espressif Arduino ESP32 3.3.12 core installed. Install **ArduinoJson 7** in the Library Manager.

```sh
./build.sh
./tools/prepare-tft.sh
```

Open `build/tft_studio/tft_studio.ino` in Arduino IDE. Select **ESP32S3 Dev Module**, **16MB flash**, **QIO 80 MHz**, **OPI PSRAM**, **Custom** partition scheme, **USB CDC On Boot Disabled** and **UART0 / Hardware CDC** upload mode. Connect through the board's USB-to-serial port. USB Serial/JTAG shares GPIO19/20 with the GT911 on this board. The sketch's partition table has two 3 MiB app slots and 9.875 MiB LittleFS.

Arduino CLI equivalent from the repository root:

```sh
arduino-cli compile \
  --fqbn esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=custom,UploadSpeed=460800 \
  --build-property upload.maximum_size=3145728 \
  --export-binaries build/tft_studio
```

The first install uses USB and writes the bootloader, partition table and app. For subsequent updates use **Device → Firmware update** with `tft_studio.ino.bin`.

## Check on the device

1. Boot and open **Settings** on the screen. Switch to Sodium and test both backlight buttons.
2. Tap **Turn to 180°**. Rotate the unit and tap **Clock**, then **Settings** and **Turn to 0°**. This checks both axes of the touch map.
3. Restart with 180° selected. Confirm that the boot screen, touch mapping and theme use the saved settings.
4. Join Wi-Fi. Set a weather location and send a Builder project. Confirm that Scenes opens and the project appears at 3× size.

The GT911 driver polls I²C on GPIO19/20 and probes 0x5D and 0x14. It accepts the stock board without an interrupt connection. If the controller is unavailable, the LCD shows that state and browser settings remain available once Wi-Fi is set up. The serial log and **GET /api/system** report detection.

The RGB pin and timing profile follows the [Sunton board definition](https://github.com/rzeldent/platformio-espressif32-sunton/blob/main/esp32-8048S043C.json). LCD scanout uses two RGB565 framebuffers in PSRAM.
