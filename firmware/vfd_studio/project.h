// Parses a VFD Studio project (JSON) into render structs. Needs ArduinoJson v7.
#pragma once
#include <ArduinoJson.h>
#include <map>
#include <functional>
#include "render.h"

namespace vfd {

inline uint8_t pick(const char* v, std::initializer_list<const char*> opts, uint8_t def) {
  if (!v) return def;
  uint8_t i = 0;
  for (const char* o : opts) { if (!strcmp(v, o)) return i; i++; }
  return def;
}

inline std::vector<uint8_t> b64decode(const char* s) {
  std::vector<uint8_t> out;
  if (!s) return out;
  out.reserve(strlen(s) * 3 / 4);
  uint32_t buf = 0; int bits = 0;
  for (; *s; s++) {
    char c = *s; int v;
    if (c >= 'A' && c <= 'Z') v = c - 'A'; else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
    else if (c >= '0' && c <= '9') v = c - '0' + 52; else if (c == '+') v = 62; else if (c == '/') v = 63; else continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push_back((buf >> bits) & 0xFF); }
  }
  return out;
}

// ArduinoJson keeps short decimals as 32-bit floats; recover the exact double JS would use.
inline double num(JsonVariantConst v, double def) {
  if (!v.is<double>()) return def;
  double d = v.as<double>(); float f = (float)d;
  if ((double)f != d) return d;
  char b[32]; snprintf(b, sizeof b, "%.7g", f); return strtod(b, nullptr);
}
// JS parseInt on a string slice (NaN -> 0)
inline int jsParseInt(const std::string& s) {
  size_t i = 0; while (i < s.size() && isspace((unsigned char)s[i])) i++;
  bool neg = false; if (i < s.size() && (s[i] == '-' || s[i] == '+')) { neg = s[i] == '-'; i++; }
  if (i >= s.size() || !isdigit((unsigned char)s[i])) return 0;
  long v = 0; while (i < s.size() && isdigit((unsigned char)s[i])) { v = v * 10 + (s[i] - '0'); i++; if (v > 100000000) break; }
  return (int)(neg ? -v : v);
}
inline bool jsParseIntOk(const std::string& s, int& out) {
  size_t i = 0; while (i < s.size() && isspace((unsigned char)s[i])) i++;
  size_t j = i; if (j < s.size() && (s[j] == '-' || s[j] == '+')) j++;
  if (j >= s.size() || !isdigit((unsigned char)s[j])) return false;
  out = jsParseInt(s); return true;
}
inline std::vector<int> parsePts(const char* s) {
  std::vector<int> o; if (!s) return o;
  std::string str(s); size_t i = 0;
  while (i < str.size()) {
    while (i < str.size() && isspace((unsigned char)str[i])) i++;
    size_t j = i; while (j < str.size() && !isspace((unsigned char)str[j])) j++;
    if (j > i) {
      std::string tok = str.substr(i, j - i); size_t c = tok.find(',');
      if (c != std::string::npos && tok.find(',', c + 1) == std::string::npos) {
        int x, y; if (jsParseIntOk(tok.substr(0, c), x) && jsParseIntOk(tok.substr(c + 1), y)) { o.push_back(x); o.push_back(y); }
      }
    }
    i = j;
  }
  return o;
}

static LType typeOf(const char* t) {
  static const char* N[] = {"", "clock", "text", "marquee", "bar", "rect", "corners", "line", "bitmap", "glitch", "scan", "noise",
                            "shape", "poly", "synth", "dots", "globe", "wxicon", "graph", "anim"};
  if (t) for (int i = 1; i < 20; i++) if (!strcmp(t, N[i])) return (LType)i;
  return L_NONE;
}

