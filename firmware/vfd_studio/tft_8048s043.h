// Sunton ESP32-8048S043C(-I): 800×480 RGB LCD and polled GT911.
#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_panel_rgb.h>
#include "tft_ui.h"

namespace tft {

class Hardware {
public:
  esp_err_t begin() {
    pinMode(BacklightPin, OUTPUT);
    digitalWrite(BacklightPin, LOW);
    if (!psramFound()) return ESP_ERR_NO_MEM;

    esp_lcd_rgb_panel_config_t cfg{};
    cfg.clk_src = LCD_CLK_SRC_PLL160M;
    cfg.timings.pclk_hz = 12500000;
    cfg.timings.h_res = Width;
    cfg.timings.v_res = Height;
    cfg.timings.hsync_pulse_width = cfg.timings.vsync_pulse_width = 4;
    cfg.timings.hsync_back_porch = cfg.timings.hsync_front_porch = 8;
    cfg.timings.vsync_back_porch = cfg.timings.vsync_front_porch = 8;
    cfg.timings.flags.pclk_active_neg = true;
    cfg.hsync_gpio_num = 39;
    cfg.vsync_gpio_num = 41;
    cfg.de_gpio_num = 40;
    cfg.pclk_gpio_num = 42;
    cfg.disp_gpio_num = -1;
    cfg.data_width = 16;
    cfg.num_fbs = 2;
    cfg.flags.fb_in_psram = true;
    const int pins[] = {8, 3, 46, 9, 1, 5, 6, 7, 15, 16, 4, 45, 48, 47, 21, 14};  // B0–B4, G0–G5, R0–R4
    std::copy(pins, pins + 16, cfg.data_gpio_nums);

    auto err = esp_lcd_new_rgb_panel(&cfg, &panel_);
    if (err != ESP_OK) return err;
    esp_lcd_rgb_panel_event_callbacks_t callbacks{};
    callbacks.on_vsync = onVsync;
    void* a = nullptr;
    void* b = nullptr;
    err = esp_lcd_rgb_panel_get_frame_buffer(panel_, 2, &a, &b);
    if (err == ESP_OK) err = esp_lcd_rgb_panel_register_event_callbacks(panel_, &callbacks, this);
    if (err == ESP_OK) err = esp_lcd_panel_reset(panel_);
    if (err == ESP_OK) err = esp_lcd_panel_init(panel_);
    if (err != ESP_OK) {
      esp_lcd_panel_del(panel_);
      panel_ = nullptr;
      return err;
    }
    buffers_[0] = static_cast<Color*>(a);
    buffers_[1] = static_cast<Color*>(b);
    pwm_ = ledcAttach(BacklightPin, 5000, 10);
    beginTouch();
    return ESP_OK;
  }

  Color* beginFrame() const {
    // The DMA can prefetch one extra frame from the old buffer. Give it two
    // VSYNC boundaries before writing to that buffer again.
    if (!panel_ || (submitted_ && uint32_t(vsync_ - submitVsync_) < 2)) return nullptr;
    return buffers_[back_];
  }

  bool present() {
    if (esp_lcd_panel_draw_bitmap(panel_, 0, 0, Width, Height, buffers_[back_]) != ESP_OK) return false;
    back_ ^= 1;
    submitVsync_ = vsync_;
    submitted_ = true;
    return true;
  }

  void setBacklight(int duty) {
    if (!panel_) return;
    if (pwm_) ledcWrite(BacklightPin, duty);
    else digitalWrite(BacklightPin, duty ? HIGH : LOW);
  }

  void restart() {
    if (panel_) esp_lcd_rgb_panel_restart(panel_);
  }

  bool touchAvailable() const { return touchAddr_ != 0; }

  bool readTap(Point& p) {
    if (!touchAddr_ || millis() - lastPoll_ < 22) return false;
    lastPoll_ = millis();
    uint8_t status = 0;
    if (!readReg(0x814e, &status, 1) || !(status & 0x80)) return false;
    uint8_t count = status & 0x0f;
    uint8_t point[5];  // track ID, X (LE), Y (LE) for the first contact
    bool first = count > 0 && count <= 5 && !touchDown_ && readReg(0x814f, point, sizeof point);
    clearTouchStatus();
    if (!count) touchDown_ = false;
    if (!first) return false;
    touchDown_ = true;
    int x = point[1] | (point[2] << 8), y = point[3] | (point[4] << 8);
    if (rawWidth_ < rawHeight_) {
      p = {std::min(Width - 1, y * Width / rawHeight_), std::min(Height - 1, x * Height / rawWidth_)};
    } else {
      p = {std::min(Width - 1, x * Width / rawWidth_), std::min(Height - 1, y * Height / rawHeight_)};
    }
    return true;
  }

private:
  static constexpr int BacklightPin = 2, TouchReset = 38;
  esp_lcd_panel_handle_t panel_ = nullptr;
  Color* buffers_[2] = {};
  int back_ = 1;
  bool pwm_ = false, submitted_ = false;
  volatile uint32_t vsync_ = 0;
  uint32_t submitVsync_ = 0;
  uint8_t touchAddr_ = 0;
  int rawWidth_ = Width, rawHeight_ = Height;
  uint32_t lastPoll_ = 0;
  bool touchDown_ = false;

  static bool IRAM_ATTR onVsync(esp_lcd_panel_handle_t, const esp_lcd_rgb_panel_event_data_t*, void* arg) {
    Hardware& hw = *static_cast<Hardware*>(arg);
    hw.vsync_ = hw.vsync_ + 1;
    return false;
  }

  void beginTouch() {
    // The stock board may leave INT disconnected. Poll the controller instead.
    pinMode(TouchReset, OUTPUT);
    digitalWrite(TouchReset, LOW);
    delay(15);
    digitalWrite(TouchReset, HIGH);
    delay(70);
    if (!Wire.begin(19, 20, 400000)) return;
    Wire.setTimeOut(12);
    for (uint8_t addr : {0x5d, 0x14}) {
      touchAddr_ = addr;
      uint8_t id[4];
      if (readReg(0x8140, id, sizeof id) && memcmp(id, "911", 3) == 0) {
        uint8_t size[4];
        if (readReg(0x8048, size, sizeof size)) {
          int w = size[0] | (size[1] << 8), h = size[2] | (size[3] << 8);
          if (w >= 100 && h >= 100 && w <= 4096 && h <= 4096) { rawWidth_ = w; rawHeight_ = h; }
        }
        clearTouchStatus();
        return;
      }
    }
    touchAddr_ = 0;
  }

  bool readReg(uint16_t reg, uint8_t* out, size_t n) {
    Wire.beginTransmission(touchAddr_);
    Wire.write(reg >> 8);
    Wire.write(reg & 0xff);
    if (Wire.endTransmission(false) != 0 || Wire.requestFrom(touchAddr_, n, true) != n) return false;
    for (size_t i = 0; i < n; ++i) out[i] = Wire.read();
    return true;
  }

  void clearTouchStatus() {
    Wire.beginTransmission(touchAddr_);
    Wire.write(0x81);
    Wire.write(0x4e);
    Wire.write(uint8_t(0));
    Wire.endTransmission();
  }
};

}  // namespace tft
