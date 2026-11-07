// VFD Studio render core — 1:1 port of src/core.js in the studio.
// Same project + same time + same weather = same pixels. Portable C++ (also compiles on a PC for testing).
#pragma once
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <algorithm>
#include "fonts.h"

namespace vfd {

static const int W = 256, H = 48;
static const double PI_D = 3.141592653589793;
inline int jround(double v) { return (int)floor(v + 0.5); }  // JS Math.round
inline int isin(int a) { return SIN256[a & 255]; }
inline int icos(int a) { return SIN256[(a + 64) & 255]; }
inline double fatan(double x) { double x2 = x * x; return x * (0.9998660 + x2 * (-0.3302995 + x2 * (0.1801410 + x2 * (-0.0851330 + x2 * 0.0208351)))); }
inline double fatan2(double y, double x) {
  if (x == 0 && y == 0) return 0;
  double ax = fabs(x), ay = fabs(y);
  double r = ax >= ay ? fatan(ay / ax) : PI_D / 2 - fatan(ax / ay);
  if (x < 0) r = PI_D - r;
  return y < 0 ? -r : r;
}

enum LType : uint8_t { L_NONE, L_CLOCK, L_TEXT, L_MARQUEE, L_BAR, L_RECT, L_CORNERS, L_LINE, L_BITMAP, L_GLITCH, L_SCAN, L_NOISE,
                       L_SHAPE, L_POLY, L_SYNTH, L_DOTS, L_GLOBE, L_WXICON, L_GRAPH, L_ANIM };
enum Pattern : uint8_t { P_SOLID, P_OUTLINE, P_D25, P_D50, P_D75, P_HLINES, P_VLINES, P_DIAG, P_SUNSET };
enum Shape : uint8_t { S_CIRCLE, S_RING, S_HALF, S_QUARTER, S_TRIANGLE, S_RECT, S_DIAMOND };
enum TextFx : uint8_t { FX_NONE, FX_TYPE, FX_SCRAMBLE, FX_WAVE, FX_BOUNCE, FX_FLICKER };
enum Move : uint8_t { M_NONE, M_SLIDE, M_PINGPONG, M_SINE, M_CIRCLE };
enum Icon : uint8_t { I_AUTO, I_CLEAR, I_NIGHT, I_PARTLY, I_PARTLYNIGHT, I_CLOUD, I_RAIN, I_SNOW, I_STORM, I_FOG };

struct Font {
  int h = 8, sp = 1;
  std::vector<uint32_t> cps;
  std::vector<uint8_t> w;
  std::vector<uint32_t> off;
  std::vector<uint8_t> bits;
  std::vector<uint32_t> scramble;  // all characters except space, in font order
};

struct Layer {
  LType type = L_NONE;
  bool visible = true;
  int blink = 0;
  uint8_t mode = 1;  // 0 clear, 1 set, 2 xor
  uint8_t move = M_NONE; int moveX = 0, moveY = 0, movePeriod = 0; double movePhase = 0;
  int x = 0, y = 0, w = 0, h = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  int t = 4, gap = 1, spacing = 4, dash = 0, len = 4, n = 30, scale = 1, period = 5000, dur = 600, rows = 1;
  double skew = 0, intensity = 0.6, chance = 0.06, density = 0.003, speed = 20;
  std::string format = "HH:MM", text;
  uint8_t align = 0, style = 0, colon = 0, source = 0, barStyle = 1, trigger = 2;
  int font = 0;  // 0 small, 1 medium, 2+ = project font index + 2
  bool lead0 = true, h12 = false, fill = false, invert = false;
  std::vector<uint8_t> data;
  // text fx
  uint8_t fx = FX_NONE; int fxMs = 60, amp = 2, cycle = 0;
  // shape / poly
  uint8_t kind = S_CIRCLE, pat = P_SOLID; int dir = 0, spin = 0;
  std::vector<int> pts;
  // synth
  int hy = 26, vx = 128, lines = 6; bool horizon = true;
  // dots
  int cols = 61, cell = 4, dot = 3, years = 80, birthY = 1990, birthM = 1; uint8_t future = 0;  // dot frame none
  // globe
  int r = 22, tilt = 20; uint8_t ocean = 1; bool night = true, rim = true, marker = true;
  std::vector<int32_t> glut; int glutR = -1, glutTilt = -9999;
  // weather icon / graph
  uint8_t icon = I_AUTO; bool animate = true; int hours = 24; uint8_t gstyle = 0;  // bars line dots
  // anim
  int frames = 1, frameMs = 100;
  // timeline
  bool hasAt = false, dip = false; int at = 0, length = 0, tr = 0; uint8_t tin = 0, tout = 0;  // TR_*
  // keyframes: per property (KP_*), sorted by time
  struct Key { double t, v; uint8_t ease; };
  std::vector<Key> keys[6];
};
enum KeyProp : uint8_t { KP_DX, KP_DY, KP_O, KP_W, KP_H, KP_SCALE };
enum Ease : uint8_t { E_LINEAR, E_IN, E_OUT, E_INOUT, E_HOLD };
enum Trans : uint8_t { TR_NONE, TR_DISSOLVE, TR_WIPE, TR_SLIDE, TR_TYPE, TR_SCRAMBLE };

struct Project {
  std::string id, name;
  int brightness = 200;
  bool de = false;
  uint8_t shift = 0;     // 0 off, 1 +1px, 2 -1px, 3 +-1px
  int loop = 0;          // timeline length ms, 0 = no timeline
  int64_t t0 = 0;        // when the sequence started (epoch ms)
  std::vector<Font> fonts;
  std::vector<Layer> layers;
};

struct TimeT {
  int64_t t;  // epoch ms
  int h, m, s, ms, D, M, Y, wd, doy;
  char tz[8];
};

struct Weather {
  bool ok = false, day = true, hasLoc = false;
  double temp = 0, feels = 0, hum = 0, rain = 0, rainNow = 0, pop = 0, wind = 0, tmax = 0, tmin = 0, lat = 0, lon = 0;
  int code = -1, nh = 0;
  char sunrise[6] = "--:--", sunset[6] = "--:--";
  std::string city;
  double hT[24], hP[24], hR[24];
};
static Weather WX;  // filled by the firmware's weather task (or the test harness)

struct Sys { double cpu = 23, ram = 41, fs = 12, temp = 44.5; int rssi = -58; int64_t up = 93784; std::string ip = "192.168.1.50"; };
static Sys SYS;   // system stats, refreshed by the firmware

/* ---------- framebuffer ---------- */
struct FB {
  uint8_t p[W * H];
  uint8_t color = 1;
  bool clipOn = false;
  int c0 = 0, c1 = 0, c2 = 0, c3 = 0, ox = 0, oy = 0;
  void clear() { memset(p, 0, sizeof p); }
  void px(int x, int y) {
    x += ox; y += oy;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (clipOn && (x < c0 || y < c1 || x >= c2 || y >= c3)) return;
    int i = y * W + x;
    p[i] = color == 2 ? (p[i] ^ 1) : color;
  }
  void hl(int x, int y, int w) { for (int i = 0; i < w; i++) px(x + i, y); }
  void vl(int x, int y, int h) { for (int i = 0; i < h; i++) px(x, y + i); }
  void box(int x, int y, int w, int h) { for (int j = 0; j < h; j++) hl(x, y + j, w); }
  void frame(int x, int y, int w, int h) {
    if (w < 1 || h < 1) return;
    hl(x, y, w);
    if (h > 1) hl(x, y + h - 1, w);
    if (h > 2) { vl(x, y + 1, h - 2); if (w > 1) vl(x + w - 1, y + 1, h - 2); }
  }
  void line(int x0, int y0, int x1, int y1, int dash) {
    int dx = abs(x1 - x0), dy = -abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
    for (;;) {
      if (!(dash > 0 && (n / dash) % 2)) px(x0, y0);
      n++;
      if (x0 == x1 && y0 == y1) break;
      int e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  void xbm(int x, int y, int w, int h, const uint8_t* b, size_t blen, bool inv) {
    int st = (w + 7) >> 3;
    for (int r = 0; r < h; r++)
      for (int c = 0; c < w; c++) {
        size_t k = (size_t)r * st + (c >> 3);
        int v = k < blen ? (b[k] >> (c & 7)) & 1 : 0;
        if (inv) v ^= 1;
        if (v) px(x + c, y + r);
      }
  }
};

/* ---------- PRNG (mulberry32) ---------- */
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t s) : a(s) {}
  double operator()() {
    a += 0x6D2B79F5u;
    uint32_t t = a;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return (double)(t ^ (t >> 14)) / 4294967296.0;
  }
};
inline uint32_t hash(int64_t a, int b) { return ((uint32_t)a * 2654435761u) ^ ((uint32_t)(b + 1) * 40503u); }

/* ---------- text ---------- */
inline uint32_t utf8next(const char*& s) {
  uint8_t c = (uint8_t)*s++;
  if (c < 0x80) return c;
  int n = (c >= 0xF0) ? 3 : (c >= 0xE0) ? 2 : (c >= 0xC0) ? 1 : 0;
  uint32_t cp = c & (0x3F >> n);
  while (n-- > 0 && (*s & 0xC0) == 0x80) cp = (cp << 6) | (*s++ & 0x3F);
  return cp;
}
inline std::vector<uint32_t> utf8all(const std::string& s) { std::vector<uint32_t> o; const char* p = s.c_str(); while (*p) o.push_back(utf8next(p)); return o; }
inline void utf8put(std::string& o, uint32_t c) {
  if (c < 0x80) o += (char)c;
  else if (c < 0x800) { o += (char)(0xC0 | (c >> 6)); o += (char)(0x80 | (c & 0x3F)); }
  else if (c < 0x10000) { o += (char)(0xE0 | (c >> 12)); o += (char)(0x80 | ((c >> 6) & 0x3F)); o += (char)(0x80 | (c & 0x3F)); }
  else { o += (char)(0xF0 | (c >> 18)); o += (char)(0x80 | ((c >> 12) & 0x3F)); o += (char)(0x80 | ((c >> 6) & 0x3F)); o += (char)(0x80 | (c & 0x3F)); }
}
inline uint32_t mapCp(uint32_t c) {
  switch (c) { case 0xC4: case 0xE4: return 'A'; case 0xD6: case 0xF6: return 'O'; case 0xDC: case 0xFC: return 'U'; case 0xDF: return 'S'; }
  if (c >= 'a' && c <= 'z') return c - 32;
  return c;
}
// A glyph: built-in (column bytes) or custom (row bits at offset)
struct Glyph { const uint8_t* cols; int w; int32_t off; };
struct FontRef { const Font* f; int builtin; int h; int sp; };  // builtin: 0 small, 1 medium, -1 custom
inline FontRef fontOf(const Project& P, int font) {
  if (font >= 2 && font - 2 < (int)P.fonts.size()) { const Font* f = &P.fonts[font - 2]; return {f, -1, f->h, f->sp}; }
  if (font == 1) return {nullptr, 1, 8, 1};
  return {nullptr, 0, 5, 1};
}
inline int customIndex(const Font* f, uint32_t c) { for (size_t i = 0; i < f->cps.size(); i++) if (f->cps[i] == c) return (int)i; return -1; }
inline Glyph glyphOf(const FontRef& F, uint32_t c) {
  if (F.builtin < 0) {
    int i = customIndex(F.f, c);
    if (i < 0) i = customIndex(F.f, mapCp(c));
    if (i < 0) i = customIndex(F.f, '?');
    if (i < 0) return {nullptr, F.h >> 2 > 1 ? F.h >> 2 : 1, -1};
    return {nullptr, F.f->w[i], (int32_t)F.f->off[i]};
  }
  c = mapCp(c);
  if (F.builtin == 0) {
    if (c == 0xB0) return {F35_DEG, 3, 0};
    if (c == 0xB7) return {F35_MID, 3, 0};
    if (c >= 32 && c < 128 && F35_OK[c - 32]) return {F35[c - 32], 3, 0};
    return {F35['?' - 32], 3, 0};
  }
  if (c == 0xB0) return {F57_DEG, 5, 0};
  if (c == 0xB7) return {F57_MID, 5, 0};
  if (c >= 32 && c < 96) return {F57[c - 32], 5, 0};
  return {F57['?' - 32], 5, 0};
}
inline void drawGlyph(FB& fb, int x, int y, const FontRef& F, const Glyph& g, int sc) {
  if (F.builtin < 0) {
    if (g.off < 0) return;
    int st = (g.w + 7) >> 3; const uint8_t* b = F.f->bits.data(); size_t bl = F.f->bits.size();
    for (int r = 0; r < F.h; r++)
      for (int c = 0; c < g.w; c++) {
        size_t k = (size_t)g.off + r * st + (c >> 3);
        if (k < bl && ((b[k] >> (c & 7)) & 1)) { if (sc == 1) fb.px(x + c, y + r); else fb.box(x + c * sc, y + r * sc, sc, sc); }
      }
    return;
  }
  for (int c = 0; c < g.w; c++)
    for (int r = 0; r < F.h; r++)
      if ((g.cols[c] >> r) & 1) { if (sc == 1) fb.px(x + c, y + r); else fb.box(x + c * sc, y + r * sc, sc, sc); }
}
inline int textW(const Project& P, const std::string& str, int font, int sc) {
  FontRef F = fontOf(P, font); int w = 0; const char* s = str.c_str();
  while (*s) { Glyph g = glyphOf(F, utf8next(s)); w += (g.w + F.sp) * sc; }
  return w - F.sp * sc > 0 ? w - F.sp * sc : 0;
}
inline int drawText(FB& fb, const Project& P, int x, int y, const std::string& str, int font, int sc) {
  FontRef F = fontOf(P, font); const char* s = str.c_str();
  while (*s) { Glyph g = glyphOf(F, utf8next(s)); drawGlyph(fb, x, y, F, g, sc); x += (g.w + F.sp) * sc; }
  return x;
}
// built-in fonts only (status screens)
static Project NOPROJ;
inline int textW(const std::string& str, int font, int sc) { return textW(NOPROJ, str, font, sc); }
inline int drawText(FB& fb, int x, int y, const std::string& str, int font, int sc) { return drawText(fb, NOPROJ, x, y, str, font, sc); }
inline int fontH(int font) { return font == 0 ? 5 : 8; }

/* ---------- dates ---------- */
inline bool isLeap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }
inline int daysInMonth(int y, int m) { static const int D[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}; return m == 1 && isLeap(y) ? 29 : D[m]; }
inline int isoWeeks(int y) { auto p = [](int v) { return (v + v / 4 - v / 100 + v / 400) % 7; }; return p(y) == 4 || p(y - 1) == 3 ? 53 : 52; }
inline int isoWeek(const TimeT& T) {
  int iwd = T.wd == 0 ? 7 : T.wd;
  int w = (int)floor((T.doy - iwd + 10) / 7.0);
  if (w < 1) return isoWeeks(T.Y - 1);
  if (w > isoWeeks(T.Y)) return 1;
  return w;
}

