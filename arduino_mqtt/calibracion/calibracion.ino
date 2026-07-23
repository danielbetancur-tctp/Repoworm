#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>

#define BAUD_RATE 115200

Adafruit_BNO055 bno = Adafruit_BNO055(55);

const int N_LINEAR = 500;
const int N_POSE = 50;

const int DELAY_LINEAR_MS = 5;
const int DELAY_POSE_MS = 5;

const float G_REF = 9.80665;

float linBiasX = 0.0;
float linBiasY = 0.0;
float linBiasZ = 0.0;

float accPosX[3] = {0, 0, 0};
float accNegX[3] = {0, 0, 0};
float accPosY[3] = {0, 0, 0};
float accNegY[3] = {0, 0, 0};
float accPosZ[3] = {0, 0, 0};
float accNegZ[3] = {0, 0, 0};

bool capPosX = false;
bool capNegX = false;
bool capPosY = false;
bool capNegY = false;
bool capPosZ = false;
bool capNegZ = false;

float accBiasX = 0.0;
float accBiasY = 0.0;
float accBiasZ = 0.0;

float accScaleX = 1.0;
float accScaleY = 1.0;
float accScaleZ = 1.0;

void imprimirMenu();
void imprimirCalibracionInterna();
void calibrarAceleracionLinealReposo();
void capturarPose(const char* nombrePose, float destino[3], bool &flag);
void calcularBiasEscalaAcelerometro();
void imprimirParametrosParaCopiar();
void leerVectorAccel(float &x, float &y, float &z);
void leerVectorLinearAccel(float &x, float &y, float &z);
void imprimirLecturaActual();

void setup() {
  Serial.begin(BAUD_RATE);
  Wire.begin();
  delay(500);

  if (!bno.begin()) {
    Serial.println("ERROR: BNO055 no detectado");
    while (1);
  }

  delay(1000);
  bno.setExtCrystalUse(true);

  Serial.println();
  Serial.println("BNO055 listo para calibracion");
  imprimirMenu();
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();

    if (cmd == 'm') imprimirMenu();
    if (cmd == 'c') imprimirCalibracionInterna();
    if (cmd == 'l') calibrarAceleracionLinealReposo();

    if (cmd == '1') capturarPose("+X", accPosX, capPosX);
    if (cmd == '2') capturarPose("-X", accNegX, capNegX);
    if (cmd == '3') capturarPose("+Y", accPosY, capPosY);
    if (cmd == '4') capturarPose("-Y", accNegY, capNegY);
    if (cmd == '5') capturarPose("+Z", accPosZ, capPosZ);
    if (cmd == '6') capturarPose("-Z", accNegZ, capNegZ);

    if (cmd == 'b') calcularBiasEscalaAcelerometro();
    if (cmd == 'p') imprimirParametrosParaCopiar();
    if (cmd == 'r') imprimirLecturaActual();
  }
}

void imprimirMenu() {
  Serial.println();
  Serial.println("====== MENU CALIBRACION BNO055 ======");
  Serial.println("m = mostrar menu");
  Serial.println("c = ver calibracion interna BNO055");
  Serial.println("l = calcular bias de aceleracion lineal en reposo");
  Serial.println("1 = capturar posicion +X");
  Serial.println("2 = capturar posicion -X");
  Serial.println("3 = capturar posicion +Y");
  Serial.println("4 = capturar posicion -Y");
  Serial.println("5 = capturar posicion +Z");
  Serial.println("6 = capturar posicion -Z");
  Serial.println("b = calcular bias y escala del acelerometro fisico");
  Serial.println("p = imprimir parametros para copiar");
  Serial.println("r = imprimir lectura actual");
  Serial.println("=====================================");
  Serial.println();
}

void imprimirCalibracionInterna() {
  uint8_t sys, gyro, accel, mag;
  bno.getCalibration(&sys, &gyro, &accel, &mag);

  Serial.println();
  Serial.println("CALIBRACION_INTERNA_BNO055");
  Serial.print("sys: "); Serial.println(sys);
  Serial.print("gyro: "); Serial.println(gyro);
  Serial.print("accel: "); Serial.println(accel);
  Serial.print("mag: "); Serial.println(mag);
  Serial.println("Valor ideal: 3 en cada variable");
}

void calibrarAceleracionLinealReposo() {
  double sx = 0.0;
  double sy = 0.0;
  double sz = 0.0;

  Serial.println();
  Serial.println("CALIBRANDO_ACELERACION_LINEAL_REPOSO");
  Serial.println("Dejar el sensor completamente quieto...");
  delay(2000);

  for (int i = 0; i < N_LINEAR; i++) {
    float x, y, z;
    leerVectorLinearAccel(x, y, z);

    sx += x;
    sy += y;
    sz += z;

    delay(DELAY_LINEAR_MS);
  }

  linBiasX = sx / N_LINEAR;
  linBiasY = sy / N_LINEAR;
  linBiasZ = sz / N_LINEAR;

  Serial.println("BIAS_LINEAL_CALCULADO");
  Serial.print("linBiasX = "); Serial.println(linBiasX, 6);
  Serial.print("linBiasY = "); Serial.println(linBiasY, 6);
  Serial.print("linBiasZ = "); Serial.println(linBiasZ, 6);
}

