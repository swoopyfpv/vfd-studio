#pragma once
#include "Arduino.h"
class MDNSResponder { public: bool begin(const char*); bool addService(const char*,const char*,uint16_t); }; extern MDNSResponder MDNS;
