// Host-side stubs mirroring arduino-esp32 3.3 signatures — syntax/type check only.
#pragma once
#include <string>
#include <cstring>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cctype>
#include <algorithm>
#include <functional>
using std::min; using std::max;
#define RTC_NOINIT_ATTR
#include <cstddef>
#include <cstdarg>
#include <ctime>
#include <sys/time.h>
#define HIGH 1
#define LOW 0
#define OUTPUT 3
#define INPUT_PULLUP 5
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
#define bit(b) (1UL << (b))
#define HEX 16
#define DEC 10
#define PGM_P const char *
#define F(x) (x)
typedef uint8_t byte;
unsigned long millis(); void delay(uint32_t); void delayMicroseconds(uint32_t); void pinMode(uint8_t,uint8_t); void digitalWrite(uint8_t,uint8_t); int digitalRead(uint8_t);
uint32_t analogReadMilliVolts(uint8_t);
bool btStarted();
class String {
  std::string s;
public:
  long toInt() const { return atol(s.c_str()); }
  String(){} String(const char*c):s(c?c:""){} String(const std::string& x):s(x){} String(int v):s(std::to_string(v)){} String(unsigned v):s(std::to_string(v)){}
  String(long v):s(std::to_string(v)){} String(unsigned long v):s(std::to_string(v)){} String(char c):s(1,c){} String(double v):s(std::to_string(v)){}
  int indexOf(char c,unsigned from=0) const {auto p=s.find(c,from);return p==std::string::npos?-1:(int)p;}
  const char* c_str() const {return s.c_str();} unsigned length() const {return s.size();}
  bool concat(const char* c){s+=c;return true;} bool concat(char c){s+=c;return true;} bool concat(const char* c, unsigned n){s.append(c,n);return true;}
  bool reserve(unsigned n){s.reserve(n);return true;}
  String& operator+=(const String& o){s+=o.s;return *this;} String& operator+=(const char* o){s+=o;return *this;} String& operator+=(char c){s+=c;return *this;}
  friend String operator+(const String& a,const String& b){return String(a.s+b.s);} friend String operator+(const char* a,const String& b){return String(std::string(a)+b.s);}
  friend String operator+(const String& a,const char* b){return String(a.s+b);}
  bool operator==(const String& o) const {return s==o.s;} bool operator==(const char* o) const {return s==o;} bool operator!=(const String& o) const {return s!=o.s;}
  char operator[](unsigned i) const {return s[i];}
  const char* begin() const {return s.data();} const char* end() const {return s.data()+s.size();}
  void replace(const String& a,const String& b){size_t p=0;while((p=s.find(a.s,p))!=std::string::npos){s.replace(p,a.s.size(),b.s);p+=b.s.size();}}
  void toLowerCase(){for(auto&c:s)c=tolower(c);} void trim(){}
  String substring(unsigned a,unsigned b) const {return String(s.substr(a,b-a));} String substring(unsigned a) const {return String(s.substr(a));}
  int lastIndexOf(char c) const {auto p=s.rfind(c);return p==std::string::npos?-1:(int)p;} bool endsWith(const String& x) const {return s.size()>=x.s.size()&&s.compare(s.size()-x.s.size(),x.s.size(),x.s)==0;}
};
class Print;
class Printable { public: virtual size_t printTo(Print&) const = 0; virtual ~Printable(){} };
void configTzTime(const char* tz, const char* server1, const char* server2 = nullptr, const char* server3 = nullptr);
class Print { public: virtual size_t write(uint8_t)=0; virtual size_t write(const uint8_t* b,size_t n){for(size_t i=0;i<n;i++)write(b[i]);return n;} size_t print(const char*); size_t print(const String&); size_t println(const char*); virtual ~Print(){} };
class Stream : public Print { public: virtual int available()=0; virtual int read()=0; virtual int peek()=0; size_t readBytes(char*,size_t); size_t readBytes(uint8_t*,size_t); void setTimeout(unsigned long); };
struct HWSerial : public Stream { void begin(unsigned long); int printf(const char*, ...); size_t write(uint8_t) override; int available() override; int read() override; int peek() override; };
extern HWSerial Serial;
struct EspClass { const char* getChipModel(); uint32_t getFreeHeap(); uint32_t getFreePsram(); uint64_t getEfuseMac(); void restart(); uint32_t getHeapSize(); uint32_t getMinFreeHeap(); uint32_t getPsramSize(); uint32_t getCpuFreqMHz(); uint32_t getSketchSize(); uint32_t getFreeSketchSpace(); uint32_t getCycleCount(); };
float temperatureRead(); unsigned long micros();
extern EspClass ESP;
class IPAddress { public: String toString() const; };
typedef void* SemaphoreHandle_t; typedef int BaseType_t; typedef uint32_t TickType_t; typedef void (*TaskFunction_t)(void*);
#define portMAX_DELAY 0xffffffff
#define pdMS_TO_TICKS(x) (x)
SemaphoreHandle_t xSemaphoreCreateMutex(); BaseType_t xSemaphoreTake(SemaphoreHandle_t, TickType_t); BaseType_t xSemaphoreGive(SemaphoreHandle_t);
void vTaskDelay(TickType_t); BaseType_t xTaskCreatePinnedToCore(TaskFunction_t,const char*,uint32_t,void*,int,void*,int);
String operator+(const String&, int);
