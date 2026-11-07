#pragma once
#include "Arduino.h"
struct SPIClass { void begin(int8_t sck=-1,int8_t miso=-1,int8_t mosi=-1,int8_t ss=-1); }; extern SPIClass SPI;
