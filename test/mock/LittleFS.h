#pragma once
#include "FS.h"
class LittleFSFS : public fs::FS { public: bool begin(bool formatOnFail=false,const char* basePath="/littlefs",uint8_t maxOpenFiles=10,const char* partitionLabel="spiffs"); size_t totalBytes(); size_t usedBytes(); };
extern LittleFSFS LittleFS;
