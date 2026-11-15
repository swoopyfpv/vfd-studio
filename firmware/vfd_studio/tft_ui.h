// Native 800×480 UI. Kept independent of Arduino so the same pixels can be previewed on a host.
#pragma once
#include "render.h"

namespace tft {

constexpr int Width = 800, Height = 480;
using Color = uint16_t;
constexpr Color rgb(uint32_t c) {
  return ((c >> 8) & 0xf800) | ((c >> 5) & 0x07e0) | ((c >> 3) & 0x001f);
}

struct Point { int x, y; };
struct Rect {
  int x, y, w, h;
  bool contains(Point p) const { return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h; }
};

// A half-turn is its own inverse. Pixels and touches use this same transform.
inline Point orient(Point p, bool flipped) {
  return flipped ? Point{Width - 1 - p.x, Height - 1 - p.y} : p;
}

enum class View { Clock, Scenes, Settings };
enum class Content { Clock, Scene, Settings, Status };
enum class Action { None, Clock, Scenes, Settings, Ion, Sodium, Violet, Turn, Darker, Brighter };

struct Appearance {
  int theme = 0;
  bool flipped = false;
  int backlight = 80;
};

constexpr int MinBacklight = 10;

struct Theme {
  const char* name;
  Color bg, panel, rule, muted, text, accent, secondary;
};
constexpr Theme Themes[] = {
  {"ION",    rgb(0x071315), rgb(0x102225), rgb(0x254549), rgb(0x82a7a6), rgb(0xdef4ee), rgb(0x62ffce), rgb(0xff9164)},
  {"SODIUM", rgb(0x17100a), rgb(0x25190f), rgb(0x4c3420), rgb(0xc09673), rgb(0xffedd5), rgb(0xffb04a), rgb(0xff6e5e)},
  {"VIOLET", rgb(0x110e1b), rgb(0x211a32), rgb(0x483856), rgb(0xaf9ec5), rgb(0xf8edff), rgb(0xff85ed), rgb(0x98aeff)},
};
constexpr int ThemeCount = sizeof Themes / sizeof Themes[0];

constexpr Rect Tabs[] = {{24, 402, 172, 54}, {204, 402, 172, 54}, {384, 402, 172, 54}};
constexpr Rect Swatches[] = {{48, 152, 222, 64}, {288, 152, 222, 64}, {528, 152, 222, 64}};
constexpr Rect Turn{48, 298, 328, 64};
constexpr Rect Darker{464, 298, 72, 64}, Brighter{676, 298, 72, 64};

inline Action hitTest(Point p, View view) {
  constexpr Action tabs[] = {Action::Clock, Action::Scenes, Action::Settings};
  for (int i = 0; i < 3; ++i) if (Tabs[i].contains(p)) return tabs[i];
  if (view == View::Settings) {
    constexpr Action themes[] = {Action::Ion, Action::Sodium, Action::Violet};
    for (int i = 0; i < ThemeCount; ++i) if (Swatches[i].contains(p)) return themes[i];
    if (Turn.contains(p)) return Action::Turn;
    if (Darker.contains(p)) return Action::Darker;
    if (Brighter.contains(p)) return Action::Brighter;
  }
  return Action::None;
}

struct Canvas {
  Color* pixels;
  bool flipped;

  void fill(Rect r, Color color) {
    int x0 = std::max(0, r.x), y0 = std::max(0, r.y);
    int x1 = std::min(Width, r.x + r.w), y1 = std::min(Height, r.y + r.h);
    if (x0 >= x1 || y0 >= y1) return;
    if (flipped) {
      int x = Width - x1, y = Height - y1;
      x1 = Width - x0; y1 = Height - y0;
      x0 = x; y0 = y;
    }
    for (int y = y0; y < y1; ++y) {
      Color* row = pixels + y * Width;
      std::fill(row + x0, row + x1, color);
    }
  }

  void line(Point a, Point b, Color color, int weight = 1) {
    int dx = abs(b.x - a.x), dy = -abs(b.y - a.y), err = dx + dy;
    int sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    for (;;) {
      fill({a.x, a.y, weight, weight}, color);
      if (a.x == b.x && a.y == b.y) break;
      int e2 = 2 * err;
      if (e2 >= dy) { err += dy; a.x += sx; }
      if (e2 <= dx) { err += dx; a.y += sy; }
    }
  }

