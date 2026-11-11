#pragma once
#include "Arduino.h"
typedef enum { WL_IDLE_STATUS=0, WL_NO_SSID_AVAIL=1, WL_CONNECTED=3, WL_CONNECT_FAILED=4, WL_CONNECTION_LOST=5, WL_DISCONNECTED=6 } wl_status_t;
typedef enum { WIFI_REASON_UNSPECIFIED=1, WIFI_REASON_ASSOC_LEAVE=8, WIFI_REASON_NO_AP_FOUND=201, WIFI_REASON_AUTH_FAIL=202 } wifi_err_reason_t;
typedef enum { ARDUINO_EVENT_WIFI_STA_CONNECTED=11, ARDUINO_EVENT_WIFI_STA_DISCONNECTED=12, ARDUINO_EVENT_MAX=100 } arduino_event_id_t;
typedef struct { uint8_t ssid[33]; uint8_t ssid_len; uint8_t bssid[6]; uint8_t reason; int8_t rssi; } wifi_event_sta_disconnected_t;
typedef union { wifi_event_sta_disconnected_t wifi_sta_disconnected; } arduino_event_info_t;
typedef struct { arduino_event_id_t event_id; arduino_event_info_t event_info; } arduino_event_t;
typedef void (*NetworkEventSysCb)(arduino_event_t*);
struct STAClass { const char* disconnectReasonName(wifi_err_reason_t); };
typedef enum { WIFI_MODE_NULL, WIFI_STA, WIFI_AP, WIFI_AP_STA } wifi_mode_t;
typedef enum { WIFI_POWER_8_5dBm = 34 } wifi_power_t;
struct WiFiClass { bool mode(wifi_mode_t); bool setHostname(const char*); bool setAutoReconnect(bool); wl_status_t begin(const char*,const char* =NULL,int32_t=0,const uint8_t* =NULL,bool=true);
  wl_status_t status(); bool setSleep(bool); bool disconnect(bool=false,bool=false); int16_t scanNetworks(bool=false,bool=false,bool=false,uint32_t=300,uint8_t=0,const char* =nullptr,const uint8_t* =nullptr);
  String SSID(uint8_t); String SSID() const; int32_t RSSI(uint8_t); int8_t RSSI(); void scanDelete(); bool softAP(const char*,const char* =NULL,int=1,int=0,int=4,bool=false);
  IPAddress softAPIP(); IPAddress localIP(); uint8_t softAPgetStationNum();
  int onEvent(NetworkEventSysCb, arduino_event_id_t=ARDUINO_EVENT_MAX); STAClass STA; };
extern WiFiClass WiFi;
