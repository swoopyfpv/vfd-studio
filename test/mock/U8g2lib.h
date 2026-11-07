#pragma once
#include "Arduino.h"
#define U8X8_PIN_NONE 255
#define U8X8_PROGMEM
struct u8g2_cb_t{}; extern const u8g2_cb_t *U8G2_R0;
typedef struct u8x8_struct u8x8_t;
typedef uint8_t (*u8x8_msg_cb)(u8x8_t*,uint8_t,uint8_t,void*);
struct u8x8_struct{ u8x8_msg_cb byte_cb; u8x8_msg_cb gpio_and_delay_cb; };
#define U8X8_MSG_BYTE_INIT 20
#define U8X8_MSG_BYTE_SEND 23
#define U8X8_MSG_BYTE_START_TRANSFER 24
#define U8X8_MSG_BYTE_END_TRANSFER 25
#define U8X8_MSG_BYTE_SET_DC 32
extern "C" {
uint8_t u8x8_cad_SendCmd(u8x8_t *u8x8, uint8_t cmd);
uint8_t u8x8_cad_SendArg(u8x8_t *u8x8, uint8_t arg);
uint8_t u8x8_cad_StartTransfer(u8x8_t *u8x8);
uint8_t u8x8_cad_EndTransfer(u8x8_t *u8x8);
}
class U8G2 { public: bool begin(); void setContrast(uint8_t); uint8_t* getBufferPtr(); void sendBuffer(); u8x8_t *getU8x8(void);
  void updateDisplayArea(uint8_t tx,uint8_t ty,uint8_t tw,uint8_t th); void clearBuffer(); void setBitmapMode(uint8_t); void setFontMode(uint8_t);
  void drawXBMP(int,int,int,int,const uint8_t*); void drawPixel(int,int); };
class U8G2_GP1294AI_256X48_F_4W_HW_SPI : public U8G2 { public: U8G2_GP1294AI_256X48_F_4W_HW_SPI(const u8g2_cb_t*,uint8_t cs,uint8_t dc,uint8_t reset=U8X8_PIN_NONE); };
class U8G2_GP1294AI_256X48_F_4W_SW_SPI : public U8G2 { public: U8G2_GP1294AI_256X48_F_4W_SW_SPI(const u8g2_cb_t*,uint8_t clock,uint8_t data,uint8_t cs,uint8_t dc,uint8_t reset=U8X8_PIN_NONE); };