  void outline(Rect r, Color color) {
    fill({r.x, r.y, r.w, 1}, color);
    fill({r.x, r.y + r.h - 1, r.w, 1}, color);
    fill({r.x, r.y, 1, r.h}, color);
    fill({r.x + r.w - 1, r.y, 1, r.h}, color);
  }

  void text(int x, int y, const char* s, int scale, Color color, int maxWidth = Width) {
    const int end = x + maxWidth;
    const auto font = vfd::fontOf(vfd::NOPROJ, 1);
    while (*s && x + 5 * scale <= end) {
      auto glyph = vfd::glyphOf(font, vfd::utf8next(s));
      for (int c = 0; c < glyph.w; ++c) {
        for (int r = 0; r < font.h; ++r) {
          if (glyph.cols[c] & (1 << r)) fill({x + c * scale, y + r * scale, scale, scale}, color);
        }
      }
      x += (glyph.w + font.sp) * scale;
    }
  }

  void right(int x, int y, const char* s, int scale, Color color) {
    text(x - vfd::textW(s, 1, scale), y, s, scale, color);
  }

  void mask(int x, int y, int w, int h, int scale, const uint8_t* data, Color color) {
    for (int row = 0; row < h; ++row) {
      // Fill contiguous lit pixels as one operation, including the scaled rows.
      int run = -1;
      for (int col = 0; col <= w; ++col) {
        if (col < w && data[row * w + col]) {
          if (run < 0) run = col;
        } else if (run >= 0) {
          fill({x + run * scale, y + row * scale, (col - run) * scale, scale}, color);
          run = -1;
        }
      }
    }
  }
};

struct Frame {
  View view = View::Clock;
  Content content = Content::Clock;
  vfd::TimeT time{};
  bool synced = false;
  bool online = false;
  bool setup = false;
  bool touch = true;
  char address[24]{};
  const char* title = "";
  const char* detail = "";
  const char* note = "";
  int progress = -1;
  const vfd::FB* scene = nullptr;
  const vfd::Weather* weather = nullptr;
};

inline void frameBorder(Canvas& c, Rect r, const Theme& th) {
  c.fill(r, th.panel);
  c.outline(r, th.rule);
  c.fill({r.x, r.y, 28, 2}, th.accent);
  c.fill({r.x + r.w - 16, r.y + r.h - 2, 16, 2}, th.rule);
}

inline void drawChrome(Canvas& c, const Frame& data, const Theme& th) {
  c.fill({0, 0, Width, Height}, th.bg);
  c.fill({0, 0, Width, 3}, th.accent);
  for (int i = 0; i < 3; ++i) c.line({26 + i * 8, 39}, {37 + i * 8, 22}, i == 2 ? th.secondary : th.accent, 3);
  c.text(65, 23, "TFT STUDIO", 3, th.text);
  const char* state = data.setup ? "WI-FI SETUP" : data.online ? "WI-FI ONLINE" : "OFFLINE";
  int stateWidth = vfd::textW(state, 1, 2);
  c.text(772 - stateWidth, 30, state, 2, th.muted);
  c.fill({752 - stateWidth, 32, 8, 8}, data.online ? th.accent : th.secondary);
  c.fill({24, 63, 752, 1}, th.rule);
  c.fill({24, 387, 752, 1}, th.rule);

  constexpr const char* tabs[] = {"CLOCK", "SCENES", "SETTINGS"};
  for (int i = 0; i < 3; ++i) {
    Rect r = Tabs[i];
    bool selected = static_cast<int>(data.view) == i;
    c.fill(r, selected ? th.rule : th.panel);
    c.outline(r, selected ? th.accent : th.rule);
    if (selected) c.fill({r.x, r.y, 4, r.h}, th.accent);
    c.text(r.x + 16, r.y + 20, tabs[i], 2, selected ? th.accent : th.text);
  }
  if (!data.touch) c.right(772, 404, "TOUCH UNAVAILABLE", 2, th.secondary);
  if (*data.address) c.right(772, 437, data.address, 2, th.muted);
}

// Chamfered segments give the clock a different scale and silhouette from the labels.
inline void bar(Canvas& c, Rect r, bool vertical, Color color) {
  constexpr int chamfer = 5;
  int thickness = vertical ? r.w : r.h;
  for (int i = 0; i < thickness; ++i) {
    int inset = std::max(0, chamfer - std::min(i, thickness - 1 - i));
    if (vertical) c.fill({r.x + i, r.y + inset, 1, r.h - 2 * inset}, color);
    else c.fill({r.x + inset, r.y + i, r.w - 2 * inset, 1}, color);
  }
}

inline void digit(Canvas& c, int x, int y, int num, const Theme& th) {
  constexpr uint8_t masks[] = {0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f};
  constexpr Rect segments[] = {{12, 0, 64, 12}, {76, 12, 12, 56}, {76, 76, 12, 56},
                               {12, 132, 64, 12}, {0, 76, 12, 56}, {0, 12, 12, 56}, {12, 66, 64, 12}};
  uint8_t mask = num >= 0 && num <= 9 ? masks[num] : 0x40;
  for (int i = 0; i < 7; ++i) {
    Rect r = segments[i]; r.x += x; r.y += y;
    bar(c, r, r.h > r.w, (mask & (1 << i)) ? th.accent : th.rule);
  }
}

inline void drawClock(Canvas& c, const Frame& data, const Theme& th) {
  frameBorder(c, {24, 80, 472, 290}, th);
  frameBorder(c, {512, 80, 264, 290}, th);
  c.text(48, 103, "LOCAL TIME", 2, th.muted);
  c.right(472, 103, data.synced ? data.time.tz : "AWAITING SYNC", 2, th.muted);

  const vfd::TimeT& t = data.time;
  int digits[] = {t.h / 10, t.h % 10, t.m / 10, t.m % 10};
  constexpr int xs[] = {48, 150, 279, 381};
  for (int i = 0; i < 4; ++i) digit(c, xs[i], 140, data.synced ? digits[i] : -1, th);
  c.fill({253, 185, 12, 12}, th.secondary);
  c.fill({253, 228, 12, 12}, th.secondary);
  char label[64];
  if (data.synced) {
    const char* days[] = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
    snprintf(label, sizeof label, "%s  %02d.%02d.%04d", days[t.wd], t.D, t.M + 1, t.Y);
  } else {
    snprintf(label, sizeof label, "%s", data.setup ? "CONNECT TO WI-FI" : "WAITING FOR NETWORK TIME");
  }
  c.text(48, 304, label, 2, th.text);
  snprintf(label, sizeof label, "%02d S", t.s);
  if (data.synced) c.right(470, 304, label, 2, th.secondary);
  for (int i = 0; i < 60; ++i) {
    int h = i % 5 == 0 ? 12 : 6;
    c.fill({48 + 7 * i, 352 - h, 3, h}, data.synced && i <= t.s ? th.accent : th.rule);
  }

  c.text(536, 103, "WEATHER", 2, th.muted);
  if (!data.weather || !data.weather->ok) {
    c.text(536, 166, "--°C", 5, th.text);
    c.text(536, 240, data.weather && data.weather->hasLoc ? "AWAITING DATA" : "SET LOCATION", 2, th.accent);
    c.text(536, 264, data.weather && data.weather->hasLoc ? "OPEN-METEO" : "IN WEB STUDIO", 2, th.muted);
    return;
  }

  const auto& w = *data.weather;
  const uint8_t kind = vfd::wxKind(true, w.code, w.day);
  uint8_t icon[256];
  vfd::iconBits(kind, 1, icon);
  c.mask(685, 136, 16, 16, 4, icon, th.secondary);
  snprintf(label, sizeof label, "%+.0f°", w.temp);
  c.text(536, 146, label, 5, th.text, 148);
  const char* conditions[] = {"WEATHER", "CLEAR", "CLEAR", "PARTLY CLOUDY", "PARTLY CLOUDY",
                              "OVERCAST", "RAIN", "SNOW", "THUNDERSTORM", "FOG"};
  c.text(536, 201, conditions[kind], 2, th.text);
  c.text(536, 225, w.city.empty() ? "OUTDOOR" : w.city.c_str(), 2, th.muted, 216);
  c.fill({536, 254, 216, 1}, th.rule);

  int count = std::min(12, w.nh);
  if (count < 2) return;
  snprintf(label, sizeof label, "%dH FORECAST / °C", count);
  c.text(536, 267, label, 2, th.muted);
  auto limits = std::minmax_element(w.hT, w.hT + count);
  double lo = *limits.first, range = std::max(1.0, *limits.second - lo);
  c.fill({536, 324, 216, 1}, th.rule);
  c.fill({536, 350, 216, 1}, th.rule);
  Point last{536, 350};
  for (int i = 0; i < count; ++i) {
    Point pt{536 + i * 213 / (count - 1), 346 - int((w.hT[i] - lo) * 46 / range)};
    if (i) c.line(last, pt, th.accent, 2);
    c.fill({pt.x - 1, pt.y - 1, 4, 4}, th.accent);
    last = pt;
  }
}

inline void drawScene(Canvas& c, const Frame& data, const Theme& th) {
  c.text(32, 90, data.title, 3, th.text, 580);
  if (*data.detail) c.right(768, 96, data.detail, 2, th.muted);
  frameBorder(c, {8, 137, 784, 222}, th);
  for (int y = 156; y < 350; y += 7) c.fill({12, y, 776, 1}, th.bg);
  constexpr int scale = 3, w = vfd::W * scale, h = vfd::H * scale;
  constexpr int x = (Width - w) / 2, y = 174;
  c.fill({x - 4, y - 4, w + 8, h + 8}, th.bg);
  c.outline({x - 4, y - 4, w + 8, h + 8}, th.rule);
  if (data.scene) c.mask(x, y, vfd::W, vfd::H, scale, data.scene->p, th.accent);
  c.text(32, 335, "256 X 48", 2, th.muted);
}

inline void drawSettings(Canvas& c, const Appearance& options, const Theme& th) {
  frameBorder(c, {24, 80, 752, 296}, th);
  c.text(48, 111, "THEME", 2, th.muted);
  for (int i = 0; i < ThemeCount; ++i) {
    Rect r = Swatches[i];
    const Theme& preview = Themes[i];
    bool selected = options.theme == i;
    c.fill(r, preview.bg);
    c.outline(r, selected ? preview.accent : th.rule);
    c.fill({r.x, r.y, r.w, selected ? 3 : 1}, selected ? preview.accent : th.rule);
    c.fill({r.x + 15, r.y + 22, 20, 20}, preview.accent);
    c.fill({r.x + 36, r.y + 22, 5, 20}, preview.secondary);
    c.text(r.x + 54, r.y + 25, preview.name, 2, preview.text);
    if (selected) {
      c.line({r.x + 183, r.y + 32}, {r.x + 189, r.y + 38}, preview.accent, 2);
      c.line({r.x + 189, r.y + 38}, {r.x + 200, r.y + 25}, preview.accent, 2);
    }
  }
  c.fill({48, 241, 704, 1}, th.rule);
  c.text(48, 267, "ORIENTATION", 2, th.muted);
  c.text(464, 267, "BACKLIGHT", 2, th.muted);
  c.fill(Turn, th.bg);
  c.outline(Turn, th.accent);
  c.text(66, 320, options.flipped ? "180°" : "0°", 3, th.accent);
  c.right(356, 323, options.flipped ? "TURN TO 0°" : "TURN TO 180°", 2, th.text);

  c.fill(Darker, th.bg); c.outline(Darker, th.rule);
  c.fill(Brighter, th.bg); c.outline(Brighter, th.rule);
  c.text(494, 319, "-", 4, options.backlight > MinBacklight ? th.accent : th.rule);
  c.text(705, 319, "+", 4, options.backlight < 100 ? th.accent : th.rule);
  char value[8]; snprintf(value, sizeof value, "%d%%", options.backlight);
  c.right(642, 320, value, 3, th.text);
}

inline void drawStatus(Canvas& c, const Frame& data, const Theme& th) {
  frameBorder(c, {24, 80, 752, 290}, th);
  const int scale = vfd::textW(data.title, 1, 5) <= 696 ? 5 : 3;
  c.text(52, 135, data.title, scale, th.accent, 696);
  c.text(52, 212, data.detail, 3, th.text, 696);
  c.text(52, 257, data.note, 2, th.muted, 696);
  if (data.progress >= 0) {
    c.fill({52, 320, 696, 6}, th.rule);
    c.fill({52, 320, 696 * std::min(100, data.progress) / 100, 6}, th.accent);
  }
}

inline void draw(Color* pixels, const Appearance& options, const Frame& data) {
  Canvas canvas{pixels, options.flipped};
  const Theme& th = Themes[options.theme];
  drawChrome(canvas, data, th);
  switch (data.content) {
    case Content::Clock: drawClock(canvas, data, th); break;
    case Content::Scene: drawScene(canvas, data, th); break;
    case Content::Settings: drawSettings(canvas, options, th); break;
    case Content::Status: drawStatus(canvas, data, th); break;
  }
}

}  // namespace tft
