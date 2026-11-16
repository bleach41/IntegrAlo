#pragma once
// Single entry point for ArduinoJson, so the PC build and the ESP32 build use the same settings.
// The library is vendored in firmware/lib/ArduinoJson (v7.4.3, MIT licence).
#define ARDUINOJSON_ENABLE_STD_STRING 1
#define ARDUINOJSON_USE_DOUBLE 1
#define ARDUINOJSON_USE_LONG_LONG 1
#include "../../lib/ArduinoJson/ArduinoJson.h"
