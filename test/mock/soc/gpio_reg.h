#pragma once
#include <cstdint>
#define GPIO_OUT_W1TS_REG 0x60004008
#define GPIO_OUT_W1TC_REG 0x6000400C
#define REG_WRITE(r,v) (*(volatile uint32_t*)(uintptr_t)(r)=(v))
