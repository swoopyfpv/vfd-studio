#pragma once
#include <cstdint>
#define GPIO_OUT_W1TS_REG 1
#define GPIO_OUT_W1TC_REG 2
void simReg(int r, uint32_t v);
#define REG_WRITE(r,v) simReg((r),(v))
