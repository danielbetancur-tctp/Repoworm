#include <Wire.h>
//
// ====== Configuración ======
#define BAUD_RATE     115200
#define PIN_TEMP_A0   A1
#define PIN_LLUVIA   5
#define PIN_UV A3
#define PIN_HUM_A1  A0
#define VREF_VOLTS    3.3
#define ADC_MAX       1023.0
#define FACTOR_CONVERSION    10.0 // factor de conversion de sensor analogo de temperatura

#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
Adafruit_BNO055 bno = Adafruit_BNO055(55);
const int HUM_ADC_MIN = 292;   // agua = máxima humedad
const int HUM_ADC_MAX = 531;   // aire = mínima humedad
#include <ModbusMaster.h>
#include <SoftwareSerial.h>

// --- CONFIGURACIÓN DE PINES ---
#define RE_DE 8      // Pin para controlar el flujo (DE y RE puenteados)
const int RO_PIN = 2; // Pin RO (Receiver Out) del módulo RS485
const int DI_PIN = 3; // Pin DI (Driver In) del módulo RS485
float uvIntensity =0;
SoftwareSerial mod(RO_PIN, DI_PIN);

// Trama de consulta Modbus RTU para leer 7 registros (H, T, EC, pH, N, P, K)
// 0x01: ID, 0x03: Función leer, 0x00 0x00: Registro inicial, 0x00 0x07: Cantidad, 0x04 0x08: CRC
const byte lecturaCompleta[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x07, 0x04, 0x08};
byte valoresRecibidos[25]; // Buffer para la respuesta del sensor

// ===== Límites parametrizables =====

// SoilCap: valores del Seesaw Soil Sensor según Adafruit
const int SOIL_MIN = 0;    // muy seco
const int SOIL_MAX = 1;   // muy húmedo
bool lluviaDigital = false;



int UV = A3;   // Salida del sensor
int REF3V3 = A1; // Conectar a los 3.3V del Arduino
// Temperatura
const float TEMP_IDEAL = 20.0;   // temperatura óptima en °C
const float TEMP_RANGE = 10.0;   // ±25°C → 0–50°C válido

// Pesos del índice de salud
const float W_SOIL    = 0.5;
const float W_TEMP    = 0.3;
const float W_HOTSPOT = 0.2;

float humed_an= 0;
float adc2= 0;
float humedad01=0;



// ====== Variables ======
float hotspotPct = 0;
float humedadPct = NAN;    
float tempC_SENS = 0;
float tempC_soil = NAN;
uint16_t soilCap = 0;
float salud = 0;



// Cálculo de variables (Unir 2 bytes por valor y aplicar divisores)
    float humedad     = 0;
    float temperatura = 0;
    int ec            = 0;
    float ph          = 0;
    int nitro         = 0;
    int fosfo         = 0;
    int potas         = 0;

float pesoCama_g = 0.0;
bool usarSensorPeso = false;

int uvLevel=0;

float bnoX=NAN, bnoY=NAN, bnoZ=NAN;

float linBiasX = -0.044760;
float linBiasY =  0.031240;
float linBiasZ = -0.346980;

float vibDeltaX = 0.0;
float vibDeltaY = 0.0;
float vibDeltaZ = 0.0;
float vibDeltaMag = 0.0;
float vibRmsCambio = 0.0;
unsigned long vibDuracionUs = 0;

bool hasSeesaw = false;
bool hasBNO = true;
bool hasHumI2C = false;

const unsigned long SAMPLE_MS = 1000;
unsigned long t0 = 0;

// ====== Prototipos ======
void adquisicion();
void ploteo();
bool i2cDeviceExists(uint8_t address);
void leerAceleracionLinealCalibrada(float &x, float &y, float &z);
void medirVibracionLineal20();
void imprimirResumenVibracion();
float leerPesoCama();

// Promedia 8 lecturas para mayor estabilidad
int averageAnalogRead(int pinToRead) {
  unsigned int runningValue = 0;
  for(int x = 0 ; x < 8 ; x++) runningValue += analogRead(pinToRead);
  return (runningValue / 8);
}

