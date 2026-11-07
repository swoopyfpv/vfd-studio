#pragma once
#include "Arduino.h"
class File : public Stream { public: File(); File& operator=(const File&); size_t write(uint8_t) override; size_t write(const uint8_t*,size_t) override; int available() override; int read() override; int peek() override;
  size_t read(uint8_t* buf,size_t size); size_t size() const; void close(); const char* name() const; operator bool() const; File openNextFile(const char* mode="r"); };
namespace fs { class FS { public: File open(const char* path,const char* mode="r",bool create=false); File open(const String& path,const char* mode="r",bool create=false);
  bool exists(const char*); bool exists(const String&); bool remove(const char*); bool remove(const String&); bool mkdir(const char*); bool rename(const char*,const char*); }; }