/* ---------- tokens ---------- */
static const char* WD_EN[] = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
static const char* WD_DE[] = {"SO", "MO", "DI", "MI", "DO", "FR", "SA"};
static const char* MON_EN[] = {"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"};
static const char* MON_DE[] = {"JAN", "FEB", "MRZ", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"};
static const char* WXT_EN[] = {"CLEAR", "MOSTLY CLEAR", "PARTLY CLOUDY", "OVERCAST", "FOG", "DRIZZLE", "RAIN", "SNOW", "SHOWERS", "THUNDER"};
static const char* WXT_DE[] = {"KLAR", "HEITER", "WOLKIG", "BEDECKT", "NEBEL", "NIESELN", "REGEN", "SCHNEE", "SCHAUER", "GEWITTER"};
inline int wxIdx(int c) {
  if (c == 0) return 0; if (c == 1) return 1; if (c == 2) return 2; if (c == 3) return 3; if (c == 45 || c == 48) return 4;
  if (c >= 51 && c <= 57) return 5; if (c >= 61 && c <= 67) return 6; if ((c >= 71 && c <= 77) || c == 85 || c == 86) return 7;
  if (c >= 80 && c <= 82) return 8; if (c >= 95) return 9; return -1;
}
inline std::string p2(int n) { char b[12]; snprintf(b, sizeof b, "%02d", n); return b; }
inline std::string fnum(double v, int dec) {
  char b[24];
  if (dec == 0) { snprintf(b, sizeof b, "%d", jround(v)); return b; }
  int n = jround(v * 10), a = abs(n);
  snprintf(b, sizeof b, "%s%d.%d", n < 0 ? "-" : "", a / 10, a % 10); return b;
}
inline bool isW(char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_'; }
inline std::string fmt(const std::string& in, const TimeT& T, bool de, int salt) {
  std::string out;
  size_t i = 0;
  const Weather& w = WX;
  while (i < in.size()) {
    if (in[i] == '{') {
      size_t j = i + 1;
      while (j < in.size() && isW(in[j])) j++;
      if (j < in.size() && in[j] == '}' && j > i + 1) {
        std::string k = in.substr(i + 1, j - i - 1), v; bool ok = true; char b[32];
        int ny = isLeap(T.Y) ? 366 : 365;
        if (k == "HH") v = p2(T.h); else if (k == "MM") v = p2(T.m); else if (k == "SS") v = p2(T.s);
        else if (k == "DD") v = p2(T.D); else if (k == "MO") v = p2(T.M + 1);
        else if (k == "MON") v = de ? MON_DE[T.M] : MON_EN[T.M];
        else if (k == "YYYY") { snprintf(b, sizeof b, "%d", T.Y); v = b; }
        else if (k == "YY") v = p2(T.Y % 100);
        else if (k == "WD") v = de ? WD_DE[T.wd] : WD_EN[T.wd];
        else if (k == "DOY") { snprintf(b, sizeof b, "%03d", T.doy); v = b; }
        else if (k == "TZ") v = T.tz;
        else if (k == "KW" || k == "WEEK") v = p2(isoWeek(T));
        else if (k == "DLEFT") { snprintf(b, sizeof b, "%d", ny - T.doy); v = b; }
        else if (k == "YPCT") { snprintf(b, sizeof b, "%d", (int)floor((T.doy - 1) * 100.0 / ny)); v = b; }
        else if (k == "HEX" || k == "HEX8") {
          Rng r(hash(T.t / 120, salt)); int n = k == "HEX" ? 4 : 8;
          for (int q = 0; q < n; q++) v += "0123456789ABCDEF"[(int)floor(r() * 16)];
        }
        else if (k == "TEMP") v = w.ok ? fnum(w.temp, 0) : "--";
        else if (k == "TEMP1") v = w.ok ? fnum(w.temp, 1) : "--";
        else if (k == "FEELS") v = w.ok ? fnum(w.feels, 0) : "--";
        else if (k == "TMAX") v = w.ok ? fnum(w.tmax, 0) : "--";
        else if (k == "TMIN") v = w.ok ? fnum(w.tmin, 0) : "--";
        else if (k == "HUM") v = w.ok ? fnum(w.hum, 0) : "--";
        else if (k == "RAIN") v = w.ok ? fnum(w.rain, 1) : "--";
        else if (k == "RAINNOW") v = w.ok ? fnum(w.rainNow, 1) : "--";
        else if (k == "POP") v = w.ok ? fnum(w.pop, 0) : "--";
        else if (k == "WIND") v = w.ok ? fnum(w.wind, 0) : "--";
        else if (k == "WX") { int x = w.ok ? wxIdx(w.code) : -1; v = x < 0 ? "--" : (de ? WXT_DE[x] : WXT_EN[x]); }
        else if (k == "SUNRISE") v = w.ok ? w.sunrise : "--:--";
        else if (k == "SUNSET") v = w.ok ? w.sunset : "--:--";
        else if (k == "CITY") v = w.city;
        else if (k == "CPU") v = fnum(SYS.cpu, 0);
        else if (k == "RAM") v = fnum(SYS.ram, 0);
        else if (k == "FS") v = fnum(SYS.fs, 0);
        else if (k == "TEMPC") v = fnum(SYS.temp, 0);
        else if (k == "RSSI") { snprintf(b, sizeof b, "%d", SYS.rssi); v = b; }
        else if (k == "UPTIME") {
          int64_t u = SYS.up; int d = (int)(u / 86400), h = (int)(u % 86400 / 3600), m = (int)(u % 3600 / 60);
          if (d > 0) { snprintf(b, sizeof b, "%dD %02dH", d, h); } else snprintf(b, sizeof b, "%02d:%02d", h, m);
          v = b;
        }
        else if (k == "IP") v = SYS.ip;
        else ok = false;
        if (ok) { out += v; i = j + 1; continue; }
      }
    }
    out += in[i++];
  }
  return out;
}

/* ---------- segment digits ---------- */
inline int segMask(char ch) {
  static const uint8_t M[] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
  if (ch >= '0' && ch <= '9') return M[ch - '0'];
  if (ch == '-') return 0x40;
  return -1;
}
inline void segChar(FB& fb, int x, int y, char ch, const Layer& o) {
  int m = segMask(ch); if (m < 0) return;
  const int w = o.w, h = o.h, t = o.t, gap = o.gap, half = t >> 1, bot = y + h - 1;
  const double skew = o.skew; const uint8_t style = o.style;
  auto P = [&](int px, int py) { if (style == 2 && ((py - y) % 3 == 2)) return; fb.px(px + jround((bot - py) * skew), py); };
  const int xl = x + half, xr = x + w - half, ya = y + half, yg = y + (h >> 1), yd = y + h - half;
  auto hs = [&](int yc) {
    for (int i = 0; i < t; i++) {
      int ins = (abs(2 * i - (t - 1)) >> 1) + gap, yy = yc - half + i, x0 = xl + ins, x1 = xr - ins; bool edge = i == 0 || i == t - 1;
      for (int xx = x0; xx < x1; xx++) { if (style == 1 && !edge && xx != x0 && xx != x1 - 1) continue; P(xx, yy); }
    }
  };
  auto vs = [&](int xc, int y0, int y1) {
    for (int j = 0; j < t; j++) {
      int ins = (abs(2 * j - (t - 1)) >> 1) + gap, xx = xc - half + j, a = y0 + ins, b = y1 - ins; bool edge = j == 0 || j == t - 1;
      for (int yy = a; yy < b; yy++) { if (style == 1 && !edge && yy != a && yy != b - 1) continue; P(xx, yy); }
    }
  };
  if (m & 1) hs(ya);
  if (m & 64) hs(yg);
  if (m & 8) hs(yd);
  if (m & 32) vs(xl, ya, yg);
  if (m & 2) vs(xr, ya, yg);
  if (m & 16) vs(xl, yg, yd);
  if (m & 4) vs(xr, yg, yd);
}
inline void replaceFirst(std::string& s, const char* a, const std::string& b) { size_t p = s.find(a); if (p != std::string::npos) s.replace(p, strlen(a), b); }
inline void drawClock(FB& fb, const Layer& L, const TimeT& T) {
  std::string s = L.format;
  replaceFirst(s, "HH", p2(L.h12 ? ((T.h + 11) % 12 + 1) : T.h));
  replaceFirst(s, "MM", p2(T.m));
  replaceFirst(s, "SS", p2(T.s));
  if (!L.lead0 && !s.empty() && s[0] == '0') s[0] = ' ';
  int tw = 0; for (char ch : s) tw += (ch == ':' || ch == '.' ? L.t : L.w) + L.spacing; tw -= L.spacing;
  int x = L.align == 1 ? jround(L.x - tw / 2.0) : L.align == 2 ? L.x - tw : L.x;
  bool colonOn = L.colon == 1 || (L.colon == 0 && T.ms < 500);
  const int bot = L.y + L.h - 1, half = L.t >> 1;
  auto dotAt = [&](int cx, int cy) {
    for (int j = 0; j < L.t; j++) for (int i = 0; i < L.t; i++) {
      int py = cy - half + j; if (L.style == 2 && ((py - L.y) % 3 == 2)) continue;
      fb.px(cx + i + jround((bot - py) * L.skew), py);
    }
  };
  for (char ch : s) {
    if (ch == ':') { if (colonOn) { dotAt(x, L.y + jround(L.h * 0.3)); dotAt(x, L.y + jround(L.h * 0.7)); } x += L.t + L.spacing; }
    else if (ch == '.') { dotAt(x, L.y + L.h - half - 1); x += L.t + L.spacing; }
    else { segChar(fb, x, L.y, ch, L); x += L.w + L.spacing; }
  }
}

/* ---------- patterns + shapes ---------- */
inline bool patOn(uint8_t fill, int px, int py, int y, int h) {
  switch (fill) {
    case P_D25: return (px & 1) == 0 && (py & 1) == 0;
    case P_D50: return ((px + py) & 1) == 0;
    case P_D75: return !((px & 1) == 0 && (py & 1) == 0);
    case P_HLINES: return (py & 1) == 0;
    case P_VLINES: return (px & 1) == 0;
    case P_DIAG: return ((px + py) & 3) == 0;
    case P_SUNSET: { int r = py - y, q = 8 * r - 3 * h; if (q < 0) return true; return (r % 5) >= (int)floor((double)q / h); }
  }
  return true;
}
inline bool inShape(uint8_t kind, int dir, int64_t X, int64_t Y, int64_t w, int64_t h, int t) {
  switch (kind) {
    case S_RECT: return X >= -(w - 1) && X <= w - 1 && Y >= -(h - 1) && Y <= h - 1;
    case S_DIAMOND: return (X < 0 ? -X : X) * h + (Y < 0 ? -Y : Y) * w <= w * h;
    case S_TRIANGLE: {
      int64_t x = X, y = Y, ww = w, hh = h;
      if (dir == 1) { x = Y; y = -X; ww = h; hh = w; } else if (dir == 2) { y = -Y; } else if (dir == 3) { x = Y; y = X; ww = h; hh = w; }
      return y >= -hh && y <= hh && (x < 0 ? -x : x) * 2 * hh <= (y + hh) * ww;
    }
  }
  if (X * X * h * h + Y * Y * w * w > w * w * h * h) return false;
  if (kind == S_RING) { int64_t iw = w - 2 * t, ih = h - 2 * t; if (iw > 0 && ih > 0 && X * X * ih * ih + Y * Y * iw * iw <= iw * iw * ih * ih) return false; }
  if (kind == S_HALF) return dir == 0 ? Y <= 0 : dir == 1 ? X >= 0 : dir == 2 ? Y >= 0 : X <= 0;
  if (kind == S_QUARTER) return dir == 0 ? (X <= 0 && Y <= 0) : dir == 1 ? (X >= 0 && Y <= 0) : dir == 2 ? (X >= 0 && Y >= 0) : (X <= 0 && Y >= 0);
  return true;
}
inline void drawShape(FB& fb, const Layer& L, const TimeT& T) {
  int w = L.w, h = L.h; if (w < 1 || h < 1) return;
  int dir = L.dir & 3; if (L.spin > 0) dir = (int)((dir + T.t / L.spin) & 3);
  int t = L.t < 1 ? 1 : L.t;
  for (int py = L.y; py < L.y + h; py++)
    for (int px = L.x; px < L.x + w; px++) {
      int64_t X = 2 * (px - L.x) - (w - 1), Y = 2 * (py - L.y) - (h - 1);
      if (!inShape(L.kind, dir, X, Y, w, h, t)) continue;
      if (L.pat == P_OUTLINE) {
        int d = 2 * t;
        if (inShape(L.kind, dir, X - d, Y, w, h, t) && inShape(L.kind, dir, X + d, Y, w, h, t) && inShape(L.kind, dir, X, Y - d, w, h, t) && inShape(L.kind, dir, X, Y + d, w, h, t)) continue;
      } else if (!patOn(L.pat, px, py, L.y, h)) continue;
      fb.px(px, py);
    }
}
inline void drawPoly(FB& fb, const Layer& L) {
  const std::vector<int>& p = L.pts; int n = (int)p.size() >> 1; if (n < 2) return;
  if (L.pat == P_OUTLINE) { for (int i = 0; i < n; i++) { int j = (i + 1) % n; fb.line(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1], 0); } return; }
  int y0 = H, y1 = -1;
  for (int i = 0; i < n; i++) { y0 = std::min(y0, p[2 * i + 1]); y1 = std::max(y1, p[2 * i + 1]); }
  std::vector<double> xs;
  for (int y = std::max(0, y0); y <= std::min(H - 1, y1); y++) {
    double yc = y + 0.5; xs.clear();
    for (int i = 0; i < n; i++) {
      int j = (i + 1) % n; double ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
      if ((ay <= yc) != (by <= yc)) xs.push_back(ax + (yc - ay) * (bx - ax) / (by - ay));
    }
    std::sort(xs.begin(), xs.end());
    for (size_t k = 0; k + 1 < xs.size(); k += 2) {
      int a = (int)ceil(xs[k] - 0.5), b = (int)floor(xs[k + 1] - 0.5);
      for (int x = a; x <= b; x++) if (patOn(L.pat, x, y, y0, y1 - y0 + 1)) fb.px(x, y);
    }
  }
}
inline void drawSynth(FB& fb, const Layer& L, const TimeT& T) {
  double f = (double)(T.t % 1000000) / 1000 * L.speed, ph = f - floor(f);
  int n = std::max(1, L.lines);
  if (L.horizon) fb.hl(0, L.hy, W);
  for (int i = 0; i < n; i++) { double tt = (i + ph) / n; int y = L.hy + jround((H - 1 - L.hy) * tt * tt); if (y > L.hy) fb.hl(0, y, W); }
  int sp = std::max(2, L.spacing), K = (int)ceil((double)W / 2 / sp) + 1;
  for (int k = -K; k <= K; k++) fb.line(L.vx + jround(k * sp * 0.06), L.hy + 1, L.vx + k * sp, H - 1, 0);
}
/* ---------- time in dots ---------- */
inline void dotsState(const Layer& L, const TimeT& T, int& n, int& done) {
  switch (L.source) {
    case 1: n = daysInMonth(T.Y, T.M); done = T.D - 1; return;
    case 2: n = 168; done = ((T.wd + 6) % 7) * 24 + T.h; return;
    case 3: n = 96; done = T.h * 4 + T.m / 15; return;
    case 4: n = 60; done = T.m; return;
    case 5: { n = std::max(1, L.years) * 12; int d = (T.Y - L.birthY) * 12 + (T.M + 1 - L.birthM); done = std::max(0, std::min(n, d)); return; }
  }
  n = isLeap(T.Y) ? 366 : 365; done = T.doy - 1;
}
inline void drawDots(FB& fb, const Layer& L, const TimeT& T) {
  int n, done; dotsState(L, T, n, done);
  int cols = std::max(1, L.cols), c = std::max(1, L.cell), d = std::max(1, std::min(L.dot, c));
  for (int i = 0; i < n; i++) {
    int x = L.x + (i % cols) * c, y = L.y + (i / cols) * c;
    if (i < done) fb.box(x, y, d, d);
    else if (i == done) { if (T.ms < 500) fb.box(x, y, d, d); else if (d > 2) fb.frame(x, y, d, d); }
    else if (L.future == 0) fb.px(x + ((d - 1) >> 1), y + ((d - 1) >> 1));
    else if (L.future == 1) { if (d > 2) fb.frame(x, y, d, d); else fb.px(x, y); }
  }
}
/* ---------- globe ---------- */
inline void globeLUT(Layer& L) {
  if (L.glutR == L.r && L.glutTilt == L.tilt) return;
  L.glut.clear();
  int r = L.r; double R = r + 0.5; int a = jround(L.tilt * 256 / 360.0) & 255; double ct = icos(a) / 4096.0, st = isin(a) / 4096.0;
  for (int dy = -r; dy <= r; dy++)
    for (int dx = -r; dx <= r; dx++) {
      double nx = dx / R, ny = dy / R, d = nx * nx + ny * ny; if (d > 1) continue;
      double nz = sqrt(1 - d), yu = -ny, y2 = yu * ct + nz * st, z2 = nz * ct - yu * st;
      double lat = fatan2(y2, sqrt(nx * nx + z2 * z2)), lon = fatan2(nx, z2);
      int row = (int)floor((0.5 - lat / PI_D) * 128); if (row < 0) row = 0; if (row > 127) row = 127;
      int32_t lonFx = (int32_t)floor((lon / (2 * PI_D) + 0.5) * 16777216);
      double lit = -0.55 * nx + 0.45 * yu + 0.7 * nz; bool rim = d >= ((R - 1) / R) * ((R - 1) / R);
      L.glut.push_back(dx); L.glut.push_back(dy); L.glut.push_back(row); L.glut.push_back(lonFx); L.glut.push_back(lit < 0 ? 1 : 0); L.glut.push_back(rim ? 1 : 0);
    }
  L.glutR = L.r; L.glutTilt = L.tilt;
}
inline void drawGlobe(FB& fb, Layer& L, const TimeT& T) {
  globeLUT(L);
  int64_t rot = (int64_t)floor((double)(T.t % 360000000) / 1000 * L.speed / 360 * 16777216);
  const std::vector<int32_t>& g = L.glut;
  for (size_t i = 0; i < g.size(); i += 6) {
    int px = L.x + g[i], py = L.y + g[i + 1], row = g[i + 2], dark = g[i + 4];
    if (L.rim && g[i + 5]) { fb.px(px, py); continue; }
    int64_t c = (g[i + 3] + rot) % 16777216; if (c < 0) c += 16777216; int col = (int)(c / 65536);
    if ((LAND[row * 32 + (col >> 3)] >> (col & 7)) & 1) { if (!(L.night && dark) || ((px + py) & 1) == 0) fb.px(px, py); }
    else if (L.ocean == 1) { if ((col & 7) == 0 && (row & 7) == 4 && !dark) fb.px(px, py); }
    else if (L.ocean == 2) { if (((col & 31) == 0 || (row & 15) == 0) && ((px + py) & 1) == 0) fb.px(px, py); }
  }
  if (L.marker && WX.hasLoc) {
    double R = L.r + 0.5; int64_t colLoc = (int64_t)floor((WX.lon + 180) / 360 * 256) * 65536;
    int64_t sl = (colLoc - rot) % 16777216; if (sl < 0) sl += 16777216;
    int lam = (int)(sl / 65536) - 128, phi = jround(WX.lat * 256 / 360);
    double cp = icos(phi) / 4096.0, sp = isin(phi) / 4096.0, x = cp * isin(lam) / 4096, y2 = sp, z2 = cp * icos(lam) / 4096;
    int a = jround(L.tilt * 256 / 360.0) & 255; double ct = icos(a) / 4096.0, st = isin(a) / 4096.0, yu = y2 * ct - z2 * st, nz = y2 * st + z2 * ct;
    if (nz > 0) {
      int mx = L.x + jround(x * R), my = L.y + jround(-yu * R);
      fb.color = 2; fb.px(mx, my);
      if (T.ms < 500) { fb.px(mx - 1, my); fb.px(mx + 1, my); fb.px(mx, my - 1); fb.px(mx, my + 1); }
      fb.color = 1;
    }
  }
}
/* ---------- weather icon ---------- */
inline uint8_t wxKind(bool has, int code, bool day) {
  if (!has) return I_CLOUD;
  if (code <= 1) return day ? I_CLEAR : I_NIGHT;
  if (code == 2) return day ? I_PARTLY : I_PARTLYNIGHT;
  if (code == 3) return I_CLOUD;
  if (code == 45 || code == 48) return I_FOG;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return I_RAIN;
  if ((code >= 71 && code <= 77) || code == 85 || code == 86) return I_SNOW;
  if (code >= 95) return I_STORM;
  return I_CLOUD;
}
inline void iconBits(uint8_t kind, int64_t fr, uint8_t* g) {
  memset(g, 0, 256);
  auto set = [&](int x, int y, int v) { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y * 16 + x] = (uint8_t)v; };
  auto disc = [&](int cx, int cy, int r, int v) { for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + r) set(x, y, v); };
  auto sun = [&](int cx, int cy, int r, int ray) {
    disc(cx, cy, r, 1); int a = r + 2;
    if (fr % 2 == 0) { for (int k = 0; k < ray; k++) { set(cx + a + k, cy, 1); set(cx - a - k, cy, 1); set(cx, cy + a + k, 1); set(cx, cy - a - k, 1); } }
    else { int b = r + 1; for (int k = 0; k < ray; k++) { set(cx + b + k, cy + b + k, 1); set(cx - b - k, cy + b + k, 1); set(cx + b + k, cy - b - k, 1); set(cx - b - k, cy - b - k, 1); } }
  };
  auto moon = [&](int cx, int cy, int r) { disc(cx, cy, r, 1); disc(cx + 2, cy - 2, r - 1, 0); };
  auto cloud = [&](int ox, int oy) {
    uint8_t f[256]; memset(f, 0, 256);
    auto fd = [&](int cx, int cy, int r) { for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + r) f[y * 16 + x] = 1; };
    fd(ox + 4, oy + 9, 3); fd(ox + 8, oy + 6, 4); fd(ox + 12, oy + 9, 3);
    for (int y = oy + 9; y <= oy + 12; y++) for (int x = ox + 4; x <= ox + 12; x++) if (x >= 0 && y >= 0 && x < 16 && y < 16) f[y * 16 + x] = 1;
    auto at = [&](int x, int y) { return x >= 0 && y >= 0 && x < 16 && y < 16 && f[y * 16 + x]; };
    for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) if (f[y * 16 + x]) { bool e = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1); set(x, y, e ? 1 : 0); }
  };
  switch (kind) {
    case I_CLEAR: sun(8, 8, 3, 2); break;
    case I_NIGHT: moon(8, 8, 5); break;
    case I_PARTLY: sun(5, 5, 2, 1); cloud(1, 2); break;
    case I_PARTLYNIGHT: moon(5, 5, 3); cloud(1, 2); break;
    case I_FOG: for (int k = 0; k < 4; k++) { int y = 4 + k * 3, o = ((fr + k) % 4) < 2 ? 0 : 1; for (int x = 2 + o; x < 14 + o; x++) if ((x + k) % 5 != 0) set(x, y, 1); } break;
    case I_RAIN: cloud(0, -2); for (int k = 0; k < 3; k++) { int x = 4 + k * 4, y = 11 + (int)((fr + k) % 3); set(x, y, 1); set(x - 1, y + 1, 1); } break;
    case I_SNOW: cloud(0, -2); for (int k = 0; k < 4; k++) { int x = 3 + k * 3 + (k & 1), y = 12 + (int)((fr + k * 2) % 4); set(x, y, 1); } break;
    case I_STORM: cloud(0, -2);
      if (fr % 4 != 0) { static const int pts[] = {9, 10, 7, 12, 9, 12, 7, 15};
        for (int i = 0; i < 6; i += 2) { int x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
          while (true) { set(x0, y0, 1); if (x0 == x1 && y0 == y1) break; if (x0 != x1) x0 += x1 > x0 ? 1 : -1; if (y0 != y1) y0 += y1 > y0 ? 1 : -1; } } }
      break;
    default: cloud(0, 0);
  }
}
inline void drawWxIcon(FB& fb, const Layer& L, const TimeT& T) {
  uint8_t kind = L.icon == I_AUTO ? wxKind(WX.ok, WX.code, WX.ok ? WX.day : true) : L.icon;
  int64_t fr = L.animate ? T.t / 250 : 0; uint8_t g[256]; iconBits(kind, fr, g); int s = std::max(1, L.scale);
  for (int i = 0; i < 256; i++) if (g[i]) fb.box(L.x + (i & 15) * s, L.y + (i >> 4) * s, s, s);
}
/* ---------- weather graph ---------- */
inline void drawGraph(FB& fb, const Layer& L) {
  if (!WX.ok || WX.nh < 2) return;
  const double* src = L.source == 1 ? WX.hP : L.source == 2 ? WX.hR : WX.hT;
  int n = std::max(2, std::min(L.hours, WX.nh));
  double lo = 0, hi = 100;
  if (L.source == 0) { lo = INFINITY; hi = -INFINITY; for (int i = 0; i < n; i++) { lo = std::min(lo, src[i]); hi = std::max(hi, src[i]); } if (hi - lo < 1) hi = lo + 1; }
  else if (L.source == 2) { lo = 0; hi = 1; for (int i = 0; i < n; i++) hi = std::max(hi, src[i]); }
  auto nv = [&](int i) { return std::max(0.0, std::min(1.0, (src[i] - lo) / (hi - lo))); };
  if (L.gstyle == 1) {
    int px = 0, py = 0;
    for (int i = 0; i < n; i++) { int x = L.x + jround((double)(i * (L.w - 1)) / (n - 1)), y = L.y + L.h - 1 - jround(nv(i) * (L.h - 1)); if (i) fb.line(px, py, x, y, 0); px = x; py = y; }
    return;
  }
  int bw = std::max(1, L.w / n);
  for (int i = 0; i < n; i++) {
    int bh = jround(nv(i) * L.h), x = L.x + i * bw;
    if (L.gstyle == 2) { fb.px(x, L.y + L.h - 1); if (bh > 0) fb.px(x, L.y + L.h - bh); }
    else { if (bh > 0) fb.box(x, L.y + L.h - bh, std::max(1, bw - 1), bh); else fb.px(x, L.y + L.h - 1); }
  }
}
/* ---------- animated text ---------- */
struct TextTrans { uint8_t kind = 0; double a = 1; };  // kind: 0 none, TR_TYPE, TR_SCRAMBLE
static TextTrans TT;
static const char* SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=<>/";
inline void drawTextLayer(FB& fb, const Layer& L, const TimeT& T, const Project& P, int li) {
  std::vector<std::string> phrases; { size_t a = 0, b; while ((b = L.text.find('|', a)) != std::string::npos) { phrases.push_back(L.text.substr(a, b - a)); a = b + 1; } phrases.push_back(L.text.substr(a)); }
  int np = (int)phrases.size(); bool cyc = L.cycle > 0;
  int idx = cyc ? (int)((T.t / L.cycle) % np) : 0;
  std::string s = fmt(phrases[idx], T, P.de, li);
  std::vector<uint32_t> chars = utf8all(s);
  FontRef F = fontOf(P, L.font); int sc = std::max(1, L.scale), ms = std::max(10, L.fxMs ? L.fxMs : 60);
  int w = textW(P, s, L.font, sc);
  int x = L.align == 1 ? jround(L.x - w / 2.0) : L.align == 2 ? L.x - w : L.x;
  const TextTrans tt = TT;
  if (L.fx == FX_NONE && !tt.kind) { drawText(fb, P, x, L.y, s, L.font, sc); return; }
  int64_t period = cyc ? L.cycle : (int64_t)(chars.size() + 30) * ms, tp = cyc ? T.t % L.cycle : T.t % period;
  int64_t shown = L.fx == FX_TYPE ? tp / ms : (int64_t)chars.size();
  int n = (int)chars.size(); int tShown = tt.kind == TR_TYPE ? (int)floor(tt.a * n) : n;
  static std::vector<uint32_t> builtinScr; if (builtinScr.empty()) builtinScr = utf8all(SCRAMBLE);
  const std::vector<uint32_t>& sf = F.builtin < 0 ? F.f->scramble : builtinScr;
  for (int ci = 0; ci < (int)chars.size(); ci++) {
    if (ci >= shown) { if ((T.t / 350) % 2 == 0) drawText(fb, P, x, L.y, "_", L.font, sc); return; }
    if (ci >= tShown) return;
    uint32_t ch = chars[ci]; int dy = 0;
    if (L.fx == FX_WAVE) dy = jround((double)L.amp * isin((int)((T.t * 16 / ms + ci * 24) & 255)) / 4096);
    else if (L.fx == FX_BOUNCE) dy = -abs(jround((double)L.amp * isin((int)((T.t * 16 / ms + ci * 24) & 255)) / 4096));
    else if (L.fx == FX_SCRAMBLE && ch != ' ' && tp < (int64_t)ci * ms + 200) { Rng r(hash(T.t / 50, li * 131 + ci)); if (!sf.empty()) ch = sf[(size_t)floor(r() * sf.size())]; }
    else if (L.fx == FX_FLICKER) { Rng r(hash(T.t / 80, li * 97 + ci)); if (r() < L.amp / 20.0) ch = ' '; }
    if (tt.kind == TR_SCRAMBLE && ch != ' ' && tt.a * n < ci + 1) { Rng r(hash(T.t / 50, li * 131 + ci)); if (!sf.empty()) ch = sf[(size_t)floor(r() * sf.size())]; }
    Glyph g0 = glyphOf(F, chars[ci]), g = glyphOf(F, ch);
    drawGlyph(fb, x, L.y + dy * sc, F, g, sc); x += (g0.w + F.sp) * sc;
  }
}