// Función map para números decimales
float mapfloat(float x, float in_min, float in_max, float out_min, float out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
// ====== SETUP ======
void setup() {
  Serial.begin(BAUD_RATE);
  Wire.begin();
  delay(200);

  Serial.println("millis,tempsensanalogo,tempSoil,soilCap,humedadI2C,hotspotPct,salud,bnoX,bnoY,bnoZ,estatus");
  pinMode(PIN_LLUVIA, INPUT);
  
  //pinMode(UV, INPUT);
  pinMode(REF3V3, INPUT);
  Serial.println("--- ML8511 Test Iniciado ---");
   mod.begin(4800);       // Velocidad confirmada para tu sensor
  
  pinMode(RE_DE, OUTPUT);
  digitalWrite(RE_DE, LOW); // Iniciar en modo recepción
  
  Serial.println("======================================");
  Serial.println("Iniciando Sensor NPK-PH-C-TH-S...");
  Serial.println("Configuración: 4800 Baudios");
  Serial.println("======================================");
 

  // Inicializar BNO055
  hasBNO = bno.begin();
  if (!hasBNO) {
    Serial.println("BNO055 NO encontrado → se ignorará.");
  } else {
    Serial.println("BNO055 OK.");
  }
}

// ====== LOOP ======
void loop() {

  if (Serial.available()) {
    float v = Serial.parseFloat();
    if (!isnan(v)) hotspotPct = constrain(v, 0, 100);
    while (Serial.available()) if (Serial.read()=='\n') break;
  }

  if (millis() - t0 >= SAMPLE_MS) {
    t0 = millis();
    adquisicion();
    ploteo();
  }

  uvLevel = analogRead(A3);
  int refLevel = averageAnalogRead(REF3V3);
  float outputVoltage = 3.3 / refLevel * uvLevel;

    // Convierte voltaje a intensidad (mW/cm^2)
  // El ML8511 va de 1.0V (0 mW/cm2) a 2.8V (15 mW/cm2)
  

  uvIntensity = mapfloat(outputVoltage, 0.99, 2.8, 0.0, 15.0);
  





  // 1. Limpia cualquier residuo de datos previos en el puerto
  while(mod.available()) mod.read();

  // 2. Cambiar a modo TRANSMISIÓN
  digitalWrite(RE_DE, HIGH);
  delay(10);
  mod.write(lecturaCompleta, sizeof(lecturaCompleta));
  mod.flush(); // Asegura que se envíen todos los bytes

  // 3. Cambiar a modo RECEPCIÓN
  digitalWrite(RE_DE, LOW);
  delay(10);

  // 4. Lee la respuesta y espera hasta 500ms
  int i = 0;
  unsigned long tiempoInicio = millis();
  while (millis() - tiempoInicio < 500 && i < 25) {
    if (mod.available()) {
      valoresRecibidos[i] = mod.read();
      i++;
    }
  }

  // 5. Procesar los datos que se reciben
  if (i > 0) {
    interpretarTrama(i);
  } else {
    Serial.println("Error: Sensor no responde. Revisa conexiones.");
  }
}

// =============================================================
//              FUNCIÓN DE DETECCIÓN I2C GENÉRICA
// =============================================================
bool i2cDeviceExists(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

// =============================================================
//                   FUNCIÓN DE ADQUISICIÓN
// =============================================================

bool leerLluviaDigital() {
  return digitalRead(PIN_LLUVIA);
}





float calcularSalud(
    float soilCap,        // valor del sensor
    float tempC,          // temperatura del LM35 o Seesaw
    float hotspotPct,     // porcentaje de lombrices
    int soilMin,          // límite inferior soilCap
    int soilMax,          // límite superior soilCap
    float tempIdeal,      // temperatura ideal
    float tempRange,      // tolerancia (±)
    float wSoil,          // peso hScore
    float wTemp,          // peso tScore
    float wHotspot        // peso hsScore
) {
    // ---- Humedad (soilCap) normalizada ----
    int cap = constrain(soilCap, soilMin, soilMax);
    float hScore = (cap - soilMin) / float(soilMax - soilMin);
    hScore = constrain(hScore, 0.0, 1.0);

    // ---- Temperatura normalizada ----
    float tScore = 1.0 - fabs(tempC - tempIdeal) / tempRange;
    tScore = constrain(tScore, 0.0, 1.0);

    // ---- Hotspot normalizado ----
    float hsScore = constrain(hotspotPct / 100.0, 0.0, 1.0);

    // ---- Cálculo final ----
    float salud = wSoil * hScore + wTemp * tScore + wHotspot * hsScore;
    return salud;
}



float mapHumedadInversa(int adcValue, int adcMin, int adcMax) {
    // Asegurar límites
    adcValue = constrain(adcValue, adcMin, adcMax);

    // Mapeo inverso: adcMin → 1.0, adcMax → 0.0
    float h = (float)(adcMax - adcValue) / (float)(adcMax - adcMin);

    // Garantizar rango 0–1
    return constrain(h, 0.0, 1.0);
}



void leerAceleracionLinealCalibrada(float &x, float &y, float &z) {
  imu::Vector<3> lin = bno.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL);

  x = lin.x() - linBiasX;
  y = lin.y() - linBiasY;
  z = lin.z() - linBiasZ;
}

void medirVibracionLineal20() {
  const int N = 20;

  float minX = 99999.0, maxX = -99999.0;
  float minY = 99999.0, maxY = -99999.0;
  float minZ = 99999.0, maxZ = -99999.0;
  float minMag = 99999.0, maxMag = -99999.0;

  float xPrev = 0.0, yPrev = 0.0, zPrev = 0.0;
  float sumaCambios = 0.0;

  unsigned long tInicio = micros();

  for (int i = 0; i < N; i++) {
    float x, y, z;
    leerAceleracionLinealCalibrada(x, y, z);

    float mag = sqrt(x * x + y * y + z * z);

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (mag < minMag) minMag = mag;
    if (mag > maxMag) maxMag = mag;

    if (i > 0) {
      float dx = x - xPrev;
      float dy = y - yPrev;
      float dz = z - zPrev;
      float cambio = sqrt(dx * dx + dy * dy + dz * dz);
      sumaCambios += cambio * cambio;
    }

    xPrev = x;
    yPrev = y;
    zPrev = z;
  }

  unsigned long tFin = micros();

  vibDeltaX = maxX - minX;
  vibDeltaY = maxY - minY;
  vibDeltaZ = maxZ - minZ;
  vibDeltaMag = maxMag - minMag;
  vibRmsCambio = sqrt(sumaCambios / (N - 1));
  vibDuracionUs = tFin - tInicio;
}

void imprimirResumenVibracion() {
  Serial.println(">>>> VIBRACION LINEAL 20 MUESTRAS <<<<");
  Serial.print("vibDeltaX: "); Serial.println(vibDeltaX, 6);
  Serial.print("vibDeltaY: "); Serial.println(vibDeltaY, 6);
  Serial.print("vibDeltaZ: "); Serial.println(vibDeltaZ, 6);
  Serial.print("vibDeltaMag: "); Serial.println(vibDeltaMag, 6);
  Serial.print("vibRmsCambio: "); Serial.println(vibRmsCambio, 6);
  Serial.print("vibDuracionUs: "); Serial.println(vibDuracionUs);
}

float leerPesoCama() {
  if (!usarSensorPeso) {
    return 0.0;
  }

  // Futuro sensor de peso/celda de carga:
  // retornar aquí el peso real de la cama en gramos.
  return 0.0;
}


void adquisicion() {



  lluviaDigital = leerLluviaDigital();


  // analog conversion
  int adc = analogRead(PIN_TEMP_A0);
  float volts = (adc / ADC_MAX)*5;
  tempC_SENS= (volts * 1000.0) / FACTOR_CONVERSION;





int adc2 = analogRead(A0);
humedad01 = mapHumedadInversa(adc2, HUM_ADC_MIN, HUM_ADC_MAX);

 
  // ----- BNO055 -----
  if (hasBNO) {
    sensors_event_t event;
    bno.getEvent(&event);
    bnoX = event.orientation.x;
    bnoY = event.orientation.y;
    bnoZ = event.orientation.z;
  } else {
    bnoX = bnoY = bnoZ = NAN;
  }
  
  

  
}

// =============================================================
//                   FUNCIÓN DE PLOTEO
// =============================================================
void ploteo() {

  const char* estatus =
    (salud >= 0.8) ? "OPTIMO" :
    (salud >= 0.6) ? "ACEPTABLE" :
    (salud >= 0.4) ? "ATENCION" : "ALERTA";
  Serial.print("TRAMA: ");
  Serial.print(millis());           Serial.print(",");
  Serial.print(lluviaDigital ? 1 : 0); Serial.print(",");
  Serial.print(salud,2);            Serial.print(",");
  Serial.print(bnoX,2);             Serial.print(",");
  Serial.print(bnoY,2);             Serial.print(",");
  Serial.print(bnoZ,2);             Serial.print(",");
  Serial.print(estatus); Serial.print(","); 
  Serial.print(humedad); Serial.print(",");
  Serial.print(temperatura); Serial.print(","); 
  Serial.print(uvIntensity);Serial.print(",");
  Serial.print(ec); Serial.print(",");
  Serial.print(ph); Serial.print(",");
  Serial.print(nitro); Serial.print(",");
  Serial.print(fosfo); Serial.print(",");
  Serial.print(potas); Serial.print(",");
  Serial.print(pesoCama_g, 2); Serial.print(";");
}




void interpretarTrama(int len) {
  int startIdx = -1;

  // Buscar la cabecera estándar Modbus (ID: 01, Función: 03)
  for (int j = 0; j < len - 5; j++) {
    if (valoresRecibidos[j] == 0x01 && valoresRecibidos[j+1] == 0x03) {
      startIdx = j;
      break;
    }
  }

  if (startIdx != -1) {
    // El desplazamiento (offset) salta el ID, Función y Conteo de bytes
    int offset = startIdx + 3;

    // Cálculo de variables (Unir 2 bytes por valor y aplicar divisores)
    humedad     = ((valoresRecibidos[offset] << 8)     | valoresRecibidos[offset + 1]) / 10.0;
    temperatura = ((valoresRecibidos[offset + 2] << 8) | valoresRecibidos[offset + 3]) / 10.0;
    ec            = (valoresRecibidos[offset + 4] << 8)  | valoresRecibidos[offset + 5];
    ph          = ((valoresRecibidos[offset + 6] << 8) | valoresRecibidos[offset + 7]) / 10.0;
    nitro         = (valoresRecibidos[offset + 8] << 8)  | valoresRecibidos[offset + 9];
    fosfo         = (valoresRecibidos[offset + 10] << 8) | valoresRecibidos[offset + 11];
    potas         = (valoresRecibidos[offset + 12] << 8) | valoresRecibidos[offset + 13];

    salud = calcularSalud(
    humedad,
    temperatura,
    hotspotPct,
    SOIL_MIN,
    SOIL_MAX,
    TEMP_IDEAL,
    TEMP_RANGE,
    W_SOIL,
    W_TEMP,
    W_HOTSPOT
);
    
    // --- SALIDA POR MONITOR SERIAL ---
    Serial.println("\n>>>> LECTURA DE SUELO <<<<");
    Serial.print("Humedad:      "); Serial.print(humedad);     Serial.println(" %");
    Serial.print("Temperatura:  "); Serial.print(temperatura); Serial.println(" °C");
    Serial.print("UV_intensity:  "); Serial.print(uvLevel); Serial.println(" _");
    Serial.print("Cond. Elec.:  "); Serial.print(ec);          Serial.println(" us/cm");
    Serial.print("pH:           "); Serial.print(ph);          Serial.println("");
    Serial.print("Nitrógeno(N): "); Serial.print(nitro);       Serial.println(" mg/kg");
    Serial.print("Fósforo (P):  "); Serial.print(fosfo);       Serial.println(" mg/kg");
    Serial.print("Potasio (K):  "); Serial.print(potas);       Serial.println(" mg/kg");
    Serial.print("Peso cama:     "); Serial.print(pesoCama_g, 2); Serial.println(" g");
Serial.print("orientacion X:  "); Serial.print(bnoX); Serial.println(" deg");
Serial.print("orientacion Y:  "); Serial.print(bnoY); Serial.println(" deg");
Serial.print("orientacion Z:  "); Serial.print(bnoZ); Serial.println(" deg");
    Serial.print("Lluvia binario:  "); Serial.print(lluviaDigital ? 1 : 0);       Serial.println(" bin");
    Serial.print("Salud:  "); Serial.print(salud);       Serial.println("_");
    Serial.println("--------------------------");
    delay(10000);
  } else {
    Serial.println("Error: Trama Modbus corrupta o incompleta.");
  }
}
