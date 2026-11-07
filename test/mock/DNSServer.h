#pragma once
#include "Arduino.h"
class DNSServer { public: bool start(uint16_t port,const String& domainName,const IPAddress& resolvedIP); void processNextRequest(); };