/* ---------- layers ---------- */
inline void drawLayer(FB& fb, Layer& L, const TimeT& T, const Project& P, int i, int64_t forceGlitch) {
  switch (L.type) {
    case L_CLOCK: drawClock(fb, L, T); break;
    case L_TEXT: drawTextLayer(fb, L, T, P, i); break;
    case L_MARQUEE: {
      std::string s = fmt(L.text, T, P.de, i); FontRef F = fontOf(P, L.font); int tw = textW(P, s, L.font, L.scale) + F.sp * L.scale;
      if (tw <= 0) break;
      int off = (int)floor(fmod((double)T.t / 1000 * L.speed, (double)tw));
      fb.clipOn = true; fb.c0 = L.x + fb.ox; fb.c1 = L.y + fb.oy; fb.c2 = L.x + L.w + fb.ox; fb.c3 = L.y + F.h * L.scale + fb.oy;
      for (int x = L.x - off; x < L.x + L.w; x += tw) drawText(fb, P, x, L.y, s, L.font, L.scale);
      fb.clipOn = false; break;
    }
    case L_SHAPE: drawShape(fb, L, T); break;
    case L_POLY: drawPoly(fb, L); break;
    case L_SYNTH: drawSynth(fb, L, T); break;
    case L_DOTS: drawDots(fb, L, T); break;
    case L_GLOBE: drawGlobe(fb, L, T); break;
    case L_WXICON: drawWxIcon(fb, L, T); break;
    case L_GRAPH: drawGraph(fb, L); break;
    case L_BAR: {
      double p = 0;
      switch (L.source) {
        case 0: p = (T.s + T.ms / 1000.0) / 60; break;
        case 1: p = (T.m + T.s / 60.0) / 60; break;
        case 2: p = (T.h % 12 + T.m / 60.0) / 12; break;
        case 3: p = (T.h + T.m / 60.0) / 24; break;
        case 4: p = T.doy / 365.0; break;
        case 5: p = SYS.cpu / 100; break;
        case 6: p = SYS.ram / 100; break;
        case 7: p = SYS.fs / 100; break;
      }
      p = std::max(0.0, std::min(1.0, p));
      if (L.barStyle == 0) {
        if (L.h > 2) { fb.frame(L.x, L.y, L.w, L.h); fb.box(L.x + 2, L.y + 2, jround((L.w - 4) * p), L.h - 4); }
        else fb.box(L.x, L.y, jround(L.w * p), L.h);
        break;
      }
      int n = L.n < 1 ? 1 : L.n; double pitch = (double)L.w / n; int tw = (int)floor(pitch) - 1; if (tw < 1) tw = 1;
      int lit = (int)floor(p * n);
      for (int k = 0; k < n; k++) {
        int tx = L.x + jround(k * pitch);
        if (k < lit || (k == lit && T.ms < 500)) fb.box(tx, L.y, tw, L.h);
        else if (L.barStyle == 2) fb.px(tx, L.y + L.h - 1);
        else fb.hl(tx, L.y + L.h - 1, tw);
      }
      break;
    }
    case L_RECT: if (L.fill) fb.box(L.x, L.y, L.w, L.h); else fb.frame(L.x, L.y, L.w, L.h); break;
    case L_CORNERS: {
      int x = L.x, y = L.y, len = L.len, r = x + L.w - 1, b = y + L.h - 1;
      fb.hl(x, y, len); fb.vl(x, y + 1, len - 1); fb.hl(r - len + 1, y, len); fb.vl(r, y + 1, len - 1);
      fb.hl(x, b, len); fb.vl(x, b - len + 1, len - 1); fb.hl(r - len + 1, b, len); fb.vl(r, b - len + 1, len - 1);
      break;
    }
    case L_LINE: fb.line(L.x1, L.y1, L.x2, L.y2, L.dash); break;
    case L_BITMAP: fb.xbm(L.x, L.y, L.w, L.h, L.data.data(), L.data.size(), L.invert); break;
    case L_ANIM: {
      int n = std::max(1, L.frames); size_t fsz = (size_t)((L.w + 7) >> 3) * L.h; int f = (int)((T.t / std::max(10, L.frameMs)) % n);
      size_t o = f * fsz; if (o < L.data.size()) fb.xbm(L.x, L.y, L.w, L.h, L.data.data() + o, std::min(fsz, L.data.size() - o), L.invert);
      break;
    }
    case L_GLITCH: {
      bool on = forceGlitch > T.t;
      int intoMin = T.s * 1000 + T.ms;
      if ((L.trigger == 0 || L.trigger == 2) && intoMin < L.dur) on = true;
      if (L.trigger == 1 || L.trigger == 2) {
        int64_t slot = T.t / 1000; Rng q(hash(slot, i * 7 + 3));
        if (q() < L.chance && (double)(T.t % 1000) < L.dur * 0.5) on = true;
      }
      if (L.trigger == 3) on = true;
      if (!on) break;
      Rng r(hash(T.t / 60, i + 11)); const double k = L.intensity; static uint8_t row[W];
      int n = 1 + (int)floor(r() * k * 6);
      for (int s = 0; s < n; s++) {
        int y0 = (int)floor(r() * H), hh = 1 + (int)floor(r() * (2 + 6 * k)), off = jround((r() * 2 - 1) * 24 * k);
        for (int y = y0; y < (y0 + hh < H ? y0 + hh : H); y++) {
          memcpy(row, fb.p + y * W, W);
          for (int x = 0; x < W; x++) { int sx = x - off; fb.p[y * W + x] = (sx >= 0 && sx < W) ? row[sx] : 0; }
        }
      }
      if (r() < k * 0.6) {
        int bx = (int)floor(r() * W), by = (int)floor(r() * H), bw = 4 + (int)floor(r() * 30 * k), bh = 1 + (int)floor(r() * 4);
        fb.color = 2; fb.box(bx, by, bw, bh); fb.color = 1;
      }
      break;
    }
    case L_SCAN: {
      if (L.period <= 0 || L.dur <= 0) break;
      int ph = (int)(T.t % L.period); if (ph >= L.dur) break;
      int y = (int)floor((double)ph / L.dur * (H + L.rows)) - L.rows;
      fb.color = 2; for (int r = 0; r < L.rows; r++) fb.hl(0, y + r, W); fb.color = 1; break;
    }
    case L_NOISE: {
      Rng r(hash(T.t / 50, i + 29)); int n = (int)floor(W * H * L.density);
      for (int k = 0; k < n; k++) { int j = (int)floor(r() * W * H); fb.p[j] ^= 1; }
      break;
    }
    default: break;
  }
}

