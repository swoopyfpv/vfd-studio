#pragma once
#include "Arduino.h"
typedef enum { OTA_AUTH_ERROR, OTA_BEGIN_ERROR, OTA_CONNECT_ERROR, OTA_RECEIVE_ERROR, OTA_END_ERROR } ota_error_t;
class ArduinoOTAClass { public: typedef std::function<void(void)> THandlerFunction; typedef std::function<void(ota_error_t)> THandlerFunction_Error; typedef std::function<void(unsigned int, unsigned int)> THandlerFunction_Progress;
  ArduinoOTAClass& setHostname(const char*); ArduinoOTAClass& onStart(THandlerFunction); ArduinoOTAClass& onError(THandlerFunction_Error); ArduinoOTAClass& onProgress(THandlerFunction_Progress); void begin(); void handle(); };
extern ArduinoOTAClass ArduinoOTA;
