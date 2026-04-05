#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LoRa.h>
#include <SPI.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>

#define LED_BUILTIN 2
#define VENT_FAN 27
#define HEATER 25
#define SPRINKLER 33
#define DUMMY 32

const char* WIFI_SSID = "Temp";
const char* WIFI_PASSWORD = "123445666";

const char* API_BASE = "https://ai-poultry-dashboard.onrender.com/api";
const char* NODE_ID = "N1";

const unsigned long CONTROL_REFRESH_MS = 5000;

hd44780_I2Cexp lcd;
WiFiClientSecure secureClient;

float latestTemp = 0;
float latestHum = 0;
int latestMq = 0;
int latestRssi = 0;
unsigned long lastControlCheck = 0;

void connectWiFi();
void blink(int cycle = 0);
void displayData(float temp, float hum, int mq, int rssi, const String& modeLabel);
void applyRelayState(bool relay1On, bool relay2On);
bool postSensorData(float temp, float hum, int mq, bool relay1On, bool relay2On);
bool fetchControlMode(String& controlMode, bool& relay1On, bool& relay2On);
bool fetchMlDecision(float temp, float hum, bool& sprinklerOn);

void setup() {
  Serial.begin(9600);
  delay(2000);

  SPI.begin(18, 19, 23, 5);
  Wire.begin(21, 22);
  lcd.begin(16, 2);
  lcd.backlight();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Init system");

  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(VENT_FAN, OUTPUT);
  pinMode(HEATER, OUTPUT);
  pinMode(SPRINKLER, OUTPUT);
  pinMode(DUMMY, OUTPUT);

  applyRelayState(false, false);
  digitalWrite(HEATER, LOW);
  digitalWrite(DUMMY, LOW);

  LoRa.setPins(5, 14, 26);
  if (!LoRa.begin(433E6)) {
    lcd.clear();
    lcd.print("LoRa init fail");
    while (1) {
      blink(1);
      delay(1000);
    }
  }
  LoRa.setSyncWord(0xFF);

  secureClient.setInsecure();
  connectWiFi();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("LoRa+WiFi OK");
  delay(1000);
}

void loop() {
  int packetLength = LoRa.parsePacket();
  if (packetLength) {
    latestRssi = LoRa.packetRssi();

    char buffer[64];
    int limit = 0;
    while (LoRa.available() && limit < packetLength && limit < 63) {
      buffer[limit++] = (char)LoRa.read();
      yield();
    }
    buffer[limit] = '\0';

    String data = String(buffer);
    Serial.print("Received: ");
    Serial.println(data);

    int i1 = data.indexOf(':');
    int i2 = data.indexOf(':', i1 + 1);

    if (i1 > 0 && i2 > i1) {
      latestTemp = data.substring(0, i1).toFloat();
      latestHum = data.substring(i1 + 1, i2).toFloat();
      latestMq = data.substring(i2 + 1).toInt();

      bool currentRelay1 = digitalRead(SPRINKLER);
      bool currentRelay2 = digitalRead(VENT_FAN);
      postSensorData(latestTemp, latestHum, latestMq, currentRelay1, currentRelay2);
    }
  }

  if (millis() - lastControlCheck >= CONTROL_REFRESH_MS) {
    lastControlCheck = millis();

    String controlMode = "ml";
    bool relay1On = false;
    bool relay2On = false;

    if (fetchControlMode(controlMode, relay1On, relay2On)) {
      if (controlMode == "manual") {
        applyRelayState(relay1On, relay2On);
        displayData(latestTemp, latestHum, latestMq, latestRssi, "MAN");
      } else {
        bool sprinklerOn = false;
        if (fetchMlDecision(latestTemp, latestHum, sprinklerOn)) {
          applyRelayState(sprinklerOn, sprinklerOn);
        }
        displayData(latestTemp, latestHum, latestMq, latestRssi, "ML ");
      }
    }
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.print("WiFi connected");
    Serial.println(WiFi.localIP());
  } else {
    lcd.print("WiFi failed");
  }
  delay(1000);
}

void blink(int cycle) {
  for (int i = 0; i < cycle; i++) {
    digitalWrite(LED_BUILTIN, LOW);
    delay(150);
    digitalWrite(LED_BUILTIN, HIGH);
    delay(150);
  }
}

void displayData(float temp, float hum, int mq, int rssi, const String& modeLabel) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("T:");
  lcd.print((int)temp);
  lcd.print(" H:");
  lcd.print((int)hum);

  lcd.setCursor(0, 1);
  lcd.print(modeLabel);
  lcd.print(" MQ:");
  lcd.print(mq);
  lcd.print(" R:");
  lcd.print(rssi);
}

void applyRelayState(bool relay1On, bool relay2On) {
  digitalWrite(SPRINKLER, relay1On ? HIGH : LOW);
  digitalWrite(VENT_FAN, relay2On ? HIGH : LOW);
}

bool postSensorData(float temp, float hum, int mq, bool relay1On, bool relay2On) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      return false;
    }
  }

  HTTPClient http;
  String url = String(API_BASE) + "/data";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument doc(256);
  doc["node_id"] = NODE_ID;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["ammonia"] = mq;
  doc["relay1_on"] = relay1On;
  doc["relay2_on"] = relay2On;
  doc["reading_source"] = "hardware";

  String body;
  serializeJson(doc, body);
  int httpCode = http.POST(body);
  Serial.printf("POST /data -> %d\n", httpCode);
  http.end();
  return httpCode > 0 && httpCode < 300;
}

bool fetchControlMode(String& controlMode, bool& relay1On, bool& relay2On) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      return false;
    }
  }

  HTTPClient http;
  String url = String(API_BASE) + "/control/state/" + NODE_ID;
  http.begin(secureClient, url);
  int httpCode = http.GET();
  if (httpCode <= 0) {
    Serial.printf("GET control -> %d\n", httpCode);
    http.end();
    return false;
  }

  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, http.getString());
  http.end();
  if (error) {
    Serial.println("Control JSON parse failed");
    return false;
  }

  controlMode = doc["control_mode"].as<String>();
  relay1On = doc["relay1_on"] | false;
  relay2On = doc["relay2_on"] | false;
  return true;
}

bool fetchMlDecision(float temp, float hum, bool& sprinklerOn) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      return false;
    }
  }

  HTTPClient http;
  String url = String(API_BASE) + "/ml/predict";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument requestDoc(128);
  requestDoc["temperature"] = temp;
  requestDoc["humidity"] = hum;
  String body;
  serializeJson(requestDoc, body);

  int httpCode = http.POST(body);
  if (httpCode <= 0) {
    Serial.printf("POST /ml/predict -> %d\n", httpCode);
    http.end();
    return false;
  }

  DynamicJsonDocument responseDoc(256);
  DeserializationError error = deserializeJson(responseDoc, http.getString());
  http.end();
  if (error) {
    Serial.println("ML JSON parse failed");
    return false;
  }

  sprinklerOn = responseDoc["sprinkler_on"] | false;
  return true;
}
