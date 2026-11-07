#pragma once
#include "WiFiClientSecure.h"
class HTTPClient { public: bool begin(NetworkClient &client, String url); void setConnectTimeout(int32_t); void setTimeout(uint16_t); int GET(); String getString(void); void end(void); };
