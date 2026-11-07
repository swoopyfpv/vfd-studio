#pragma once
#include "Arduino.h"
#include "FS.h"
typedef enum { HTTP_ANY, HTTP_GET, HTTP_HEAD, HTTP_POST, HTTP_PUT, HTTP_PATCH, HTTP_DELETE, HTTP_OPTIONS } HTTPMethod;
enum HTTPUploadStatus { UPLOAD_FILE_START, UPLOAD_FILE_WRITE, UPLOAD_FILE_END, UPLOAD_FILE_ABORTED };
struct HTTPUpload { HTTPUploadStatus status; String filename; String name; String type; size_t totalSize; size_t currentSize; uint8_t buf[1436]; };
class RequestHandler {};
class Uri { public: Uri(const char*); Uri(const String&); };
class WebServer { public: typedef std::function<void(void)> THandlerFunction; WebServer(int port=80);
  void begin(); void handleClient();
  RequestHandler &on(const Uri &uri, THandlerFunction fn); RequestHandler &on(const Uri &uri, HTTPMethod method, THandlerFunction fn); RequestHandler &on(const Uri &uri, HTTPMethod method, THandlerFunction fn, THandlerFunction ufn);
  void onNotFound(THandlerFunction fn); HTTPUpload &upload(); String hostHeader(); bool hasHeader(const String &name) const; void collectHeaders(const char *headerKeys[], const size_t headerKeysCount); String arg(const String &name) const; bool hasArg(const String &name) const;
  void send(int code, const char *content_type = NULL, const String &content = String(""));
  void send_P(int code, PGM_P content_type, PGM_P content, size_t contentLength);
  void sendHeader(const String &name, const String &value, bool first = false);
  template<typename T> size_t streamFile(T &file, const String &contentType, const int code = 200){ (void)file.size(); return 0; } };