inline bool parseFont(JsonVariantConst fo, Font& F) {
  if (!fo["chars"].is<const char*>() || !fo["w"].is<JsonArrayConst>()) return false;
  F.h = fo["h"] | 8; F.sp = fo["sp"] | 1;
  F.cps = utf8all(fo["chars"] | "");
  uint32_t off = 0; size_t k = 0;
  for (JsonVariantConst v : fo["w"].as<JsonArrayConst>()) { if (k >= F.cps.size()) break; int w = v | 0; F.w.push_back((uint8_t)w); F.off.push_back(off); off += ((w + 7) >> 3) * F.h; k++; }
  F.cps.resize(F.w.size());
  for (uint32_t c : F.cps) if (c != ' ') F.scramble.push_back(c);
  F.bits = b64decode(fo["data"] | "");
  return true;
}
// Loads a font from the shared library by id (set by the firmware / test harness)
typedef std::function<bool(const std::string&, Font&)> FontLoader;

// Returns false (and leaves P untouched) on invalid JSON.
inline bool parseProject(const char* json, size_t len, Project& P, std::string* err = nullptr, FontLoader loadFont = nullptr) {
  JsonDocument doc;
  DeserializationError e = deserializeJson(doc, json, len);
  if (e) { if (err) *err = e.c_str(); return false; }
  JsonArray arr = doc["layers"].as<JsonArray>();
  if (arr.isNull()) { if (err) *err = "layers[] missing"; return false; }
  Project Q;
  Q.id = doc["id"] | "";
  Q.name = doc["name"] | "";
  Q.brightness = doc["brightness"] | 200;
  Q.de = !strcmp(doc["lang"] | "en", "de");
  if (doc["shift"].is<bool>()) Q.shift = doc["shift"].as<bool>() ? 1 : 0;
  else Q.shift = pick(doc["shift"] | "both", {"off", "pos", "neg", "both"}, 3);  // default: +-1 px orbit
  Q.loop = doc["loop"] | 0;

  std::map<std::string, int> fontIdx;
  JsonObject fonts = doc["fonts"].as<JsonObject>();
  if (!fonts.isNull())
    for (JsonPair kv : fonts) {
      Font F;
      if (!parseFont(kv.value(), F)) continue;
      fontIdx[kv.key().c_str()] = (int)Q.fonts.size() + 2;
      Q.fonts.push_back(std::move(F));
    }

  for (JsonObject o : arr) {
    Layer L;
    L.type = typeOf(o["type"] | "");
    if (L.type == L_NONE) { Q.layers.push_back(L); continue; }  // keep index stable (seeds use it)
    L.visible = o["visible"] | true;
    L.blink = o["blink"] | 0;
    L.mode = pick(o["mode"] | "set", {"clear", "set", "xor"}, 1);
    L.move = pick(o["move"] | "none", {"none", "slide", "pingpong", "sine", "circle"}, 0);
    L.moveX = o["moveX"] | 0; L.moveY = o["moveY"] | 0; L.movePeriod = o["movePeriod"] | 0; L.movePhase = num(o["movePhase"], 0);
    L.x = o["x"] | 0; L.y = o["y"] | 0; L.w = o["w"] | 0; L.h = o["h"] | 0;
    L.x1 = o["x1"] | 0; L.y1 = o["y1"] | 0; L.x2 = o["x2"] | 0; L.y2 = o["y2"] | 0;
    L.t = o["t"] | (L.type == L_SHAPE ? 2 : 4); L.gap = o["gap"] | 1; L.spacing = o["spacing"] | 4; L.dash = o["dash"] | 0; L.len = o["len"] | 4;
    L.n = o["n"] | (L.type == L_ANIM ? 1 : 30); L.scale = o["scale"] | 1; if (L.scale < 1) L.scale = 1;
    L.period = o["period"] | 5000; L.dur = o["dur"] | 600; L.rows = o["rows"] | 1;
    L.skew = num(o["skew"], 0); L.intensity = num(o["intensity"], 0.6); L.chance = num(o["chance"], 0.06);
    L.density = num(o["density"], 0.003); L.speed = num(o["speed"], L.type == L_GLOBE ? 18 : L.type == L_SYNTH ? 0.6 : 20);
    L.format = o["format"] | "HH:MM"; L.text = o["text"] | "";
    L.align = pick(o["align"].as<const char*>(), {"left", "center", "right"}, 0);
    L.style = pick(o["style"].as<const char*>(), {"solid", "outline", "striped"}, 0);
    L.colon = pick(o["colon"].as<const char*>(), {"blink", "on", "off"}, 0);
    L.trigger = pick(o["trigger"].as<const char*>(), {"minute", "random", "both", "always"}, 2);
    L.lead0 = o["lead0"] | true; L.h12 = o["h12"] | false; L.invert = o["invert"] | false;
    L.fill = o["fill"].is<bool>() ? o["fill"].as<bool>() : false;
    const char* fname = o["font"] | "small";
    if (!strcmp(fname, "medium")) L.font = 1;
    else if (!strcmp(fname, "small")) L.font = 0;
    else {
      auto it = fontIdx.find(fname);
      if (it == fontIdx.end() && loadFont) {  // shared library
        Font F;
        if (loadFont(fname, F)) { fontIdx[fname] = (int)Q.fonts.size() + 2; Q.fonts.push_back(std::move(F)); it = fontIdx.find(fname); }
      }
      L.font = it != fontIdx.end() ? it->second : 0;
    }
    // text fx
    L.fx = pick(o["fx"] | "none", {"none", "type", "scramble", "wave", "bounce", "flicker"}, 0);
    L.fxMs = o["fxMs"] | 60; L.amp = o["amp"] | 2; L.cycle = o["cycle"] | 0;
    // timeline
    L.hasAt = o["at"].is<double>(); L.at = o["at"] | 0; L.length = o["length"] | 0; L.tr = o["tr"] | 0; L.dip = o["dip"] | false;
    L.tin = pick(o["in"] | "none", {"none", "dissolve", "wipe", "slide", "type", "scramble"}, 0);
    L.tout = pick(o["out"] | "none", {"none", "dissolve", "wipe", "slide", "type", "scramble"}, 0);
    // keyframes
    JsonObject ko = o["keys"].as<JsonObject>();
    if (!ko.isNull()) {
      static const char* KP[] = {"dx", "dy", "o", "w", "h", "scale"};
      for (int pi = 0; pi < 6; pi++) {
        JsonArray ka = ko[KP[pi]].as<JsonArray>(); if (ka.isNull()) continue;
        for (JsonVariant kv : ka) {
          JsonArray k = kv.as<JsonArray>();
          if (k.isNull() || k.size() < 2 || !k[0].is<double>() || !k[1].is<double>()) continue;
          L.keys[pi].push_back({num(k[0], 0), num(k[1], 0), pick(k[2] | "linear", {"linear", "in", "out", "inout", "hold"}, 0)});
        }
        std::stable_sort(L.keys[pi].begin(), L.keys[pi].end(), [](const Layer::Key& a, const Layer::Key& b) { return a.t < b.t; });
      }
    }
    switch (L.type) {
      case L_BAR:
        L.source = pick(o["source"].as<const char*>(), {"sec", "min", "hour", "day", "year", "cpu", "ram", "fs"}, 0);
        L.barStyle = pick(o["style"].as<const char*>(), {"fill", "ticks", "dots"}, 1);
        break;
      case L_SHAPE:
        L.kind = pick(o["kind"] | "circle", {"circle", "ring", "half", "quarter", "triangle", "rect", "diamond"}, 0);
        L.dir = o["dir"] | 0; L.spin = o["spin"] | 0;
        L.pat = pick(o["fill"].as<const char*>(), {"solid", "outline", "d25", "d50", "d75", "hlines", "vlines", "diag", "sunset"}, 0);
        break;
      case L_POLY:
        L.pts = parsePts(o["pts"] | "");
        L.pat = pick(o["fill"].as<const char*>(), {"solid", "outline", "d25", "d50", "d75", "hlines", "vlines", "diag", "sunset"}, 0);
        break;
      case L_SYNTH:
        L.hy = o["hy"] | 26; L.vx = o["vx"] | 128; L.spacing = o["spacing"] | 24; L.lines = o["lines"] | 6; L.horizon = o["horizon"] | true;
        break;
      case L_DOTS: {
        L.source = pick(o["source"].as<const char*>(), {"year", "month", "week", "day", "hour", "life"}, 0);
        L.cols = o["cols"] | 61; L.cell = o["cell"] | 4; L.dot = o["dot"] | 3; L.years = o["years"] | 80;
        L.future = pick(o["future"].as<const char*>(), {"dot", "frame", "none"}, 0);
        std::string b = o["birth"] | "1990-01";
        int by = jsParseInt(b.substr(0, std::min<size_t>(4, b.size()))), bm = b.size() > 5 ? jsParseInt(b.substr(5, 2)) : 0;
        L.birthY = by ? by : 1990; L.birthM = bm ? bm : 1;
        break;
      }
      case L_GLOBE:
        L.r = o["r"] | 22; L.tilt = o["tilt"] | 20;
        L.ocean = pick(o["ocean"].as<const char*>(), {"none", "dots", "grid"}, 1);
        L.night = o["night"] | true; L.rim = o["rim"] | true; L.marker = o["marker"] | true;
        break;
      case L_WXICON:
        L.icon = pick(o["icon"] | "auto", {"auto", "clear", "night", "partly", "partlynight", "cloud", "rain", "snow", "storm", "fog"}, 0);
        L.animate = o["animate"] | true; L.scale = o["scale"] | 2; if (L.scale < 1) L.scale = 1;
        break;
      case L_GRAPH:
        L.source = pick(o["source"].as<const char*>(), {"temp", "pop", "rain"}, 0);
        L.gstyle = pick(o["style"].as<const char*>(), {"bars", "line", "dots"}, 0);
        L.hours = o["hours"] | 24;
        break;
      case L_ANIM:
        L.frames = o["n"] | 1; L.frameMs = o["ms"] | 100;
        break;
      default: break;
    }
    if (L.type == L_BITMAP || L.type == L_ANIM) L.data = b64decode(o["data"] | "");
    Q.layers.push_back(std::move(L));
  }
  P = std::move(Q);
  return true;
}

}  // namespace vfd

