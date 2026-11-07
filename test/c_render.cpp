#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <sstream>
#include "../firmware/vfd_studio/project.h"
#include "../firmware/vfd_studio/demos.h"
using namespace vfd;
static TimeT mk(int64_t ms){ TimeT T; time_t s=ms/1000; struct tm tm; localtime_r(&s,&tm);
  T.t=ms;T.h=tm.tm_hour;T.m=tm.tm_min;T.s=tm.tm_sec;T.ms=ms%1000;T.D=tm.tm_mday;T.M=tm.tm_mon;T.Y=tm.tm_year+1900;T.wd=tm.tm_wday;T.doy=tm.tm_yday+1;
  strftime(T.tz,sizeof T.tz,"%Z",&tm); return T; }
int main(int argc,char**argv){
  setenv("TZ","CET-1CEST,M3.5.0,M10.5.0/3",1); tzset();
  { std::ifstream f("test/wx_sample.json"); std::stringstream ss; ss<<f.rdbuf(); JsonDocument d; deserializeJson(d,ss.str()); weatherFromJson(d.as<JsonVariantConst>(), vfd::WX); }
  std::vector<std::string> jsons; for(int i=0;i<DEMO_COUNT;i++) jsons.push_back(DEMO_JSON[i]);
  for(int i=2;i<argc;i++){ std::ifstream f(argv[i]); std::stringstream ss; ss<<f.rdbuf(); jsons.push_back(ss.str()); }
  std::vector<long long> ts; { std::ifstream f(argv[1]); long long v; while(f>>v) ts.push_back(v); }
  static FB fb;
  static JsonDocument lib; { std::ifstream f("assets/fonts_baked.json"); std::stringstream ss; ss<<f.rdbuf(); deserializeJson(lib,ss.str()); }
  FontLoader loader=[&](const std::string& id, Font& F){ JsonVariantConst v=lib[id]; return !v.isNull() && parseFont(v,F); };
  for(auto& j:jsons){ Project P; std::string err; if(!parseProject(j.c_str(),j.size(),P,&err,loader)){fprintf(stderr,"parse: %s\n",err.c_str());return 1;}
    for(long long t:ts){ double dip=renderProject(fb,P,mk(t)); printf("%s %lld %.6f ",P.id.c_str(),t,dip);
      for(int i=0;i<W*H;i+=4) printf("%x",fb.p[i]|fb.p[i+1]<<1|fb.p[i+2]<<2|fb.p[i+3]<<3); printf("\n"); } }
}
