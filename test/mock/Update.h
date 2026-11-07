#pragma once
#include "Arduino.h"
#define UPDATE_SIZE_UNKNOWN 0xFFFFFFFF
class UpdateClass { public: bool begin(size_t size=UPDATE_SIZE_UNKNOWN,int command=0,int ledPin=-1,uint8_t ledOn=0,const char* label=NULL); size_t write(uint8_t* data,size_t len); bool end(bool evenIfRemaining=false); void abort(); bool hasError(); bool isFinished(); const char* errorString(); };
extern UpdateClass Update;
