#include <WiFi.h>
#include <PubSubClient.h>

// =====================================================
// CONFIGURACIÓN WIFI
// =====================================================

const char* WIFI_SSID = "chak_IOT";
const char* WIFI_PASSWORD = "12345678";

// =====================================================
// CONFIGURACIÓN MQTT - JETSON NANO
// =====================================================

// Cambia esta IP por la IP real de la Jetson Nano.
// En la Jetson puedes verla con: hostname -I
const char* MQTT_BROKER = "192.168.0.103";
const int MQTT_PORT = 1883;

// Topic donde la Jetson estará escuchando
const char* MQTT_TOPIC = "vermicultura/modulo_1/trama_raw";

// Nombre del cliente MQTT
const char* MQTT_CLIENT_ID = "esp32_serial_bridge_01";

// =====================================================
// CONFIGURACIÓN SERIAL ARDUINO → ESP32
// =====================================================

// Debe coincidir con el baudrate del Arduino
const long ARDUINO_BAUD = 115200;

// Pines UART2 del ESP32
// Arduino TX -> ESP32 RX2 GPIO16
// ESP32 TX2 GPIO17 -> Arduino RX, solo si necesitas respuesta
#define ESP32_RX2 16
#define ESP32_TX2 17

HardwareSerial ArduinoSerial(2);

// =====================================================
// OBJETOS WIFI / MQTT
// =====================================================

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// =====================================================
// BUFFER DE TRAMA
// =====================================================

String lineaActual = "";
String bloqueTrama = "";

bool capturando = false;
bool tieneTrama = false;
bool tieneSalud = false;

// Seguridad para evitar que una trama dañada llene memoria
const int MAX_BLOQUE_SIZE = 1800;


// =====================================================
// CONEXIÓN WIFI
// =====================================================

void conectarWiFi() {
  Serial.println();
  Serial.print("Conectando a WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi conectado");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}


// =====================================================
// CONEXIÓN MQTT
// =====================================================

void conectarMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando a MQTT en ");
    Serial.print(MQTT_BROKER);
    Serial.print(":");
    Serial.println(MQTT_PORT);

    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("MQTT conectado");
    } else {
      Serial.print("Error MQTT, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" | Reintentando en 3 segundos...");
      delay(3000);
    }
  }
}


// =====================================================
// PUBLICAR TRAMA COMPLETA
// =====================================================

void publicarTrama(String payload) {
  if (!mqttClient.connected()) {
    conectarMQTT();
  }

  mqttClient.loop();

  Serial.println();
  Serial.println("========== PUBLICANDO TRAMA POR MQTT ==========");
  Serial.println(payload);
  Serial.println("===============================================");

  bool ok = mqttClient.publish(MQTT_TOPIC, payload.c_str());

  if (ok) {
    Serial.println("Trama publicada correctamente por MQTT");
  } else {
    Serial.println("Error publicando trama por MQTT");
  }
}


// =====================================================
// PROCESAR LÍNEA RECIBIDA DESDE ARDUINO
// =====================================================

void procesarLinea(String linea) {
  linea.trim();

  if (linea.length() == 0) {
    return;
  }

  Serial.print("[ARDUINO RX] ");
  Serial.println(linea);

  // Caso 1:
  // El Arduino envía separadores tipo:
  // --------------------------
  if (linea.startsWith("--------------------------")) {

    // Si todavía no estamos capturando, este es el inicio del bloque
    if (!capturando) {
      capturando = true;
      tieneTrama = false;
      tieneSalud = false;
      bloqueTrama = linea + "\n";
      return;
    }

    // Si ya veníamos capturando y ya tenemos TRAMA + Salud,
    // este separador se interpreta como cierre del bloque
    if (capturando && tieneTrama && tieneSalud) {
      bloqueTrama += linea + "\n";
      publicarTrama(bloqueTrama);

      capturando = false;
      tieneTrama = false;
      tieneSalud = false;
      bloqueTrama = "";
      return;
    }

    // Si llega otro separador pero no se completó la trama,
    // se reinicia captura para evitar datos corruptos.
    bloqueTrama = linea + "\n";
    tieneTrama = false;
    tieneSalud = false;
    capturando = true;
    return;
  }

  // Caso 2:
  // El Arduino NO envía separador inicial y empieza directamente con TRAMA:
  if (linea.startsWith("TRAMA:")) {
    if (!capturando) {
      capturando = true;
      bloqueTrama = "";
      tieneSalud = false;
    }

    tieneTrama = true;
  }

  // Si no estamos capturando, ignoramos líneas sueltas
  if (!capturando) {
    return;
  }

  // Agregar línea al bloque
  bloqueTrama += linea + "\n";

  // Detectar última línea del bloque
  if (linea.startsWith("Salud:")) {
    tieneSalud = true;

    // Si el Arduino no manda separador final, publicamos al llegar Salud
    // Si sí manda separador final, el código publicará al recibirlo.
    // Para evitar doble publicación, solo se publica aquí si el bloque
    // no empezó con separador.
    if (!bloqueTrama.startsWith("--------------------------")) {
      publicarTrama(bloqueTrama);

      capturando = false;
      tieneTrama = false;
      tieneSalud = false;
      bloqueTrama = "";
      return;
    }
  }

  // Protección por tamaño máximo
  if (bloqueTrama.length() > MAX_BLOQUE_SIZE) {
    Serial.println("Advertencia: bloque demasiado grande. Reiniciando captura.");
    capturando = false;
    tieneTrama = false;
    tieneSalud = false;
    bloqueTrama = "";
  }
}


// =====================================================
// LEER SERIAL DEL ARDUINO
// =====================================================

void leerSerialArduino() {
  while (ArduinoSerial.available()) {
    char c = ArduinoSerial.read();

    if (c == '\n') {
      procesarLinea(lineaActual);
      lineaActual = "";
    } else if (c != '\r') {
      lineaActual += c;
    }

    // Protección por línea demasiado larga
    if (lineaActual.length() > 300) {
      Serial.println("Advertencia: línea serial demasiado larga. Reiniciando línea.");
      lineaActual = "";
    }
  }
}


// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 Serial → MQTT Bridge");
  Serial.println("Recibiendo trama desde Arduino y enviando a Jetson Nano");

  // Serial2 para recibir desde Arduino
  ArduinoSerial.begin(ARDUINO_BAUD, SERIAL_8N1, ESP32_RX2, ESP32_TX2);

  conectarWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  // Muy importante:
  // La trama completa es grande, entonces se aumenta el buffer MQTT.
  mqttClient.setBufferSize(2048);

  conectarMQTT();
}


// =====================================================
// LOOP PRINCIPAL
// =====================================================

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  if (!mqttClient.connected()) {
    conectarMQTT();
  }

  mqttClient.loop();

  leerSerialArduino();
}