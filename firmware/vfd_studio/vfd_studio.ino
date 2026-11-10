// ============================================================
//  VFD Studio firmware
//  ESP32-S3 Super Mini  +  GP1294AI 256x48 VFD (EEI module)
//
//  Arduino IDE settings (Tools menu):
//    Board ............ ESP32S3 Dev Module
//    USB CDC On Boot .. Enabled
//    Flash Size ....... 4MB (32Mb)
//    Partition Scheme . (ignored: partitions.csv in this folder is used — 2× 1.5 MB app + 896 KB storage)
//    PSRAM ............ QSPI PSRAM
//  Libraries (Library Manager): U8g2 (2.37+), ArduinoJson (7.x)
//
//  Wiring: CLK 4 · DATA 5 · CS 6 · RESET 7 · FILAMENT_EN 8 (direct, no resistor)
// ============================================================
#include <Arduino.h>
#include <SPI.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <sys/time.h>
#include <time.h>
#include <algorithm>
#include "esp_system.h"
#include "esp_timer.h"

#include "project.h"
#include "demos.h"
#include "logo.h"
#include "studio.h"
#include "setup_page.h"

#define FW_VERSION "2.5.3"
#define DEMO_VERSION 4

// Last weather, kept in RTC memory across restarts (see "weather kept across restarts"). Defined up here because
// the Arduino IDE puts its generated function prototypes ahead of the first function, and they need the type.
struct WxKeep {
  uint32_t magic, sum;
  int64_t at;                      // epoch s of the fetch
  double v[11], hT[24], hP[24], hR[24];
  int32_t code, nh;
  uint8_t day;
  char sunrise[6], sunset[6];
};

// Display transfer:
// 0 = fast software SPI (default): direct register writes, ~1.5 MHz, about 10 ms per full frame
// 1 = hardware SPI, 4 MHz
// 2 = U8g2's own software SPI (slow, ~70 ms per frame; the method from the 2023 setup)
#define VFD_SPI 0

static const int PIN_CLK = 4, PIN_DATA = 5, PIN_CS = 6, PIN_RST = 7, PIN_FIL = 8, PIN_BOOT = 0;

#if VFD_SPI == 1
U8G2_GP1294AI_256X48_F_4W_HW_SPI u8g2(U8G2_R0, /*cs=*/PIN_CS, /*dc=*/U8X8_PIN_NONE, /*reset=*/PIN_RST);
#else
U8G2_GP1294AI_256X48_F_4W_SW_SPI u8g2(U8G2_R0, /*clock=*/PIN_CLK, /*data=*/PIN_DATA, /*cs=*/PIN_CS, /*dc=*/U8X8_PIN_NONE, /*reset=*/PIN_RST);
#endif

#if VFD_SPI == 0
// Fast software SPI for the GP1294AI (SPI mode 3: clock idles high, data taken on the rising edge, MSB first).
// Each clock phase lasts at least 300 ns (datasheet: tCW >= 120 ns), measured with the CPU cycle counter.
// After every byte the line rests for 1200 ns (datasheet: data processing time tDOFF >= 360 ns).
// Up to 2.5.2 these were 160 and 400 ns: only 11 % above the limit for tDOFF. A full frame now takes about 10 ms.
#include "soc/gpio_reg.h"
static uint32_t spiHalfCycles = 73, spiByteGap = 289;
static inline void spiWait(uint32_t c0) { while ((uint32_t)(ESP.getCycleCount() - c0) < spiHalfCycles) {} }
uint8_t fastSpiByte(u8x8_t* u8x8, uint8_t msg, uint8_t arg_int, void* arg_ptr) {
  const uint32_t mClk = 1UL << PIN_CLK, mDat = 1UL << PIN_DATA, mCs = 1UL << PIN_CS;
  switch (msg) {
    case U8X8_MSG_BYTE_SEND: {
      const uint8_t* d = (const uint8_t*)arg_ptr;
      while (arg_int--) {
        uint8_t b = *d++;
        for (int i = 0; i < 8; i++) {
          REG_WRITE((b & 0x80) ? GPIO_OUT_W1TS_REG : GPIO_OUT_W1TC_REG, mDat);
          b <<= 1;
          uint32_t c = ESP.getCycleCount();
          REG_WRITE(GPIO_OUT_W1TC_REG, mClk); spiWait(c);   // clock low: data set up
          c = ESP.getCycleCount();
          REG_WRITE(GPIO_OUT_W1TS_REG, mClk); spiWait(c);   // rising edge: display takes the bit
        }
        uint32_t c = ESP.getCycleCount();                    // tDOFF: let the controller store the byte
        while ((uint32_t)(ESP.getCycleCount() - c) < spiByteGap) {}
      }
      break;
    }
    case U8X8_MSG_BYTE_INIT:
      spiHalfCycles = ESP.getCpuFreqMHz() * 300 / 1000 + 1;
      spiByteGap = ESP.getCpuFreqMHz() * 1200 / 1000 + 1;
      REG_WRITE(GPIO_OUT_W1TS_REG, mCs | mClk);              // chip deselected, clock idle high
      break;
    case U8X8_MSG_BYTE_SET_DC: break;                          // no DC line on this display
    case U8X8_MSG_BYTE_START_TRANSFER: REG_WRITE(GPIO_OUT_W1TC_REG, mCs); delayMicroseconds(1); break;
    case U8X8_MSG_BYTE_END_TRANSFER: delayMicroseconds(1); REG_WRITE(GPIO_OUT_W1TS_REG, mCs); break;
    default: return 0;
  }
  return 1;
}
#endif
WebServer server(80);
DNSServer dns;
Preferences prefs;

struct Settings {
  String ssid, pass, name = "vfd", tz = "CET-1CEST,M3.5.0,M10.5.0/3";
  bool nightOn = false, nightOff = false;
  int nightFrom = 23 * 60, nightTo = 7 * 60, nightLevel = 40;
  String city, playlist;      // playlist: comma-separated project ids
  bool hasLoc = false;
  double lat = 0, lon = 0;
  int playSec = 30;
  int maxBright = 300;        // dimming value at full brightness (0-1023). Datasheet: below 300 delays aging.
  int reinitMin = 5;          // re-initialise the display controller every N minutes (0 = off)
} cfg;

// weather: written by a background task, read by the renderer
static SemaphoreHandle_t wxMutex;
static volatile bool wxRequest = true;
static uint32_t wxLastTry = 0, wxLastOk = 0, lastSwitch = 0;
static String wxError = "no location set";
static volatile uint8_t wxFails = 0;   // failed fetches in a row that never reached the weather service
static bool wxNetFail = false;         // the last fetch failed on the way (no route, timeout, cut-off answer)

static vfd::FB fb;
static vfd::Project proj;
static String activeId = "neon-clock";
static bool reloadPending = false, apMode = false, filOn = false, liveOn = false, msgOn = false;  // explicit flags: timers alone wrap after ~24.8 days
static int brightOverride = -1, lastContrast = -1, lastBright = 200;
static uint8_t liveBuf[1536];
static uint8_t lastSent[256 * 6];
static bool forceSend = true, reinitDone = false;
static uint32_t liveUntil = 0, msgUntil = 0, msgStart = 0, statusUntil = 0, rebootAt = 0, apSince = 0, bootDown = 0, lastFrame = 0;
static String msgText, statusL1, statusL2, statusL3;
static String apName, apOptions, apFail, apFailHtml;
static volatile uint8_t wifiReason = 0;           // why the station was last dropped (0 = not yet)
static volatile bool wifiHeal = false;            // a connection attempt just ended: bring the display back in step
static bool wifiDown = false, apAlt = false;
static uint32_t wifiKickAt = 0, wifiDownAt = 0, wifiKicks = 0, apScreenAt = 0;
static uint32_t lastDisplayHeal = 0, lastSysUpdate = 0, lastSoftInit = 0, reinitCount = 0, lastFullFrame = 0;
static float renderMsAvg = 0;  // average render + transfer time per frame
static int64_t lastFrameNo = -1;

