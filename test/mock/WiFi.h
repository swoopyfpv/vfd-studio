#pragma once
#include "Arduino.h"
typedef enum { WL_IDLE_STATUS=0, WL_CONNECTED=3 } wl_status_t;
typedef enum { WIFI_MODE_NULL, WIFI_STA, WIFI_AP, WIFI_AP_STA } wifi_mode_t;
struct WiFiClass { bool mode(wifi_mode_t); bool setHostname(const char*); bool setAutoReconnect(bool); wl_status_t begin(const char*,const char* =NULL,int32_t=0,const uint8_t* =NULL,bool=true);
  wl_status_t status(); bool setSleep(bool); bool disconnect(bool=false,bool=false); int16_t scanNetworks(bool=false,bool=false,bool=false,uint32_t=300,uint8_t=0,const char* =nullptr,const uint8_t* =nullptr);
  String SSID(uint8_t); String SSID() const; int32_t RSSI(uint8_t); int8_t RSSI(); void scanDelete(); bool softAP(const char*,const char* =NULL,int=1,int=0,int=4,bool=false);
  IPAddress softAPIP(); IPAddress localIP(); uint8_t softAPgetStationNum(); };
extern WiFiClass WiFi;