inline bool isFx(LType t) { return t == L_GLITCH || t == L_SCAN || t == L_NOISE; }
inline void moveOffset(const Layer& L, const TimeT& T, int& ox, int& oy) {
  ox = oy = 0; int P = L.movePeriod; if (L.move == M_NONE || P <= 0) return;
  int64_t tt = (T.t + (int64_t)floor(L.movePhase * P)) % P; int mx = L.moveX, my = L.moveY;
  switch (L.move) {
    case M_SLIDE: ox = (int)floor((double)mx * tt / P); oy = (int)floor((double)my * tt / P); break;
    case M_PINGPONG: { double f = tt * 2 < P ? 2.0 * tt / P : 2 - 2.0 * tt / P; ox = jround(mx * f); oy = jround(my * f); break; }
    case M_SINE: { int a = (int)(tt * 256 / P); ox = jround((double)mx * isin(a) / 4096); oy = jround((double)my * isin(a) / 4096); break; }
    case M_CIRCLE: { int a = (int)(tt * 256 / P); ox = jround((double)mx * icos(a) / 4096); oy = jround((double)my * isin(a) / 4096); break; }
  }
}

/* ---------- timeline ---------- */
static const uint8_t BAYER8[64] = {0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
                                   3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21};
inline int64_t loopTime(const Project& P, const TimeT& T) {
  if (P.loop <= 0) return -1;
  int64_t t0 = P.t0 - (((P.t0 % 50) + 50) % 50);  // snap to 50 ms = 3 frames at 60 fps (as in the studio)
  return (((T.t - t0) % P.loop) + P.loop) % P.loop;
}
// amount 0..1 and direction (0 full, 1 in, -1 out)
inline void timing(const Layer& L, const Project& P, int64_t lt, double& a, int& dir) {
  a = 1; dir = 0;
  if (lt < 0 || !L.hasAt) return;
  int64_t at = L.at, dur = L.length > 0 ? L.length : P.loop - at;
  if (lt < at || lt >= at + dur) { a = 0; return; }
  int tr = std::max(0, L.tr);
  if (tr > 0 && L.tin && lt - at < tr) { a = (double)(lt - at) / tr; dir = 1; }
  if (tr > 0 && L.tout && at + dur - lt <= tr) { double b = (double)(at + dur - lt) / tr; if (b < a) { a = b; dir = -1; } }
}
inline double dipFactor(const Project& P, int64_t lt) {
  if (lt < 0) return 1;
  double f = 1;
  for (const Layer& L : P.layers) {
    if (!L.dip || !L.hasAt || !L.visible || L.type == L_NONE) continue;
    int64_t at = L.at, dur = L.length > 0 ? L.length : P.loop - at; int tr = L.tr > 0 ? L.tr : 400;
    int64_t edges[2] = {at, at + dur};
    for (int64_t e : edges) { int64_t d = lt > e ? lt - e : e - lt; d = std::min<int64_t>(d, P.loop - d); if (d < tr) f = std::min(f, (double)d / tr); }
  }
  return f;
}
inline double easeF(uint8_t e, double f) {
  switch (e) { case E_IN: return f * f; case E_OUT: return 1 - (1 - f) * (1 - f); case E_INOUT: return f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f); case E_HOLD: return 0; }
  return f;
}
inline double keyVal(const std::vector<Layer::Key>& a, double t) {
  size_t n = a.size();
  if (t <= a[0].t) return a[0].v;
  if (t >= a[n - 1].t) return a[n - 1].v;
  for (size_t i = 0; i + 1 < n; i++) { const Layer::Key &k = a[i], &m = a[i + 1]; if (t < m.t) { double f = (t - k.t) / (m.t - k.t); return k.v + (m.v - k.v) * easeF(k.ease, f); } }
  return a[n - 1].v;
}