/* ---------------- settings ---------------- */
void loadSettings() {
  prefs.begin("vfd", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.pass = prefs.getString("pass", "");
  cfg.name = prefs.getString("name", "vfd");
  cfg.tz = prefs.getString("tz", cfg.tz);
  cfg.nightOn = prefs.getBool("nOn", false);
  cfg.nightOff = prefs.getBool("nOff", false);
  cfg.nightFrom = prefs.getInt("nFrom", 23 * 60);
  cfg.nightTo = prefs.getInt("nTo", 7 * 60);
  cfg.nightLevel = prefs.getInt("nLvl", 40);
  activeId = prefs.getString("active", "neon-clock");
  cfg.city = prefs.getString("city", "");
  cfg.hasLoc = prefs.getBool("hasLoc", false);
  cfg.lat = prefs.getDouble("lat", 0);
  cfg.lon = prefs.getDouble("lon", 0);
  cfg.playlist = prefs.getString("play", "");
  cfg.playSec = prefs.getInt("playSec", 30);
  cfg.maxBright = prefs.getInt("maxBr", 300);
  cfg.reinitMin = prefs.getInt("reMin", 5);
  prefs.end();
}
void saveSettings() {
  prefs.begin("vfd", false);
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.putString("name", cfg.name);
  prefs.putString("tz", cfg.tz);
  prefs.putBool("nOn", cfg.nightOn);
  prefs.putBool("nOff", cfg.nightOff);
  prefs.putInt("nFrom", cfg.nightFrom);
  prefs.putInt("nTo", cfg.nightTo);
  prefs.putInt("nLvl", cfg.nightLevel);
  prefs.putString("active", activeId);
  prefs.putString("city", cfg.city);
  prefs.putBool("hasLoc", cfg.hasLoc);
  prefs.putDouble("lat", cfg.lat);
  prefs.putDouble("lon", cfg.lon);
  prefs.putString("play", cfg.playlist);
  prefs.putInt("playSec", cfg.playSec);
  prefs.putInt("maxBr", cfg.maxBright);
  prefs.putInt("reMin", cfg.reinitMin);
  prefs.end();
}

/* ---------------- display output ---------------- */
void setFilament(bool on) {
  if (on == filOn) return;
  filOn = on;
  digitalWrite(PIN_FIL, on ? HIGH : LOW);
}
static inline uint8_t swap8(uint8_t b) { b = (b & 0xF0) >> 4 | (b & 0x0F) << 4; b = (b & 0xCC) >> 2 | (b & 0x33) << 2; return (b & 0xAA) >> 1 | (b & 0x55) << 1; }
static void vfdCmd(uint8_t cmd, const uint8_t* args = nullptr, int n = 0) {
  u8x8_t* u = u8g2.getU8x8();
  u8x8_cad_StartTransfer(u);
  u8x8_cad_SendCmd(u, swap8(cmd));
  for (int i = 0; i < n; i++) u8x8_cad_SendArg(u, swap8(args[i]));
  u8x8_cad_EndTransfer(u);
}
// Project brightness 0-255 is scaled to the dimming range 0..maxBright (controller: 0-1023).
void setContrast(int c) {
  c = constrain(c, 0, 255);
  lastBright = c;
  int raw = (c * constrain(cfg.maxBright, 1, 1023) + 127) / 255;
  if (raw == lastContrast) return;
  lastContrast = raw;
  const uint8_t a[2] = { (uint8_t)(raw & 0xFF), (uint8_t)(raw >> 8) };
  vfdCmd(0xA0, a, 2);
  forceSend = true;
}
// fb (1 byte per pixel) -> u8g2 buffer (vertical bytes, LSB on top) -> display
void pushFB() {
  uint8_t* buf = u8g2.getBufferPtr();
  memset(buf, 0, 256 * 6);
  for (int y = 0; y < 48; y++) {
    const uint8_t* row = fb.p + y * 256;
    uint8_t* dst = buf + (y >> 3) * 256;
    uint8_t bit = 1 << (y & 7);
    for (int x = 0; x < 256; x++) if (row[x]) dst[x] |= bit;
  }
  if (forceSend) { u8g2.sendBuffer(); memcpy(lastSent, buf, sizeof lastSent); forceSend = false; return; }
  // send only the changed part of each 8-pixel row band
  for (int ty = 0; ty < 6; ty++) {
    const uint8_t *a = buf + ty * 256, *b = lastSent + ty * 256;
    int t0 = -1, t1 = -1;
    for (int tx = 0; tx < 32; tx++) if (memcmp(a + tx * 8, b + tx * 8, 8)) { if (t0 < 0) t0 = tx; t1 = tx; }
    if (t0 >= 0) u8g2.updateDisplayArea(t0, ty, t1 - t0 + 1, 1);
  }
  memcpy(lastSent, buf, sizeof lastSent);
}
void xbmToFB(const uint8_t* x) {
  for (int y = 0; y < 48; y++)
    for (int c = 0; c < 256; c++) fb.p[y * 256 + c] = (x[y * 32 + (c >> 3)] >> (c & 7)) & 1;
}

// (Re)initialise the display controller, following the datasheet (p. 15): software reset, 10 ms, VFD mode,
// dimming, GRAM, 20 ms, window, display mode, oscillator init (0x78 0x08; U8g2 never sends it).
// hard: also pulse the RESET pin first (the module's HV supply comes up slower than the ESP after power-on).
// soft: no pin reset, and the current image is written straight back instead of a blank GRAM, so it is only a
//       very short blink. Runs every few minutes as a cure for a frozen controller.
void initDisplay(bool hard = true) {
  bool ok = true;
  if (hard) {
    pinMode(PIN_RST, OUTPUT);
    digitalWrite(PIN_RST, LOW);
    delay(20);
    digitalWrite(PIN_RST, HIGH);
    delay(100);
    ok = u8g2.begin();   // sets up the pins and the transfer
  }
  vfdCmd(0xAA); delay(10);
  static const uint8_t mode[7] = { 0x01, 0x1F, 0x00, 0xFF, 0x2F, 0x00, 0x20 };
  vfdCmd(0xCC, mode, 7);
  lastContrast = -1; setContrast(lastBright);
  forceSend = true; pushFB();          // the image currently in the frame buffer (status screen or last frame)
  if (hard) delay(20);
  static const uint8_t pos[2] = { 0x00, 0x00 }, dmode[1] = { 0x00 }, osc[1] = { 0x08 };
  vfdCmd(0xC0, pos, 2);
  vfdCmd(0x80, dmode, 1);
  vfdCmd(0x78, osc, 1);
  forceSend = true;
  reinitCount++;
  if (hard) Serial.printf("[vfd] display init (u8g2.begin = %d)\n", ok);
}

// Re-send the controller configuration without reset or clear. If a glitch on the bus or the supply changed
// the display mode or window, the image comes back within one interval. No flicker.
void displayHeal() {
  static const uint8_t mode[7] = { 0x01, 0x1F, 0x00, 0xFF, 0x2F, 0x00, 0x20 }, pos[2] = { 0x00, 0x00 }, dmode[1] = { 0x00 };
  vfdCmd(0xCC, mode, 7);   // VFD mode
  vfdCmd(0xC0, pos, 2);    // display window
  vfdCmd(0x80, dmode, 1);  // display mode: normal scan
  lastContrast = -1; forceSend = true;  // contrast and a full frame follow with the next render
}

/* ---------------- Wi-Fi failure reason ---------------- */
// The core reconnects by itself after most failures, but stops for good after some of them (e.g. AUTH_FAIL,
// which a router can send while it is still starting or still holds the display's old session). Nothing
// would try again after that, so the firmware starts over itself: at boot and while running (wifiWatch).
void onWifiEvent(arduino_event_t* ev) {
  if (ev->event_id != ARDUINO_EVENT_WIFI_STA_DISCONNECTED) return;
  uint8_t r = ev->event_info.wifi_sta_disconnected.reason;
  if (r == WIFI_REASON_ASSOC_LEAVE) return;  // our own disconnect()
  if (r != wifiReason) Serial.printf("[vfd] wifi: dropped, reason %u %s\n", r, WiFi.STA.disconnectReasonName((wifi_err_reason_t)r));
  wifiReason = r;
  wifiHeal = true;
}
String wifiReasonText() {  // "202 AUTH FAIL"
  if (!wifiReason) return "";
  String s = String(wifiReason) + " " + WiFi.STA.disconnectReasonName((wifi_err_reason_t)wifiReason);
  s.replace("_", " ");
  return s;
}

/* ---------------- system stats ---------------- */
void updateSys() {
  vfd::Sys S;
  S.cpu = std::min(100.0, renderMsAvg / (50.0 / 3) * 100);   // share of the 16.7 ms frame budget
  uint32_t hs = ESP.getHeapSize(); S.ram = hs ? (hs - ESP.getFreeHeap()) * 100.0 / hs : 0;
  size_t ft = LittleFS.totalBytes(); S.fs = ft ? LittleFS.usedBytes() * 100.0 / ft : 0;
  S.temp = temperatureRead();
  S.rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  S.up = esp_timer_get_time() / 1000000;
  S.ip = WiFi.localIP().toString().c_str();
  xSemaphoreTake(wxMutex, portMAX_DELAY); vfd::SYS = S; xSemaphoreGive(wxMutex);
}

/* ---------------- time ---------------- */
bool getTime(vfd::TimeT& T) {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  time_t s = tv.tv_sec;
  struct tm tm;
  localtime_r(&s, &tm);
  T.t = (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
  T.h = tm.tm_hour; T.m = tm.tm_min; T.s = tm.tm_sec; T.ms = tv.tv_usec / 1000;
  T.D = tm.tm_mday; T.M = tm.tm_mon; T.Y = tm.tm_year + 1900; T.wd = tm.tm_wday; T.doy = tm.tm_yday + 1;
  strftime(T.tz, sizeof T.tz, "%Z", &tm);
  return T.Y >= 2024;
}
bool inNight(const vfd::TimeT& T) {
  if (!cfg.nightOn || cfg.nightFrom == cfg.nightTo) return false;
  int m = T.h * 60 + T.m;
  return cfg.nightFrom < cfg.nightTo ? (m >= cfg.nightFrom && m < cfg.nightTo) : (m >= cfg.nightFrom || m < cfg.nightTo);
}

/* ---------------- status screens ---------------- */
void drawCentered(const String& s, int y, int font, int scale) {
  std::string t(s.c_str());
  int w = vfd::textW(t, font, scale);
  vfd::drawText(fb, (256 - w) / 2, y, t, font, scale);
}
void statusScreen(const String& l1, const String& l2 = "", const String& l3 = "", int progress = -1) {
  fb.clear();
  vfd::Layer c; c.type = vfd::L_CORNERS; c.x = 0; c.y = 0; c.w = 256; c.h = 48; c.len = 4;
  vfd::Project dummy; vfd::TimeT T{}; vfd::drawLayer(fb, c, T, dummy, 0, 0);
  drawCentered(l1, l2.length() ? 6 : 16, 1, l2.length() ? 1 : 2);
  if (l2.length()) drawCentered(l2, 20, 1, 1);
  if (l3.length()) drawCentered(l3, 33, 0, 1);
  if (progress >= 0) { fb.frame(48, 41, 160, 4); fb.box(50, 42, progress * 156 / 100, 2); }
  setFilament(true);
  setContrast(200);
  pushFB();
}

/* ---------------- boot logo animation ---------------- */
static inline bool xbmBit(const uint8_t* b, int w, int x, int y) { return (b[y * ((w + 7) >> 3) + (x >> 3)] >> (x & 7)) & 1; }
static inline float easeOut3(float f) { f = f < 0 ? 0 : f > 1 ? 1 : f; return 1 - (1 - f) * (1 - f) * (1 - f); }
void drawLogoFrame(uint32_t t) {
  fb.clear();
  const int X = 70, Y = 3;
  // 1. the four arms of the symbol fly in, clockwise, one after another
  static const int8_t dir[5][2] = { { 0, 0 }, { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } };  // arm 1 TL, 2 TR, 3 BL, 4 BR
  static const uint8_t order[5] = { 0, 0, 1, 3, 2 };
  for (int a = 1; a <= 4; a++) {
    float f = easeOut3(((int32_t)t - order[a] * 110) / 480.0f);
    if (f <= 0) continue;
    int dx = lroundf((1 - f) * dir[a][0] * 30), dy = lroundf((1 - f) * dir[a][1] * 16);
    for (int y = 0; y < LOGO_ICON_H; y++) for (int x = 0; x < LOGO_ICON_W; x++) if (LOGO_ICON[y * LOGO_ICON_W + x] == a) fb.px(X + x + dx, Y + y + dy);
  }
  // 2. VFD wipes in with a bright edge
  int32_t tw = (int32_t)t - 650;
  if (tw > 0) {
    int cols = min(LOGO_VFD_W, (int)(tw * LOGO_VFD_W / 450));
    for (int y = 0; y < LOGO_VFD_H; y++) for (int x = 0; x < cols; x++) if (xbmBit(LOGO_VFD, LOGO_VFD_W, x, y)) fb.px(X + 41 + x, Y + 2 + y);
    if (cols < LOGO_VFD_W) fb.vl(X + 41 + cols, Y + 1, LOGO_VFD_H + 2);
  }
  // 3. STUDIO: letter by letter, each one flashes as a block first
  for (int i = 0; i < 6; i++) {
    int32_t ti = (int32_t)t - (1150 + i * 90);
    if (ti < 0) continue;
    int x0 = LOGO_ST_X[i], lw = LOGO_ST_LW[i];
    if (ti < 45) { fb.box(X + 42 + x0, Y + 25, lw, LOGO_ST_H); continue; }
    for (int y = 0; y < LOGO_ST_H; y++) for (int x = x0; x < x0 + lw; x++) if (xbmBit(LOGO_STUDIO, LOGO_ST_W, x, y)) fb.px(X + 42 + x, Y + 25 + y);
  }
  // 4. version dissolves in underneath
  int32_t tv = (int32_t)t - 1800;
  if (tv > 0) {
    static vfd::FB tmp; tmp.clear();
    std::string v = "FIRMWARE " FW_VERSION;
    vfd::drawText(tmp, (256 - vfd::textW(v, 0, 1)) / 2, 41, v, 0, 1);
    int n = min(64, (int)(tv * 64 / 400));
    for (int y = 38; y < 48; y++) for (int x = 0; x < 256; x++) if (tmp.p[y * 256 + x] && vfd::BAYER8[(y & 7) * 8 + (x & 7)] < n) fb.p[y * 256 + x] = 1;
  }
  // 5. one scanline sweeps over it
  int32_t ts = (int32_t)t - 2250;
  if (ts > 0 && ts < 450) { int y = ts * 50 / 450 - 1; fb.color = 2; fb.hl(0, y, 256); fb.color = 1; }
}
void bootAnimation() {
  int bright = lastBright;
  uint32_t s = millis();
  for (;;) {
    uint32_t t = millis() - s;
    if (t > 3100) break;
    drawLogoFrame(t);
    setContrast(t < 350 ? bright * (int)t / 350 : bright);   // tube "warms up"
    pushFB();
    delay(15);
  }
  setContrast(bright);
}
// startup Wi-Fi screen: no names or addresses, just what is happening
void connectingScreen(uint32_t t) {
  fb.clear();
  vfd::Layer c; c.type = vfd::L_CORNERS; c.x = 0; c.y = 0; c.w = 256; c.h = 48; c.len = 4;
  vfd::Project dummy; vfd::TimeT T{}; vfd::drawLayer(fb, c, T, dummy, 0, 0);
  drawCentered("CONNECTING TO WI-FI", 13, 1, 1);
  const int n = 15, x0 = 128 - (n * 6 - 4) / 2, k = (t / 70) % (2 * n - 2), pos = k < n ? k : 2 * n - 2 - k;
  for (int i = 0; i < n; i++) { int d = abs(i - pos); if (d == 0) fb.box(x0 + i * 6 - 1, 29, 4, 4); else if (d == 1) fb.box(x0 + i * 6, 30, 2, 2); else fb.px(x0 + i * 6 + 1, 31); }
  setFilament(true);
  pushFB();
}
void onlineScreen() {
  fb.clear();
  vfd::Layer c; c.type = vfd::L_CORNERS; c.x = 0; c.y = 0; c.w = 256; c.h = 48; c.len = 4;
  vfd::Project dummy; vfd::TimeT T{}; vfd::drawLayer(fb, c, T, dummy, 0, 0);
  String a = cfg.name + ".local";
  int sc = vfd::textW(std::string(a.c_str()), 1, 2) <= 244 ? 2 : 1;
  drawCentered(a, sc == 2 ? 16 : 20, 1, sc);
  setFilament(true);
  pushFB();
}

/* ---------------- projects on flash ---------------- */
bool validId(const String& id) {
  if (id.length() < 1 || id.length() > 40) return false;
  for (char c : id) if (!isalnum((unsigned char)c) && c != '-' && c != '_') return false;
  return true;
}
String pathOf(const String& id) { return "/p/" + id + ".json"; }

void seedDemos() {
  if (!LittleFS.exists("/p")) LittleFS.mkdir("/p");
  if (!LittleFS.exists("/fonts")) LittleFS.mkdir("/fonts");
  prefs.begin("vfd", true); int seen = prefs.getInt("demoVer", 0); prefs.end();
  bool fresh = true;  // storage empty (first boot or new partition layout)?
  { File d = LittleFS.open("/p"); if (d) { File f = d.openNextFile(); if (f) { fresh = false; f.close(); } d.close(); } }
  if (seen >= DEMO_VERSION && !fresh) return;
  for (int i = 0; i < DEMO_COUNT; i++) {
    JsonDocument d, filter; filter["id"] = true;
    deserializeJson(d, DEMO_JSON[i], DeserializationOption::Filter(filter));
    String id = d["id"] | "";
    if (!validId(id) || LittleFS.exists(pathOf(id))) continue;
    File f = LittleFS.open(pathOf(id), "w");
    if (f) { f.print(DEMO_JSON[i]); f.close(); }
  }
  prefs.begin("vfd", false); prefs.putInt("demoVer", DEMO_VERSION); prefs.end();
}

// shared font library: /fonts/<id>.json
bool loadFontFile(const std::string& id, vfd::Font& F) {
  String path = String("/fonts/") + id.c_str() + ".json";
  if (!validId(String(id.c_str())) || !LittleFS.exists(path)) return false;
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  JsonDocument d;
  DeserializationError e = deserializeJson(d, f);
  f.close();
  return !e && vfd::parseFont(d.as<JsonVariantConst>(), F);
}

bool loadProject(const String& id) {
  File f = LittleFS.open(pathOf(id), "r");
  if (!f) return false;
  size_t n = f.size();
  char* buf = (char*)malloc(n + 1);
  if (!buf) { f.close(); return false; }
  f.read((uint8_t*)buf, n); buf[n] = 0; f.close();
  vfd::Project P;
  bool ok = vfd::parseProject(buf, n, P, nullptr, loadFontFile);
  free(buf);
  if (ok) {
    vfd::TimeT T; getTime(T);
    P.t0 = T.t;  // sequences start from the beginning when a project appears
    proj = std::move(P); brightOverride = -1;
  }
  return ok;
}
void loadActive() {
  if (loadProject(activeId)) return;
  vfd::parseProject(DEMO_JSON[0], strlen(DEMO_JSON[0]), proj, nullptr, loadFontFile);  // fallback: built-in clock
}

/* ---------------- weather kept across restarts ---------------- */
// The last weather sits in RTC memory, which survives a restart (crash, update, brown-out), not a power cut.
// After a restart without network the display shows it again instead of "--". No flash wear.
RTC_NOINIT_ATTR static WxKeep wxKeep;
static uint32_t wxKeepSum(const WxKeep& k) {
  uint32_t h = 2166136261u; const uint8_t* b = (const uint8_t*)&k.at;
  for (size_t i = 0; i < sizeof k - offsetof(WxKeep, at); i++) h = (h ^ b[i]) * 16777619u;
  return h;
}
void wxKeepSave(const vfd::Weather& W) {
  vfd::TimeT T; if (!getTime(T)) return;
  WxKeep k; memset(&k, 0, sizeof k);
  k.magic = 0x56465857; k.at = T.t / 1000;
  const double v[11] = { W.temp, W.feels, W.hum, W.rain, W.rainNow, W.pop, W.wind, W.tmax, W.tmin, W.lat, W.lon };
  memcpy(k.v, v, sizeof v); memcpy(k.hT, W.hT, sizeof k.hT); memcpy(k.hP, W.hP, sizeof k.hP); memcpy(k.hR, W.hR, sizeof k.hR);
  k.code = W.code; k.nh = W.nh; k.day = W.day;
  memcpy(k.sunrise, W.sunrise, 6); memcpy(k.sunset, W.sunset, 6);
  k.sum = wxKeepSum(k);
  memcpy(&wxKeep, &k, sizeof k);   // byte for byte, the checksum covers the padding too
}
// at boot: take the kept weather if it is intact, for the same place and at most 3 hours old
bool wxKeepRestore() {
  WxKeep k; memcpy(&k, &wxKeep, sizeof k);
  vfd::TimeT T;
  if (k.magic != 0x56465857 || k.sum != wxKeepSum(k) || !getTime(T) || !cfg.hasLoc) return false;
  int64_t age = T.t / 1000 - k.at;
  if (age < 0 || age > 3 * 3600 || k.v[9] != cfg.lat || k.v[10] != cfg.lon || k.nh < 0 || k.nh > 24) return false;
  vfd::Weather W;
  W.ok = true; W.hasLoc = true; W.city = cfg.city.c_str();
  W.temp = k.v[0]; W.feels = k.v[1]; W.hum = k.v[2]; W.rain = k.v[3]; W.rainNow = k.v[4]; W.pop = k.v[5]; W.wind = k.v[6];
  W.tmax = k.v[7]; W.tmin = k.v[8]; W.lat = k.v[9]; W.lon = k.v[10];
  memcpy(W.hT, k.hT, sizeof k.hT); memcpy(W.hP, k.hP, sizeof k.hP); memcpy(W.hR, k.hR, sizeof k.hR);
  W.code = k.code; W.nh = k.nh; W.day = k.day;
  memcpy(W.sunrise, k.sunrise, 6); W.sunrise[5] = 0; memcpy(W.sunset, k.sunset, 6); W.sunset[5] = 0;
  xSemaphoreTake(wxMutex, portMAX_DELAY); vfd::WX = W; xSemaphoreGive(wxMutex);
  Serial.printf("[vfd] weather: restored, %ld min old\n", (long)(age / 60));
  return true;
}

/* ---------------- weather (Open-Meteo, no key needed) ---------------- */
bool fetchWeather() {
  if (!cfg.hasLoc || WiFi.status() != WL_CONNECTED) { wxError = cfg.hasLoc ? "offline" : "no location set"; return false; }
  char url[600];
  snprintf(url, sizeof url,
    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day"
    "&hourly=temperature_2m,precipitation_probability,precipitation"
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset"
    "&forecast_days=2&timezone=auto", cfg.lat, cfg.lon);
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http; http.setConnectTimeout(8000); http.setTimeout(10000);
  if (!http.begin(client, url)) { wxError = "connect failed"; wxNetFail = true; return false; }
  int code = http.GET();
  if (code != 200) { wxError = String("HTTP ") + code; wxNetFail = code < 0; http.end(); return false; }  // below 0: never got an answer
  String body = http.getString(); http.end();
  JsonDocument doc;
  if (deserializeJson(doc, body)) { wxError = "bad response"; wxNetFail = true; return false; }
  JsonObject c = doc["current"], d = doc["daily"], h = doc["hourly"];
  if (c.isNull() || d.isNull() || h.isNull()) { wxError = "incomplete response"; wxNetFail = false; return false; }
  vfd::Weather W;
  W.ok = true;
  W.temp = vfd::num(c["temperature_2m"], 0); W.feels = vfd::num(c["apparent_temperature"], 0); W.hum = vfd::num(c["relative_humidity_2m"], 0);
  W.rainNow = vfd::num(c["precipitation"], 0); W.code = c["weather_code"] | -1; W.wind = vfd::num(c["wind_speed_10m"], 0); W.day = (c["is_day"] | 1) == 1;
  W.tmax = vfd::num(d["temperature_2m_max"][0], 0); W.tmin = vfd::num(d["temperature_2m_min"][0], 0);
  W.rain = vfd::num(d["precipitation_sum"][0], 0); W.pop = vfd::num(d["precipitation_probability_max"][0], 0);
  String sr = d["sunrise"][0] | "", ss = d["sunset"][0] | "";
  if (sr.length() >= 16) { strncpy(W.sunrise, sr.c_str() + 11, 5); W.sunrise[5] = 0; }
  if (ss.length() >= 16) { strncpy(W.sunset, ss.c_str() + 11, 5); W.sunset[5] = 0; }
  String now = c["time"] | ""; now = now.substring(0, 13);
  JsonArray ht = h["time"]; int i0 = 0;
  for (int i = 0; i < (int)ht.size(); i++) { String t = ht[i] | ""; if (t.substring(0, 13) == now) { i0 = i; break; } }
  JsonArray aT = h["temperature_2m"], aP = h["precipitation_probability"], aR = h["precipitation"];
  W.nh = 0;
  for (int k = 0; k < 24 && i0 + k < (int)aT.size(); k++) {
    W.hT[k] = vfd::num(aT[i0 + k], 0); W.hP[k] = vfd::num(aP[i0 + k], 0); W.hR[k] = vfd::num(aR[i0 + k], 0); W.nh = k + 1;
  }
  W.city = cfg.city.c_str(); W.hasLoc = true; W.lat = cfg.lat; W.lon = cfg.lon;
  xSemaphoreTake(wxMutex, portMAX_DELAY);
  vfd::WX = W;
  xSemaphoreGive(wxMutex);
  wxKeepSave(W);
  wxError = ""; wxNetFail = false;
  return true;
}
void weatherTask(void*) {
  for (;;) {
    uint32_t now = millis();
    bool due = wxRequest || (wxLastOk && now - wxLastOk > 15UL * 60 * 1000) || (!wxLastOk && now - wxLastTry > 60UL * 1000);
    // after a failure wait 1, 2, 4, 8, then 15 minutes: on a bad connection every attempt is a full TLS handshake
    // that times out, and one every 5 s keeps the radio and the CPU busy for nothing
    uint8_t f = wxFails;
    uint32_t wait = (f && !wxRequest) ? min(900000UL, 30000UL << min((int)f, 5)) : 5000;
    if (due && WiFi.status() == WL_CONNECTED && cfg.hasLoc && now - wxLastTry > wait) {
      wxRequest = false; wxLastTry = now;
      if (fetchWeather()) { wxLastOk = millis(); wxFails = 0; }
      else if (wxFails < 250) wxFails++;
      Serial.printf("[vfd] weather: %s\n", wxError.length() ? wxError.c_str() : "ok");
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
// location without weather data yet: still mark the globe
void syncWeatherLocation() {
  xSemaphoreTake(wxMutex, portMAX_DELAY);
  vfd::WX.hasLoc = cfg.hasLoc; vfd::WX.lat = cfg.lat; vfd::WX.lon = cfg.lon; vfd::WX.city = cfg.city.c_str();
  xSemaphoreGive(wxMutex);
}

/* ---------------- rotation ---------------- */
std::vector<String> playlistIds() {
  std::vector<String> v; int a = 0;
  while (a < (int)cfg.playlist.length()) { int b = cfg.playlist.indexOf(',', a); if (b < 0) b = cfg.playlist.length(); String id = cfg.playlist.substring(a, b); if (validId(id)) v.push_back(id); a = b + 1; }
  return v;
}
void rotateStep() {
  std::vector<String> pl = playlistIds();
  if (pl.size() < 2 || millis() - lastSwitch < (uint32_t)max(5, cfg.playSec) * 1000UL) return;
  lastSwitch = millis();
  int idx = -1; for (int i = 0; i < (int)pl.size(); i++) if (pl[i] == activeId) idx = i;
  for (int k = 1; k <= (int)pl.size(); k++) {
    const String& next = pl[(idx + k) % pl.size()];
    // A switch changes the whole image at once. Settings and a full frame go out with it, so a transfer the
    // controller missed cannot leave parts of the previous project standing.
    if (LittleFS.exists(pathOf(next)) && loadProject(next)) { activeId = next; displayHeal(); lastDisplayHeal = millis(); return; }
  }
}

/* ---------------- offline mark ---------------- */
// Offline: no Wi-Fi for 10 s (a short roam shows nothing), or Wi-Fi is up but two weather fetches in a row
// never got an answer (connected to the router, no way out). Time and the last weather stay on the display.
bool isOffline() {
  if (WiFi.status() != WL_CONNECTED) return wifiDown && millis() - wifiDownAt > 10000;
  return cfg.hasLoc && wxFails >= 2 && wxNetFail;
}
// Wi-Fi arcs with a small x, 13 x 7 px in the bottom right corner on a cleared patch
void drawOfflineMark() {
  static const uint16_t rows[7] = { 0b0111111100000, 0b1000000010000, 0b0011111000000, 0b0100000100000, 0b0001110001010, 0b0000000000100, 0b0000100001010 };
  const int x0 = 242, y0 = 40;
  fb.color = 0; fb.box(x0 - 2, y0 - 2, 16, 10); fb.color = 1;
  for (int y = 0; y < 7; y++) for (int x = 0; x < 13; x++) if (rows[y] >> (12 - x) & 1) fb.px(x0 + x, y0 + y);
}

/* ---------------- render loop ---------------- */
void drawMessage(const vfd::TimeT& T) {
  fb.clear();
  vfd::Layer c; c.type = vfd::L_CORNERS; c.x = 0; c.y = 0; c.w = 256; c.h = 48; c.len = 5;
  vfd::drawLayer(fb, c, T, proj, 0, 0);
  vfd::drawText(fb, 6, 3, "INCOMING //", 0, 1);
  std::string hx = vfd::fmt("{HEX}", T, false, 99);
  vfd::drawText(fb, 250 - vfd::textW(hx, 0, 1), 3, hx, 0, 1);
  std::string s(msgText.c_str());
  int w2 = vfd::textW(s, 1, 2), w1 = vfd::textW(s, 1, 1);
  if (w2 <= 244) vfd::drawText(fb, (256 - w2) / 2, 14, s, 1, 2);
  else if (w1 <= 244) vfd::drawText(fb, (256 - w1) / 2, 20, s, 1, 1);
  else {
    s += "   //   "; int tw = vfd::textW(s, 1, 2) + 2;
    int off = (int)((millis() - msgStart) * 45 / 1000) % tw;
    fb.clipOn = true; fb.c0 = 4; fb.c1 = 10; fb.c2 = 252; fb.c3 = 30;
    for (int x = 4 - off; x < 252; x += tw) vfd::drawText(fb, x, 14, s, 1, 2);
    fb.clipOn = false;
  }
  uint32_t total = msgUntil - msgStart, left = msgUntil - millis();
  fb.box(6, 43, (int)((uint64_t)244 * left / (total ? total : 1)), 2);
}

void renderStep() {
  if (apMode) return;  // setup screen stays until Wi-Fi is configured
  uint32_t now = millis();
  if (statusUntil && (int32_t)(statusUntil - now) > 0) return;  // a status screen is showing
  statusUntil = 0;

  vfd::TimeT T;
  bool synced = getTime(T);
  bool live = liveOn && (int32_t)(liveUntil - now) > 0, msg = msgOn && (int32_t)(msgUntil - now) > 0;
  if (!live) liveOn = false;
  if (!msg) msgOn = false;
  bool night = synced && inNight(T);

  if (night && cfg.nightOff && !live && !msg) { setFilament(false); return; }
  setFilament(true);
  int b = brightOverride >= 0 ? brightOverride : proj.brightness;
  if (night) b = min(b, cfg.nightLevel);

  if (live) { setContrast(b); xbmToFB(liveBuf); pushFB(); return; }
  double dip = 1;
  xSemaphoreTake(wxMutex, portMAX_DELAY);
  if (msg) drawMessage(T); else dip = vfd::renderProject(fb, proj, T, 0);
  xSemaphoreGive(wxMutex);
  setContrast(msg ? max(b, 120) : vfd::jround(b * dip));
  if (msg) { pushFB(); return; }
  if (!synced) {
    fb.color = 0; fb.box(200, 40, 56, 8); fb.color = 1;
    vfd::drawText(fb, 202, 42, WiFi.status() != WL_CONNECTED ? "NO WIFI" : "SYNC TIME", 0, 1);
  } else if (isOffline()) drawOfflineMark();
  pushFB();
}

/* ---------------- HTTP helpers ---------------- */
void sendJson(int code, JsonDocument& d) { String out; serializeJson(d, out); server.send(code, "application/json", out); }
void sendOk() { server.send(200, "application/json", "{\"ok\":true}"); }
void sendErr(int code, const char* msg) { JsonDocument d; d["ok"] = false; d["error"] = msg; sendJson(code, d); }
bool bodyJson(JsonDocument& d) {
  if (!server.hasArg("plain")) { sendErr(400, "no body"); return false; }
  if (deserializeJson(d, server.arg("plain"))) { sendErr(400, "invalid json"); return false; }
  return true;
}

void listProjects(JsonArray arr) {
  File dir = LittleFS.open("/p");
  if (!dir) return;
  JsonDocument filter; filter["name"] = true;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String fn = f.name();
    int slash = fn.lastIndexOf('/'); if (slash >= 0) fn = fn.substring(slash + 1);
    if (!fn.endsWith(".json")) { f.close(); continue; }
    JsonDocument d;
    deserializeJson(d, f, DeserializationOption::Filter(filter));
    f.close();
    JsonObject o = arr.add<JsonObject>();
    o["id"] = fn.substring(0, fn.length() - 5);
    o["name"] = d["name"] | "";
  }
}

/* ---------------- HTTP: request checks ----------------
   Protection against web pages in your own browser (not against people on your network):
   - Host check: the display only answers when it is addressed by its own name or IP address. A foreign web page
     cannot reach it through a domain of its own that points at the display (DNS rebinding).
   - Changes (POST / DELETE) need the header "X-VFD". Studio and Builder send it; a foreign page cannot add it
     without the browser asking the display first, and the display never allows that. */
static bool uploadDenied = false;
bool hostOk() {
  String h = server.hostHeader(); h.toLowerCase();
  int c = h.indexOf(':'); if (c >= 0) h = h.substring(0, c);
  if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
  String n = cfg.name; n.toLowerCase();
  if (h == WiFi.localIP().toString() || h == n) return true;
  static const char* const local[] = { ".local", ".lan", ".home", ".home.arpa", ".localdomain", ".internal", ".intranet", ".fritz.box" };
  for (const char* sfx : local) if (h == n + sfx) return true;
  return false;
}
bool writeOk() { return server.hasHeader("X-VFD"); }
bool guard(bool write) {
  if (!hostOk()) { sendErr(403, "use the display's own address (name.local or IP)"); return false; }
  if (write && !writeOk()) { sendErr(403, "missing header X-VFD (send X-VFD: 1)"); return false; }
  return true;
}

/* ---------------- HTTP: studio + API ---------------- */
void setupApi() {
  static const char* hdrs[] = { "X-VFD" };
  server.collectHeaders(hdrs, 1);
  server.on("/", HTTP_GET, []() { if (!guard(false)) return;
    server.sendHeader("Cache-Control", "no-cache");
    if (LittleFS.exists("/studio.html.gz")) {  // uploaded studio update
      File f = LittleFS.open("/studio.html.gz", "r");
      if (f) { server.streamFile(f, "text/html"); f.close(); return; }
    }
    server.sendHeader("Content-Encoding", "gzip");
    server.send_P(200, "text/html", (const char*)STUDIO_GZ, STUDIO_GZ_LEN);
  });

  // uploaded web apps (gzipped HTML): /studio.html.gz replaces the built-in studio, /builder.html.gz is the Builder
  auto fileUpload = [](const char* api, const char* target) {
    String tmp = String(target) + ".tmp";
    server.on(api, HTTP_DELETE, [target]() { if (!guard(true)) return; LittleFS.remove(target); sendOk(); });
    server.on(api, HTTP_POST,
      [target, tmp]() {
        if (!guard(true)) { LittleFS.remove(tmp); return; }
        if (LittleFS.exists(tmp)) { LittleFS.remove(target); LittleFS.rename(tmp.c_str(), target); sendOk(); }
        else sendErr(500, "upload failed (storage full?)");
      },
      [tmp]() {
        static File up;
        HTTPUpload& u = server.upload();
        if (u.status == UPLOAD_FILE_START) { uploadDenied = !(hostOk() && writeOk()); LittleFS.remove(tmp); if (!uploadDenied) up = LittleFS.open(tmp, "w"); }
        else if (uploadDenied) return;
        else if (u.status == UPLOAD_FILE_WRITE) { if (up && up.write(u.buf, u.currentSize) != u.currentSize) { up.close(); LittleFS.remove(tmp); } }
        else if (u.status == UPLOAD_FILE_END) { if (up) up.close(); }
        else if (u.status == UPLOAD_FILE_ABORTED) { if (up) up.close(); LittleFS.remove(tmp); }
      });
  };
  fileUpload("/api/studio", "/studio.html.gz");
  fileUpload("/api/builder", "/builder.html.gz");
  server.on("/builder", HTTP_GET, []() { if (!guard(false)) return;
    server.sendHeader("Cache-Control", "no-cache");
    File f = LittleFS.open("/builder.html.gz", "r");
    if (f) { server.streamFile(f, "text/html"); f.close(); return; }
    server.send(200, "text/html", "<!DOCTYPE html><meta name=viewport content='width=device-width'><body style='background:#06080b;color:#c9d4df;font:15px monospace;padding:24px'>"
                                  "<h2 style='color:#4dffd2'>VFD Studio Builder is not installed</h2><p>Open <a style='color:#4dffd2' href='/'>VFD Studio</a> &rarr; Device &rarr; Install Builder, then come back.</p>");
  });

  // system stats
  server.on("/api/system", HTTP_GET, []() { if (!guard(false)) return;
    JsonDocument d;
    d["fw"] = FW_VERSION; d["chip"] = ESP.getChipModel(); d["cpuMHz"] = ESP.getCpuFreqMHz(); d["reinits"] = reinitCount; d["reinitMin"] = cfg.reinitMin;
    d["load"] = vfd::SYS.cpu; d["renderMs"] = renderMsAvg; d["temp"] = vfd::SYS.temp;
    d["heapTotal"] = ESP.getHeapSize(); d["heapFree"] = ESP.getFreeHeap(); d["heapMin"] = ESP.getMinFreeHeap();
    d["psramTotal"] = ESP.getPsramSize(); d["psramFree"] = ESP.getFreePsram();
    d["fsTotal"] = LittleFS.totalBytes(); d["fsUsed"] = LittleFS.usedBytes();
    static uint32_t sketch = 0; if (!sketch) sketch = ESP.getSketchSize();
    d["appUsed"] = sketch; d["appTotal"] = ESP.getFreeSketchSpace();
    d["rssi"] = WiFi.RSSI(); d["ssid"] = WiFi.SSID(); d["ip"] = WiFi.localIP().toString();
    d["wifiReason"] = wifiReasonText(); d["wifiRetries"] = wifiKicks;  // last drop reason, own reconnect attempts
    d["uptime"] = (uint32_t)(esp_timer_get_time() / 1000000);
    d["builder"] = LittleFS.exists("/builder.html.gz");
    sendJson(200, d);
  });
  server.on("/api/display/reinit", HTTP_POST, []() { if (!guard(true)) return; initDisplay(); sendOk(); });

  server.on("/api/weather", HTTP_GET, []() { if (!guard(false)) return;
    JsonDocument d;
    xSemaphoreTake(wxMutex, portMAX_DELAY);
    const vfd::Weather& w = vfd::WX;
    d["ok"] = w.ok; d["temp"] = w.temp; d["feels"] = w.feels; d["hum"] = w.hum; d["rain"] = w.rain; d["rainNow"] = w.rainNow;
    d["pop"] = w.pop; d["wind"] = w.wind; d["code"] = w.code; d["day"] = w.day; d["tmax"] = w.tmax; d["tmin"] = w.tmin;
    d["sunrise"] = w.sunrise; d["sunset"] = w.sunset; d["city"] = w.city.c_str();
    if (w.hasLoc) { d["lat"] = w.lat; d["lon"] = w.lon; }
    JsonArray a = d["hT"].to<JsonArray>(), b = d["hP"].to<JsonArray>(), c = d["hR"].to<JsonArray>();
    for (int i = 0; i < w.nh; i++) { a.add(w.hT[i]); b.add(w.hP[i]); c.add(w.hR[i]); }
    xSemaphoreGive(wxMutex);
    d["error"] = wxError; d["age"] = wxLastOk ? (millis() - wxLastOk) / 1000 : -1;
    sendJson(200, d);
  });
  server.on("/api/weather/refresh", HTTP_POST, []() { if (!guard(true)) return; wxRequest = true; sendOk(); });

  // shared font library
  server.on("/api/fonts", HTTP_GET, []() { if (!guard(false)) return;
    JsonDocument d; JsonArray arr = d.to<JsonArray>();
    File dir = LittleFS.open("/fonts");
    if (dir) {
      JsonDocument filter; filter["name"] = true; filter["h"] = true; filter["v"] = true;
      for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
        String fn = f.name(); int sl = fn.lastIndexOf('/'); if (sl >= 0) fn = fn.substring(sl + 1);
        if (!fn.endsWith(".json")) { f.close(); continue; }
        size_t sz = f.size();
        JsonDocument m; deserializeJson(m, f, DeserializationOption::Filter(filter)); f.close();
        JsonObject o = arr.add<JsonObject>();
        o["id"] = fn.substring(0, fn.length() - 5); o["name"] = m["name"] | ""; o["h"] = m["h"] | 0; o["bytes"] = sz; o["v"] = m["v"] | "";
      }
    }
    sendJson(200, d);
  });
  server.on("/api/font", HTTP_GET, []() { if (!guard(false)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    File f = LittleFS.open("/fonts/" + id + ".json", "r");
    if (!f) return sendErr(404, "not found");
    server.streamFile(f, "application/json"); f.close();
  });
  server.on("/api/font", HTTP_POST, []() { if (!guard(true)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    if (!server.hasArg("plain")) return sendErr(400, "no body");
    const String& body = server.arg("plain");
    { JsonDocument d; vfd::Font F; if (deserializeJson(d, body) || !vfd::parseFont(d.as<JsonVariantConst>(), F)) return sendErr(400, "not a font"); }
    if (!LittleFS.exists("/fonts")) LittleFS.mkdir("/fonts");
    if (LittleFS.totalBytes() - LittleFS.usedBytes() < body.length() + 4096) return sendErr(507, "flash full");
    File f = LittleFS.open("/fonts/" + id + ".json", "w");
    if (!f) return sendErr(500, "write failed");
    size_t w = f.print(body); f.close();
    if (w != body.length()) return sendErr(507, "flash full");
    reloadPending = true;  // the active project may use it
    sendOk();
  });
  server.on("/api/font", HTTP_DELETE, []() { if (!guard(true)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    LittleFS.remove("/fonts/" + id + ".json");
    sendOk();
  });

  server.on("/api/info", HTTP_GET, []() { if (!guard(false)) return;
    JsonDocument d;
    vfd::TimeT T;
    d["name"] = cfg.name; d["fw"] = FW_VERSION; d["chip"] = ESP.getChipModel();
    d["ip"] = WiFi.localIP().toString(); d["rssi"] = WiFi.RSSI();
    d["heap"] = ESP.getFreeHeap(); d["psram"] = ESP.getFreePsram(); d["uptime"] = millis() / 1000;
    d["timeSynced"] = getTime(T); d["active"] = activeId; d["offline"] = isOffline();
    d["brightness"] = brightOverride >= 0 ? brightOverride : proj.brightness;
    d["fsUsed"] = LittleFS.usedBytes(); d["fsTotal"] = LittleFS.totalBytes();
    listProjects(d["projects"].to<JsonArray>());
    JsonArray pl = d["playlist"].to<JsonArray>(); for (const String& id : playlistIds()) pl.add(id);
    d["playSec"] = cfg.playSec; d["weather"] = vfd::WX.ok; d["weatherError"] = wxError;
    sendJson(200, d);
  });

  server.on("/api/project", HTTP_GET, []() { if (!guard(false)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    File f = LittleFS.open(pathOf(id), "r");
    if (!f) return sendErr(404, "not found");
    server.streamFile(f, "application/json");
    f.close();
  });

  server.on("/api/project", HTTP_POST, []() { if (!guard(true)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    if (!server.hasArg("plain")) return sendErr(400, "no body");
    const String& body = server.arg("plain");
    vfd::Project test; std::string err;
    if (!vfd::parseProject(body.c_str(), body.length(), test, &err)) return sendErr(400, err.c_str());
    if (LittleFS.totalBytes() - LittleFS.usedBytes() < body.length() + 4096 && !LittleFS.exists(pathOf(id))) return sendErr(507, "flash full");
    File f = LittleFS.open(pathOf(id), "w");
    if (!f) return sendErr(500, "write failed");
    size_t w = f.print(body); f.close();
    if (w != body.length()) return sendErr(507, "flash full");
    if (id == activeId) reloadPending = true;
    sendOk();
  });

  server.on("/api/project", HTTP_DELETE, []() { if (!guard(true)) return;
    String id = server.arg("id");
    if (!validId(id)) return sendErr(400, "bad id");
    if (id == activeId) return sendErr(409, "project is active");
    LittleFS.remove(pathOf(id));
    sendOk();
  });

  server.on("/api/active", HTTP_POST, []() { if (!guard(true)) return;
    JsonDocument d; if (!bodyJson(d)) return;
    String id = d["id"] | "";
    if (!validId(id) || !LittleFS.exists(pathOf(id))) return sendErr(404, "not found");
    activeId = id; saveSettings(); reloadPending = true; lastSwitch = millis();
    sendOk();
  });

  server.on("/api/brightness", HTTP_POST, []() { if (!guard(true)) return;
    JsonDocument d; if (!bodyJson(d)) return;
    brightOverride = constrain((int)(d["value"] | 200), 0, 255);
    sendOk();
  });

  server.on("/api/settings", HTTP_GET, []() { if (!guard(false)) return;
    JsonDocument d;
    d["name"] = cfg.name; d["tz"] = cfg.tz; d["ssid"] = cfg.ssid;
    d["nightOn"] = cfg.nightOn; d["nightFrom"] = cfg.nightFrom; d["nightTo"] = cfg.nightTo;
    d["nightMode"] = cfg.nightOff ? "off" : "dim"; d["nightLevel"] = cfg.nightLevel;
    d["city"] = cfg.city; if (cfg.hasLoc) { d["lat"] = cfg.lat; d["lon"] = cfg.lon; }
    d["playSec"] = cfg.playSec; d["maxBright"] = cfg.maxBright; d["reinitMin"] = cfg.reinitMin;
    JsonArray pl = d["playlist"].to<JsonArray>(); for (const String& id : playlistIds()) pl.add(id);
    sendJson(200, d);
  });

  server.on("/api/settings", HTTP_POST, []() { if (!guard(true)) return;
    JsonDocument d; if (!bodyJson(d)) return;
    String name = d["name"] | cfg.name.c_str();
    if (validId(name)) { name.toLowerCase(); cfg.name = name; }
    String tz = d["tz"] | cfg.tz.c_str();
    if (tz.length() && tz != cfg.tz) { cfg.tz = tz; setenv("TZ", cfg.tz.c_str(), 1); tzset(); }
    cfg.nightOn = d["nightOn"] | cfg.nightOn;
    cfg.nightFrom = constrain((int)(d["nightFrom"] | cfg.nightFrom), 0, 1439);
    cfg.nightTo = constrain((int)(d["nightTo"] | cfg.nightTo), 0, 1439);
    cfg.nightOff = String(d["nightMode"] | (cfg.nightOff ? "off" : "dim")) == "off";
    cfg.nightLevel = constrain((int)(d["nightLevel"] | cfg.nightLevel), 0, 255);
    if (d["city"].is<const char*>()) cfg.city = d["city"].as<const char*>();
    if (d["lat"].is<double>() && d["lon"].is<double>()) {
      double la = d["lat"], lo = d["lon"];
      if (la != cfg.lat || lo != cfg.lon || !cfg.hasLoc) { cfg.lat = la; cfg.lon = lo; cfg.hasLoc = true; wxRequest = true; }
    } else if (d["noLoc"] | false) { cfg.hasLoc = false; }
    if (d["playSec"].is<int>()) cfg.playSec = constrain((int)d["playSec"], 5, 86400);
    if (d["maxBright"].is<int>()) { cfg.maxBright = constrain((int)d["maxBright"], 20, 1023); lastContrast = -1; }
    if (d["reinitMin"].is<int>()) cfg.reinitMin = constrain((int)d["reinitMin"], 0, 1440);
    if (d["playlist"].is<JsonArray>()) {
      String pl; for (JsonVariant v : d["playlist"].as<JsonArray>()) { String id = v | ""; if (validId(id)) { if (pl.length()) pl += ","; pl += id; } }
      cfg.playlist = pl; lastSwitch = millis();
    }
    saveSettings();
    syncWeatherLocation();
    sendOk();
  });

  server.on("/api/frame", HTTP_POST, []() { if (!guard(true)) return;
    if (!server.hasArg("plain")) return sendErr(400, "no body");
    std::vector<uint8_t> b = vfd::b64decode(server.arg("plain").c_str());
    if (b.size() != sizeof liveBuf) return sendErr(400, "need 1536 bytes");
    memcpy(liveBuf, b.data(), sizeof liveBuf);
    liveUntil = millis() + 1500; liveOn = true;
    server.send(204);
  });

  server.on("/api/msg", HTTP_POST, []() { if (!guard(true)) return;
    JsonDocument d; if (!bodyJson(d)) return;
    msgText = d["text"] | "";
    int sec = constrain((int)(d["sec"] | 10), 1, 3600);
    msgStart = millis(); msgUntil = msgStart + sec * 1000UL; msgOn = true;
    sendOk();
  });

  server.on("/api/reboot", HTTP_POST, []() { if (!guard(true)) return; sendOk(); rebootAt = millis() + 400; });

  server.on("/api/wifi/forget", HTTP_POST, []() { if (!guard(true)) return;
    cfg.ssid = ""; cfg.pass = ""; saveSettings();
    sendOk(); rebootAt = millis() + 400;
  });

  server.on(
    "/api/update", HTTP_POST,
    []() {
      if (!guard(true)) return;
      bool ok = !Update.hasError() && Update.isFinished();
      String err = ok ? "" : String(Update.errorString());
      server.send(ok ? 200 : 500, "application/json", ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"" + err + "\"}");
      if (ok) { statusScreen("UPDATE OK", "RESTARTING", "", 100); rebootAt = millis() + 800; }
      else { statusScreen("UPDATE FAILED", err, "OLD FIRMWARE KEEPS RUNNING"); statusUntil = millis() + 6000; }
    },
    []() {
      HTTPUpload& up = server.upload();
      static size_t total = 0;
      if (up.status == UPLOAD_FILE_START) uploadDenied = !(hostOk() && writeOk());
      if (uploadDenied) return;   // nothing is written to the update partition
      if (up.status == UPLOAD_FILE_START) {
        total = server.hasArg("size") ? (size_t)server.arg("size").toInt() : 0;   // file size from the studio, for a real percentage
        statusScreen("FIRMWARE UPDATE", "RECEIVING", up.filename, 0);
        statusUntil = millis() + 600000;
        Update.begin(total > 0 ? total : UPDATE_SIZE_UNKNOWN);
      } else if (up.status == UPLOAD_FILE_WRITE) {
        Update.write(up.buf, up.currentSize);
        static uint32_t lastDraw = 0;
        if (millis() - lastDraw > 250) {
          lastDraw = millis();
          int pct = total > 0 ? (int)min((size_t)100, up.totalSize * 100 / total) : -1;
          statusScreen("FIRMWARE UPDATE", "RECEIVING", String(up.totalSize / 1024) + (total > 0 ? " / " + String(total / 1024) : String("")) + " KB", pct);
        }
      } else if (up.status == UPLOAD_FILE_END) {
        Update.end(true);
      } else if (up.status == UPLOAD_FILE_ABORTED) {
        Update.abort(); statusUntil = 0;
      }
    });

  server.onNotFound([]() { sendErr(404, "not found"); });
}

/* ---------------- HTTP: Wi-Fi setup portal ---------------- */
void setupPortal() {
  auto page = []() {
    String h = SETUP_HTML;
    h.replace("%OPTIONS%", apOptions);
    h.replace("%ERR%", apFailHtml);
    h.replace("%NAME%", cfg.name);
    server.send(200, "text/html", h);
  };
  server.on("/", HTTP_GET, page);
  server.on("/wifi/save", HTTP_POST, []() {
    String ssid = server.arg("ssid"); ssid.trim();
    if (!ssid.length()) ssid = server.arg("ssid_sel");
    if (!ssid.length()) { server.sendHeader("Location", "/"); server.send(302); return; }
    cfg.ssid = ssid; cfg.pass = server.arg("pass");
    String name = server.arg("name"); name.toLowerCase();
    if (validId(name)) cfg.name = name;
    saveSettings();
    String h = SAVED_HTML; h.replace("%NAME%", cfg.name);
    server.send(200, "text/html", h);
    statusScreen("SAVED", "CONNECTING TO", cfg.ssid);
    statusUntil = millis() + 5000;
    rebootAt = millis() + 1500;
  });
  server.onNotFound([]() {  // captive portal: send every unknown request to the setup page
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString() + "/");
    server.send(302, "text/plain", "");
  });
}

/* ---------------- Wi-Fi ---------------- */
String htmlEscape(const String& s) {
  String o; for (char c : s) { if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '&') o += "&amp;"; else if (c == '"') o += "&quot;"; else o += c; }
  return o;
}
// setup screen; with a saved network that failed, the last line alternates with the reason
void apScreen() {
  String l3 = "THEN OPEN " + WiFi.softAPIP().toString();
  if (apAlt && apFail.length()) l3 = apFail;
  statusScreen("WIFI SETUP", "JOIN  " + apName, l3);
}
void startAP() {
  apFail = ""; apFailHtml = "";
  if (cfg.ssid.length()) {
    String why = wifiReason ? wifiReasonText() : String("NO ANSWER");
    apFail = "NO CONNECTION: " + why;
    if (vfd::textW(std::string(apFail.c_str()), 0, 1) > 248) apFail = why;
    apFailHtml = "<p style=\"color:#ff2e88\">Could not connect to <b>" + htmlEscape(cfg.ssid) + "</b> (" + htmlEscape(why) +
                 "). If you change nothing, it tries again by itself once no device is connected to this setup network (3 minutes after it opened at the earliest).</p>";
  }
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  statusScreen("WIFI SETUP", "SCANNING NETWORKS");
  int n = WiFi.scanNetworks();
  apOptions = "";
  std::vector<String> seen;
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (!s.length() || std::find(seen.begin(), seen.end(), s) != seen.end()) continue;
    seen.push_back(s);
    String e = htmlEscape(s);
    apOptions += "<option value=\"" + e + "\">" + e + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  WiFi.scanDelete();
  uint64_t mac = ESP.getEfuseMac();
  char suf[5]; snprintf(suf, sizeof suf, "%04X", (uint16_t)(mac >> 32));
  apName = String("VFD-SETUP-") + suf;
  WiFi.softAP(apName.c_str());
  dns.start(53, "*", WiFi.softAPIP());
  apMode = true; apSince = millis();
  setupPortal();
  server.begin();
  apAlt = false; apScreenAt = millis(); apScreen();
}

static uint32_t wifiStart = 0;
void wifiBegin() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(cfg.name.c_str());
  WiFi.setAutoReconnect(true);
  WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  wifiStart = millis();
}
void wifiKick() {  // drop whatever the driver is doing and connect from scratch
  wifiKicks++;
  Serial.printf("[vfd] wifi: reconnecting (%s)\n", wifiReason ? wifiReasonText().c_str() : "no reason yet");
  WiFi.disconnect();
  WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
}
bool connectWifi() {
  if (!wifiStart) wifiBegin();
  uint32_t kicked = wifiStart;
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 22000) {
    connectingScreen(millis() - wifiStart);
    // start over every 8 s, unless the display is already on the network and only waiting for its address
    if (WiFi.status() != WL_IDLE_STATUS && millis() - kicked > 8000) { wifiKick(); kicked = millis(); }
    delay(30);
  }
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFi.setSleep(false);
  return true;
}
// While running: the core retries by itself, without a pause, for as long as the network is gone. That keeps the
// radio searching all the time, and transfers to the display can go wrong for just as long. So the core gets
// 30 s (enough for a short dropout), then its retry is switched off and the firmware makes one attempt every
// 30 s. In between the radio is quiet and the display gets clean frames.
void wifiWatch() {
  uint32_t now = millis();
  if (wifiHeal) { wifiHeal = false; displayHeal(); lastDisplayHeal = now; }
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiDown) {
      wifiDown = false; Serial.printf("[vfd] wifi: back after %lu s\n", (unsigned long)((now - wifiDownAt) / 1000));
      displayHeal(); lastDisplayHeal = now;   // the radio was busy: make sure the display is in step again
      WiFi.setAutoReconnect(true);
      WiFi.setSleep(false);            // also covers a start without network
      if (wxFails > 1) wxFails = 1;    // fetch the weather soon instead of waiting out a long pause
    }
    return;
  }
  if (!wifiDown) { wifiDown = true; wifiDownAt = now; wifiKickAt = now + 30000; Serial.println("[vfd] wifi: connection lost"); displayHeal(); lastDisplayHeal = now; return; }
  if ((int32_t)(now - wifiKickAt) >= 0) { wifiKickAt = now + 30000; WiFi.setAutoReconnect(false); wifiKick(); }
}

// connected = false: started without network after a restart (see setup). Everything is set up the same way and
// begins to work as soon as wifiWatch gets the connection back.
void startOnline(bool connected) {
  configTzTime(cfg.tz.c_str(), "pool.ntp.org", "time.cloudflare.com", "time.google.com");
  MDNS.begin(cfg.name.c_str());
  MDNS.addService("http", "tcp", 80);
  ArduinoOTA.setHostname(cfg.name.c_str());
  ArduinoOTA.onStart([]() { statusScreen("FIRMWARE UPDATE", "ARDUINO OTA", "", 0); });
  ArduinoOTA.onProgress([](unsigned int p, unsigned int t) { static uint32_t l = 0; if (millis() - l > 250) { l = millis(); statusScreen("FIRMWARE UPDATE", "ARDUINO OTA", "", t ? p * 100 / t : 0); } });
  ArduinoOTA.onError([](ota_error_t e) { statusScreen("UPDATE FAILED", String("ERROR ") + (int)e); statusUntil = millis() + 4000; });
  ArduinoOTA.begin();
  syncWeatherLocation();
  xTaskCreatePinnedToCore(weatherTask, "weather", 12288, nullptr, 1, nullptr, 0);
  setupApi();
  server.begin();
  if (!connected) { Serial.println("[vfd] wifi: no connection, running offline"); return; }
  onlineScreen();
  statusUntil = millis() + 6000;
}

/* ---------------- setup / loop ---------------- */
void setup() {
  pinMode(PIN_FIL, OUTPUT);
  digitalWrite(PIN_FIL, LOW);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  Serial.begin(115200);

  Serial.println("\n[vfd] VFD Studio " FW_VERSION);
#if VFD_SPI == 1
  SPI.begin(PIN_CLK, -1, PIN_DATA, -1);  // u8g2 then uses these pins for hardware SPI
  Serial.println("[vfd] display: hardware SPI");
#elif VFD_SPI == 0
  pinMode(PIN_CLK, OUTPUT); pinMode(PIN_DATA, OUTPUT); pinMode(PIN_CS, OUTPUT);
  u8g2.getU8x8()->byte_cb = fastSpiByte;
  Serial.println("[vfd] display: fast software SPI");
#else
  Serial.println("[vfd] display: U8g2 software SPI");
#endif
  setFilament(true);
  esp_reset_reason_t why = esp_reset_reason();
  if (why == ESP_RST_POWERON || why == ESP_RST_BROWNOUT) {
    Serial.println("[vfd] cold start: waiting for the VFD module to power up");
    delay(1000);
  }
  fb.clear();
  initDisplay();

  wxMutex = xSemaphoreCreateMutex();
  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");
  loadSettings();
  WiFi.onEvent(onWifiEvent);                     // records why a connection attempt failed
  if (cfg.ssid.length()) wifiBegin();           // connects in the background while the logo plays
  lastBright = 230; lastContrast = -1;           // logo at 230 of 255 (scaled by the brightness limit)
  bootAnimation();
  // a new firmware brings its own studio: drop an older uploaded one
  prefs.begin("vfd", false);
  if (prefs.getString("fwSeen", "") != FW_VERSION) { LittleFS.remove("/studio.html.gz"); prefs.putString("fwSeen", FW_VERSION); }
  prefs.end();
  setenv("TZ", cfg.tz.c_str(), 1); tzset();
  seedDemos();
  loadActive();

  // No network at boot. After a restart the clock still knows the time: carry on offline with the time and the
  // last weather, and keep trying in the background. After a power cut the time is gone: setup network, as before.
  vfd::TimeT T;
  wxKeepRestore();
  if (cfg.ssid.length() && connectWifi()) startOnline(true);
  else if (cfg.ssid.length() && getTime(T)) startOnline(false);
  else startAP();
}

void loop() {
  server.handleClient();
  if (apMode) {
    dns.processNextRequest();
    // stored network unreachable (e.g. router still booting): retry every 3 minutes while nobody uses the portal
    if (cfg.ssid.length() && WiFi.softAPgetStationNum() == 0 && millis() - apSince > 180000) ESP.restart();
    if (apFail.length() && !rebootAt && millis() - apScreenAt > 4000) { apScreenAt = millis(); apAlt = !apAlt; apScreen(); }
  } else {
    ArduinoOTA.handle();
    wifiWatch();
  }

  // hold BOOT 5 s: forget Wi-Fi and restart in setup mode
  if (digitalRead(PIN_BOOT) == LOW) {
    if (!bootDown) bootDown = millis();
    else if (millis() - bootDown > 5000) { cfg.ssid = ""; cfg.pass = ""; saveSettings(); statusScreen("WIFI RESET", "RESTARTING"); delay(1000); ESP.restart(); }
  } else bootDown = 0;

  if (rebootAt && (int32_t)(millis() - rebootAt) >= 0) { delay(100); ESP.restart(); }
  if (reloadPending) { reloadPending = false; loadActive(); }
  if (!apMode) rotateStep();
  // safety net: initialise the display once more after ~8 s (module fully powered by then)
  if (!reinitDone && millis() > 8000) { reinitDone = true; initDisplay(); lastSoftInit = millis(); }
  // periodic soft re-init: cures a controller that stopped taking new images (short blink)
  if (!apMode && filOn && cfg.reinitMin > 0 && millis() - lastSoftInit >= (uint32_t)cfg.reinitMin * 60000UL) { lastSoftInit = millis(); initDisplay(false); }

  // 60 fps on the wall-clock frame grid (one frame per 16.67 ms, 3 per 50 ms): every frame is drawn right after
  // its boundary, so motion advances in even steps, the same grid the studio preview uses
  struct timeval tv; gettimeofday(&tv, nullptr);
  int64_t frameNo = ((int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000) * 3 / 50;
  if (frameNo != lastFrameNo) {
    lastFrameNo = frameNo;
    uint32_t t0 = micros(); renderStep(); float ms = (micros() - t0) / 1000.0f;
    renderMsAvg = renderMsAvg * 0.95f + ms * 0.05f;
  } else delay(1);
  if (millis() - lastSysUpdate >= 1000) { lastSysUpdate = millis(); updateSys(); }
  if (!apMode && filOn && millis() - lastDisplayHeal >= 10000) { lastDisplayHeal = millis(); displayHeal(); }
  // Between heals only changed tiles are sent. If the controller misses one (bus or supply glitch, e.g. while the
  // radio is working hard on a bad connection), the old content would stay there. A full frame every second
  // (about 10 ms) limits that to one second.
  if (!apMode && filOn && millis() - lastFullFrame >= 1000) { lastFullFrame = millis(); forceSend = true; }
}