namespace vfd {
// Weather in the studio's format (what /api/weather returns and what the studio previews with)
inline void weatherFromJson(JsonVariantConst w, Weather& W) {
  W.ok = w["ok"] | false; W.day = w["day"] | true;
  W.temp = num(w["temp"], 0); W.feels = num(w["feels"], 0); W.hum = num(w["hum"], 0); W.rain = num(w["rain"], 0); W.rainNow = num(w["rainNow"], 0);
  W.pop = num(w["pop"], 0); W.wind = num(w["wind"], 0); W.tmax = num(w["tmax"], 0); W.tmin = num(w["tmin"], 0);
  W.code = w["code"] | -1;
  snprintf(W.sunrise, sizeof W.sunrise, "%.5s", (const char*)(w["sunrise"] | "--:--"));
  snprintf(W.sunset, sizeof W.sunset, "%.5s", (const char*)(w["sunset"] | "--:--"));
  W.city = w["city"] | "";
  W.hasLoc = w["lat"].is<double>() && w["lon"].is<double>(); W.lat = num(w["lat"], 0); W.lon = num(w["lon"], 0);
  W.nh = 0;
  JsonArrayConst a = w["hT"], b = w["hP"], c = w["hR"];
  for (int i = 0; i < 24 && i < (int)a.size(); i++) { W.hT[i] = num(a[i], 0); W.hP[i] = i < (int)b.size() ? num(b[i], 0) : 0; W.hR[i] = i < (int)c.size() ? num(c[i], 0) : 0; W.nh = i + 1; }
}
}  // namespace vfd
