#pragma once
#include "Arduino.h"
class Preferences { public: bool begin(const char*,bool readOnly=false,const char* partition_label=NULL); void end();
  String getString(const char*,String defaultValue=String()); size_t putString(const char*,String); bool getBool(const char*,bool=false); size_t putBool(const char*,bool); int32_t getInt(const char*,int32_t=0); size_t putInt(const char*,int32_t); double getDouble(const char*,double=0); size_t putDouble(const char*,double); };