// returns the brightness factor (brightness dip), 1 = normal
inline double renderProject(FB& fb, Project& P, const TimeT& T, int64_t forceGlitch = 0) {
  static FB tmp;
  fb.clear();
  int64_t lt = loopTime(P, T);
  for (size_t i = 0; i < P.layers.size(); i++) {
    Layer& L = P.layers[i];
    if (!L.visible || L.type == L_NONE) continue;
    if (L.blink > 0 && (double)(T.t % L.blink) >= L.blink / 2.0) continue;
    double a; int dir; timing(L, P, lt, a, dir); if (a <= 0) continue;
    uint8_t col = L.mode;
    int ox = 0, oy = 0; if (!isFx(L.type)) moveOffset(L, T, ox, oy);
    // keyframes
    double op = 1; int sw = L.w, sh = L.h, ssc = L.scale; bool hasK = false;
    if (lt >= 0 && !isFx(L.type)) {
      for (int pi = 0; pi < 6; pi++) {
        if (L.keys[pi].empty()) continue;
        double v = keyVal(L.keys[pi], std::floor((double)lt * 3 / 50.0) * 50.0 / 3.0); hasK = true;  // 60 fps frame grid
        switch (pi) {
          case KP_DX: ox += jround(v); break;
          case KP_DY: oy += jround(v); break;
          case KP_O: op = std::max(0.0, std::min(100.0, v)) / 100; break;
          case KP_W: L.w = std::max(0, jround(v)); break;
          case KP_H: L.h = std::max(0, jround(v)); break;
          case KP_SCALE: L.scale = std::max(1, jround(v)); break;
        }
      }
    }
    if (op <= 0) { if (hasK) { L.w = sw; L.h = sh; L.scale = ssc; } continue; }
    uint8_t maskKind = 0; int maskN = 0;  // 1 wipe-in, 2 wipe-out, 3 dissolve
    if (dir != 0 && !isFx(L.type)) {
      uint8_t eff = dir > 0 ? L.tin : L.tout;
      if (eff == TR_SLIDE) oy += (dir > 0 ? 1 : -1) * jround((1 - a) * 16);
      else if (L.type == L_TEXT && (eff == TR_TYPE || eff == TR_SCRAMBLE)) { TT.kind = eff; TT.a = a; }
      else if (eff == TR_WIPE) { maskN = (int)floor(a * W); maskKind = dir > 0 ? 1 : 2; }
      else { maskN = (int)floor(a * 64); maskKind = 3; }
    }
    int opN = op < 1 ? (int)floor(op * 64) : 64; bool useMask = maskKind || op < 1;
    FB& tg = useMask ? tmp : fb;
    if (useMask) { tmp.clear(); tmp.color = col == 2 ? 2 : 1; } else fb.color = col;
    tg.ox = ox; tg.oy = oy;
    drawLayer(tg, L, T, P, (int)i, forceGlitch);
    if (useMask) {
      for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++) {
          int k = y * W + x; if (!tmp.p[k]) continue;
          int bay = BAYER8[(y & 7) * 8 + (x & 7)];
          bool m = maskKind == 1 ? x < maskN : maskKind == 2 ? x >= W - maskN : maskKind == 3 ? bay < maskN : true;
          if (m && bay < opN) fb.p[k] = col == 2 ? (fb.p[k] ^ 1) : col;
        }
      tmp.ox = tmp.oy = 0; tmp.clipOn = false; tmp.color = 1;
    }
    TT.kind = 0;
    if (hasK) { L.w = sw; L.h = sh; L.scale = ssc; }
    fb.color = 1; fb.ox = 0; fb.oy = 0; fb.clipOn = false;
  }
  if (P.shift) {
    static const int8_t SP[4][2] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}}, SN[4][2] = {{0, 0}, {-1, 0}, {-1, -1}, {0, -1}}, SB[5][2] = {{0, 0}, {1, 0}, {0, 1}, {-1, 0}, {0, -1}};
    int len = P.shift == 3 ? 5 : 4; int k = (int)((T.t / 300000) % len);
    const int8_t* d = P.shift == 1 ? SP[k] : P.shift == 2 ? SN[k] : SB[k];
    int dx = d[0], dy = d[1];
    if (dx || dy) {
      static uint8_t c[W * H]; memcpy(c, fb.p, sizeof c); fb.clear();
      for (int y = 0; y < H; y++) { int ny = y + dy; if (ny < 0 || ny >= H) continue;
        for (int x = 0; x < W; x++) { int nx = x + dx; if (nx >= 0 && nx < W) fb.p[ny * W + nx] = c[y * W + x]; } }
    }
  }
  return dipFactor(P, lt);
}

}  // namespace vfd
