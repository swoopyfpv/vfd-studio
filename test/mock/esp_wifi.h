#pragma once
#include <cstdint>

using esp_err_t = int;
constexpr esp_err_t ESP_OK = 0;
esp_err_t esp_wifi_get_max_tx_power(int8_t* power);
esp_err_t esp_wifi_set_max_tx_power(int8_t power);
const char* esp_err_to_name(esp_err_t error);