void capturarPose(const char* nombrePose, float destino[3], bool &flag) {
  double sx = 0.0;
  double sy = 0.0;
  double sz = 0.0;

  Serial.println();
  Serial.print("CAPTURANDO_POSE_");
  Serial.println(nombrePose);
  Serial.println("Dejar el sensor quieto.");
  delay(2000);

  for (int i = 0; i < N_POSE; i++) {
    float x, y, z;
    leerVectorAccel(x, y, z);

    sx += x;
    sy += y;
    sz += z;

    if (i % 25 == 0) {
      Serial.print(".");
    }

    delay(DELAY_POSE_MS);
  }

  destino[0] = sx / N_POSE;
  destino[1] = sy / N_POSE;
  destino[2] = sz / N_POSE;

  flag = true;

  Serial.println();
  Serial.print("POSE ");
  Serial.print(nombrePose);
  Serial.println(" CAPTURADA");

  Serial.print("ax_mean = "); Serial.println(destino[0], 6);
  Serial.print("ay_mean = "); Serial.println(destino[1], 6);
  Serial.print("az_mean = "); Serial.println(destino[2], 6);
}

void calcularBiasEscalaAcelerometro() {
  if (!capPosX || !capNegX || !capPosY || !capNegY || !capPosZ || !capNegZ) {
    Serial.println();
    Serial.println("ERROR: faltan posiciones por capturar");
    Serial.println("Debes capturar +X, -X, +Y, -Y, +Z y -Z antes de calcular.");
    return;
  }

  accBiasX = (accPosX[0] + accNegX[0]) / 2.0;
  accBiasY = (accPosY[1] + accNegY[1]) / 2.0;
  accBiasZ = (accPosZ[2] + accNegZ[2]) / 2.0;

  accScaleX = (2.0 * G_REF) / (accPosX[0] - accNegX[0]);
  accScaleY = (2.0 * G_REF) / (accPosY[1] - accNegY[1]);
  accScaleZ = (2.0 * G_REF) / (accPosZ[2] - accNegZ[2]);

  Serial.println();
  Serial.println("BIAS_ESCALA_ACELEROMETRO_CALCULADOS");
  Serial.print("accBiasX = "); Serial.println(accBiasX, 6);
  Serial.print("accBiasY = "); Serial.println(accBiasY, 6);
  Serial.print("accBiasZ = "); Serial.println(accBiasZ, 6);

  Serial.print("accScaleX = "); Serial.println(accScaleX, 6);
  Serial.print("accScaleY = "); Serial.println(accScaleY, 6);
  Serial.print("accScaleZ = "); Serial.println(accScaleZ, 6);
}

void imprimirParametrosParaCopiar() {
  Serial.println();
  Serial.println("===== COPIAR EN CODIGO PRINCIPAL =====");

  Serial.print("float linBiasX = "); Serial.print(linBiasX, 6); Serial.println(";");
  Serial.print("float linBiasY = "); Serial.print(linBiasY, 6); Serial.println(";");
  Serial.print("float linBiasZ = "); Serial.print(linBiasZ, 6); Serial.println(";");

  Serial.println();

  Serial.print("float accBiasX = "); Serial.print(accBiasX, 6); Serial.println(";");
  Serial.print("float accBiasY = "); Serial.print(accBiasY, 6); Serial.println(";");
  Serial.print("float accBiasZ = "); Serial.print(accBiasZ, 6); Serial.println(";");

  Serial.println();

  Serial.print("float accScaleX = "); Serial.print(accScaleX, 6); Serial.println(";");
  Serial.print("float accScaleY = "); Serial.print(accScaleY, 6); Serial.println(";");
  Serial.print("float accScaleZ = "); Serial.print(accScaleZ, 6); Serial.println(";");

  Serial.println("======================================");
}

void leerVectorAccel(float &x, float &y, float &z) {
  sensors_event_t acc;
  bno.getEvent(&acc, Adafruit_BNO055::VECTOR_ACCELEROMETER);

  x = acc.acceleration.x;
  y = acc.acceleration.y;
  z = acc.acceleration.z;
}

void leerVectorLinearAccel(float &x, float &y, float &z) {
  sensors_event_t lin;
  bno.getEvent(&lin, Adafruit_BNO055::VECTOR_LINEARACCEL);

  x = lin.acceleration.x;
  y = lin.acceleration.y;
  z = lin.acceleration.z;
}

void imprimirLecturaActual() {
  float ax, ay, az;
  float lx, ly, lz;

  leerVectorAccel(ax, ay, az);
  leerVectorLinearAccel(lx, ly, lz);

  float lxCal = lx - linBiasX;
  float lyCal = ly - linBiasY;
  float lzCal = lz - linBiasZ;

  float axCal = (ax - accBiasX) * accScaleX;
  float ayCal = (ay - accBiasY) * accScaleY;
  float azCal = (az - accBiasZ) * accScaleZ;

  Serial.println();
  Serial.println("LECTURA_ACTUAL");

  Serial.print("ACC_RAW_X: "); Serial.println(ax, 6);
  Serial.print("ACC_RAW_Y: "); Serial.println(ay, 6);
  Serial.print("ACC_RAW_Z: "); Serial.println(az, 6);

  Serial.print("ACC_CAL_X: "); Serial.println(axCal, 6);
  Serial.print("ACC_CAL_Y: "); Serial.println(ayCal, 6);
  Serial.print("ACC_CAL_Z: "); Serial.println(azCal, 6);

  Serial.print("LIN_RAW_X: "); Serial.println(lx, 6);
  Serial.print("LIN_RAW_Y: "); Serial.println(ly, 6);
  Serial.print("LIN_RAW_Z: "); Serial.println(lz, 6);

  Serial.print("LIN_CAL_X: "); Serial.println(lxCal, 6);
  Serial.print("LIN_CAL_Y: "); Serial.println(lyCal, 6);
  Serial.print("LIN_CAL_Z: "); Serial.println(lzCal, 6);
}