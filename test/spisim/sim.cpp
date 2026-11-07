#include <cstdint>
#include <cstdio>
#include <vector>
#define U8X8_MSG_BYTE_INIT 20
#define U8X8_MSG_BYTE_SEND 23
#define U8X8_MSG_BYTE_START_TRANSFER 24
#define U8X8_MSG_BYTE_END_TRANSFER 25
#define U8X8_MSG_BYTE_SET_DC 32
struct u8x8_t{};
static const int PIN_CLK=4,PIN_DATA=5,PIN_CS=6;
static uint32_t cyc=0;
struct { uint32_t getCycleCount(){ return cyc+=7; } uint32_t getCpuFreqMHz(){return 240;} } ESP;
void delayMicroseconds(int){}
uint32_t out=0; std::vector<uint8_t> got; int nbits=0; uint8_t cur=0; int edgesWhileDeselected=0; uint32_t lastClkLowCyc=0,lastClkHighCyc=0; uint32_t minLow=1e9,minHigh=1e9,minGap=1e9; bool seenRise=false;
void simReg(int r,uint32_t v){
  uint32_t prev=out; if(r==1) out|=v; else out&=~v;
  bool clkRise=!(prev&(1u<<PIN_CLK))&&(out&(1u<<PIN_CLK)), clkFall=(prev&(1u<<PIN_CLK))&&!(out&(1u<<PIN_CLK));
  bool cs=(out&(1u<<PIN_CS))==0;
  if(clkFall){ if(cs&&seenRise&&nbits==0&&cyc-lastClkHighCyc<minGap) minGap=cyc-lastClkHighCyc; if(cs&&seenRise&&cyc-lastClkHighCyc<minHigh) minHigh=cyc-lastClkHighCyc; lastClkLowCyc=cyc; }
  if(clkRise){ if(!cs){edgesWhileDeselected++;return;}
    if(cyc-lastClkLowCyc<minLow) minLow=cyc-lastClkLowCyc; lastClkHighCyc=cyc; seenRise=true; cur=(cur<<1)|((out>>PIN_DATA)&1); if(++nbits==8){got.push_back(cur);nbits=0;cur=0;} }
}

// Fast software SPI for the GP1294AI (SPI mode 3: clock idles high, data taken on the rising edge, MSB first).
// Each clock phase lasts at least 160 ns (datasheet: tCW >= 120 ns), measured with the CPU cycle counter.
// After every byte the line rests for 400 ns (datasheet: data processing time tDOFF >= 360 ns).
#include "soc/gpio_reg.h"
static uint32_t spiHalfCycles = 40, spiByteGap = 100;
static inline void spiWait(uint32_t c0) { while ((uint32_t)(ESP.getCycleCount() - c0) < spiHalfCycles) {} }
uint8_t fastSpiByte(u8x8_t* u8x8, uint8_t msg, uint8_t arg_int, void* arg_ptr) {
  const uint32_t mClk = 1UL << PIN_CLK, mDat = 1UL << PIN_DATA, mCs = 1UL << PIN_CS;
  switch (msg) {
    case U8X8_MSG_BYTE_SEND: {
      const uint8_t* d = (const uint8_t*)arg_ptr;
      while (arg_int--) {
        uint8_t b = *d++;
        for (int i = 0; i < 8; i++) {
          REG_WRITE((b & 0x80) ? GPIO_OUT_W1TS_REG : GPIO_OUT_W1TC_REG, mDat);
          b <<= 1;
          uint32_t c = ESP.getCycleCount();
          REG_WRITE(GPIO_OUT_W1TC_REG, mClk); spiWait(c);   // clock low: data set up
          c = ESP.getCycleCount();
          REG_WRITE(GPIO_OUT_W1TS_REG, mClk); spiWait(c);   // rising edge: display takes the bit
        }
        uint32_t c = ESP.getCycleCount();                    // tDOFF: let the controller store the byte
        while ((uint32_t)(ESP.getCycleCount() - c) < spiByteGap) {}
      }
      break;
    }
    case U8X8_MSG_BYTE_INIT:
      spiHalfCycles = ESP.getCpuFreqMHz() * 160 / 1000 + 1;
      spiByteGap = ESP.getCpuFreqMHz() * 400 / 1000 + 1;
      REG_WRITE(GPIO_OUT_W1TS_REG, mCs | mClk);              // chip deselected, clock idle high
      break;
    case U8X8_MSG_BYTE_SET_DC: break;                          // no DC line on this display
    case U8X8_MSG_BYTE_START_TRANSFER: REG_WRITE(GPIO_OUT_W1TC_REG, mCs); delayMicroseconds(1); break;
    case U8X8_MSG_BYTE_END_TRANSFER: delayMicroseconds(1); REG_WRITE(GPIO_OUT_W1TS_REG, mCs); break;
    default: return 0;
  }
  return 1;
}

int main(){
  u8x8_t u; fastSpiByte(&u,U8X8_MSG_BYTE_INIT,0,nullptr);
  bool idleHigh=out&(1u<<PIN_CLK), csHigh=out&(1u<<PIN_CS);
  std::vector<uint8_t> sent; for(int i=0;i<1536;i++) sent.push_back((uint8_t)(i*37+11));
  fastSpiByte(&u,U8X8_MSG_BYTE_START_TRANSFER,0,nullptr);
  for(size_t i=0;i<sent.size();i++) fastSpiByte(&u,U8X8_MSG_BYTE_SEND,1,&sent[i]);
  fastSpiByte(&u,U8X8_MSG_BYTE_END_TRANSFER,0,nullptr);
  printf("clock idles high: %d, CS idles high: %d, bytes %zu/%zu identical: %d, clocks outside CS: %d, CS high after: %d, min low %u / min high %u cycles = %.0f / %.0f ns at 240 MHz (datasheet min 120 ns each), min byte-to-byte gap %.0f ns (tDOFF min 360 ns + tCW)\n",
    idleHigh,csHigh,got.size(),sent.size(),got==sent,edgesWhileDeselected,(out>>PIN_CS)&1,minLow,minHigh,minLow/0.24,minHigh/0.24,minGap/0.24);
}
