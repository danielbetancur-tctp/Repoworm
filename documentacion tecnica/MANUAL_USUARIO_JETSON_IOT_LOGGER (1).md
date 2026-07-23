# Manual de usuario y documentación técnica
## Sistema de adquisición IoT con Jetson Nano, Arduino, Flask y Excel

**Versión:** 1.0  
**Equipo objetivo:** Jetson Nano  
**Función principal:** recibir tramas de datos desde Arduino por puerto serial, procesarlas y almacenarlas automáticamente en un archivo Excel.  
**Aplicación:** adquisición de variables de suelo, acelerometría, lluvia, salud del sistema y datos experimentales.

---

## 1. Descripción general del sistema

Este sistema permite que una **Jetson Nano** funcione como gateway IoT. La Jetson recibe una trama serial enviada por un Arduino o microcontrolador, procesa los datos, los organiza con la estructura del archivo **Anexo 1** y los almacena en un archivo Excel.

La aplicación se ejecuta con **Flask**, por lo que también permite revisar el estado del sistema desde un navegador y descargar el archivo Excel generado.

Flujo general:

```text
Arduino / Microcontrolador
        ↓
Puerto serial USB
        ↓
Jetson Nano
        ↓
Aplicación Python + Flask
        ↓
Procesamiento de trama
        ↓
Archivo Excel
        ↓
Consulta o descarga desde navegador
```

---

## 2. Formato de la trama recibida

La trama esperada tiene la siguiente estructura:

```text
TRAMA: 33897,1,0.58,0.06,0.88,34.31,ATENCION,100.00,27.40,17.54,6118,7.20,1238,1999,1999;
```

Interpretación de campos:

| Posición | Campo | Ejemplo | Descripción |
|---:|---|---:|---|
| 1 | trama_id | 33897 | Identificador de la trama |
| 2 | lluvia_binario | 1 | Estado binario de lluvia |
| 3 | salud | 0.58 | Índice de salud |
| 4 | acel_x_g | 0.06 | Aceleración en eje X |
| 5 | acel_y_g | 0.88 | Aceleración en eje Y |
| 6 | acel_z_g | 34.31 | Aceleración en eje Z |
| 7 | estado | ATENCION | Estado del sistema |
| 8 | humedad_pct | 100.00 | Humedad del suelo |
| 9 | temperatura_c | 27.40 | Temperatura |
| 10 | uv_intensity | 17.54 | Valor UV recibido en la trama |
| 11 | conductividad_us_cm | 6118 | Conductividad eléctrica |
| 12 | ph | 7.20 | pH |
| 13 | nitrogeno_mg_kg | 1238 | Nitrógeno |
| 14 | fosforo_mg_kg | 1999 | Fósforo |
| 15 | potasio_mg_kg | 1999 | Potasio |

Cuando el microcontrolador envía además el bloque detallado, la aplicación puede usar esos valores para completar o actualizar los datos antes de escribir en Excel:

```text
>>>> LECTURA DE SUELO <<<<
Humedad:      100.00 %
Temperatura:  27.40 °C
UV_intensity:  207 _
Cond. Elec.:  6118 us/cm
pH:           7.20
Nitrógeno(N): 1238 mg/kg
Fósforo (P):  1999 mg/kg
Potasio (K):  1999 mg/kg
acelerometro X:  0.06 g
acelerometro Y:  0.88 g
acelerometro Z:  34.31 g
Lluvia binario:  1 bin
Salud:  0.58_
```

---

## 3. Requisitos del sistema

### 3.1. Hardware requerido

- Jetson Nano.
- Arduino, ESP32 u otro microcontrolador que envíe datos por serial.
- Cable USB de datos.
- Conexión WiFi o Ethernet en la Jetson.
- MicroSD con sistema operativo de Jetson instalado.
- Fuente de alimentación estable para la Jetson.

### 3.2. Software requerido

- Python 3.
- Entorno virtual `venv`.
- Flask.
- PySerial.
- OpenPyXL.
- Navegador web para consultar la interfaz.

---

## 4. Preparación de la carpeta del proyecto

Antes de ejecutar cualquier comando, el usuario debe ubicarse en la carpeta donde se encuentra el proyecto.

Ejemplo recomendado:

```bash
cd ~
mkdir -p jetson_iot_logger
cd jetson_iot_logger
```

Si el proyecto ya existe en otra ruta, se debe entrar a esa carpeta con `cd`.

Ejemplo:

```bash
cd /home/jetson/jetson_iot_logger
```

O:

```bash
cd ~/Desktop/jetson_iot_logger
```

Para verificar que se está en la carpeta correcta:

```bash
pwd
ls
```

Dentro de la carpeta deberían estar, como mínimo, archivos similares a:

```text
app.py
requirements.txt
Anexo_1_datos_iot.xlsx
```

---

## 5. Instalación del entorno virtual en Jetson Nano

### 5.1. Crear el entorno virtual

Desde la carpeta del proyecto:

```bash
python3 -m venv .venv
```

Si se está usando Python 3.8:

```bash
python3.8 -m venv .venv
```

### 5.2. Activar el entorno virtual

Cada vez que se vaya a ejecutar la aplicación, se debe activar el entorno virtual:

```bash
source .venv/bin/activate
```

Cuando el entorno esté activo, la terminal debe verse similar a esto:

```text
(.venv) jetson@jetson-nano:~/jetson_iot_logger$
```

### 5.3. Actualizar herramientas base

Con el entorno virtual activo:

```bash
python -m pip install --upgrade pip setuptools wheel
```

### 5.4. Instalar dependencias

Si se tiene un archivo `requirements.txt`:

```bash
python -m pip install -r requirements.txt
```

También se pueden instalar manualmente:

```bash
python -m pip install flask pyserial openpyxl
```

En caso de error con `MarkupSafe`, usar:

```bash
python -m pip install MarkupSafe
```

Para Jetson Nano con Python antiguo, especialmente Python 3.6, usar versiones compatibles:

```bash
python -m pip install "MarkupSafe==2.0.1"
python -m pip install "Jinja2==3.0.3" "Flask==2.0.3" "Werkzeug==2.0.3" "click==8.0.4" "itsdangerous==2.0.1"
python -m pip install pyserial openpyxl
```

---

## 6. Identificación del puerto serial del Arduino

Conectar el Arduino a la Jetson mediante USB.

Luego ejecutar:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Los puertos más comunes son:

```text
/dev/ttyUSB0
/dev/ttyACM0
```

Referencia práctica:

```text
Arduino UNO original:     /dev/ttyACM0
Arduino Mega original:    /dev/ttyACM0
Arduino Nano CH340:       /dev/ttyUSB0
ESP32:                    /dev/ttyUSB0
```

También se puede revisar el log del sistema:

```bash
dmesg | tail -30
```

Ejemplos de salida:

```text
cdc_acm 1-2:1.0: ttyACM0: USB ACM device
```

O:

```text
ch341-uart converter now attached to ttyUSB0
```

El puerto detectado debe coincidir con la variable `SERIAL_PORT` dentro del archivo `app.py`.

Ejemplo:

```python
SERIAL_PORT = "/dev/ttyACM0"
```

O:

```python
SERIAL_PORT = "/dev/ttyUSB0"
```

---

## 7. Configuración de permisos del puerto serial en Jetson

Si al ejecutar el sistema aparece un error como:

```text
Permission denied: '/dev/ttyACM0'
```

significa que el usuario no tiene permisos para leer el puerto serial.

### 7.1. Verificar permisos del puerto

```bash
ls -l /dev/ttyACM0
```

O, si el puerto es USB:

```bash
ls -l /dev/ttyUSB0
```

La salida normalmente será similar a:

```text
crw-rw---- 1 root dialout ... /dev/ttyACM0
```

El grupo importante es:

```text
dialout
```

### 7.2. Agregar el usuario al grupo dialout

Ejecutar:

```bash
sudo usermod -a -G dialout $USER
```

Luego reiniciar la Jetson:

```bash
sudo reboot
```

Después del reinicio, volver a entrar a la carpeta del proyecto:

```bash
cd ~/jetson_iot_logger
```

Activar el entorno virtual:

```bash
source .venv/bin/activate
```

Y ejecutar nuevamente la aplicación:

```bash
python app.py
```

### 7.3. Verificar que el usuario quedó en el grupo dialout

Después de reiniciar:

```bash
groups
```

La salida debe incluir `dialout`, por ejemplo:

```text
jetson adm dialout sudo video audio ...
```

### 7.4. Prueba temporal de permisos

Si se quiere probar rápidamente sin reiniciar, se puede usar:

```bash
sudo chmod 666 /dev/ttyACM0
```

O:

```bash
sudo chmod 666 /dev/ttyUSB0
```

Luego ejecutar:

```bash
python app.py
```

Esta solución es temporal. Al desconectar el Arduino o reiniciar la Jetson, el permiso puede perderse. La solución recomendada es agregar el usuario al grupo `dialout`.

### 7.5. Prueba con sudo

Solo para diagnosticar:

```bash
sudo python app.py
```

Si con `sudo` funciona, pero sin `sudo` no funciona, entonces el problema es de permisos. La solución correcta sigue siendo:

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

---

## 8. Configuración principal del archivo app.py

Dentro del archivo `app.py` se deben revisar estas variables:

```python
SERIAL_PORT = "/dev/ttyACM0"
BAUD_RATE = 115200

EXCEL_PATH = "Anexo_1_datos_iot.xlsx"
SHEET_NAME = "Datos extraidos"
```

Si el Arduino aparece como `/dev/ttyUSB0`, cambiar:

```python
SERIAL_PORT = "/dev/ttyACM0"
```

por:

```python
SERIAL_PORT = "/dev/ttyUSB0"
```

También se pueden configurar los datos experimentales que no llegan en la trama:

```python
LOMBRICES_AGREGADAS_G = 50
PESO_CAMA_5CM_G = 1222
PESO_CAMA_10CM_G = 1610
PESO_LOMBRICES_INYECTADAS_G = 50
```

Estos valores deben ajustarse según el bloque experimental que se esté midiendo.

---

## 9. Ejecución de la aplicación

Desde la carpeta del proyecto:

```bash
cd ~/jetson_iot_logger
```

Activar el entorno virtual:

```bash
source .venv/bin/activate
```

Ejecutar Flask:

```bash
python app.py
```

La aplicación debe mostrar mensajes similares a:

```text
[OK] Excel existente: Anexo_1_datos_iot.xlsx
[SERIAL] Conectando a /dev/ttyACM0 @ 115200...
[SERIAL] Conectado. Leyendo datos...
```

Cuando llegue una trama válida, se debe ver algo similar:

```text
[RX] TRAMA: 33897,1,0.58,0.06,0.88,34.31,ATENCION,100.00,27.40,17.54,6118,7.20,1238,1999,1999;
[GUARDADO] Replica 1 | Trama 33897 | Estado ATENCION
```

---

## 10. Acceso a la interfaz web

La aplicación Flask queda disponible en el puerto `5000`.

Para conocer la IP de la Jetson:

```bash
hostname -I
```

Ejemplo de salida:

```text
192.168.1.45
```

Desde un navegador en la misma red, abrir:

```text
http://192.168.1.45:5000
```

Desde la propia Jetson también se puede abrir:

```text
http://localhost:5000
```

---

## 11. Descarga del archivo Excel

Desde el navegador:

```text
http://IP_DE_LA_JETSON:5000/download
```

Ejemplo:

```text
http://192.168.1.45:5000/download
```

Esto descargará el archivo Excel actualizado.

---

## 12. Endpoint de estado

La aplicación incluye un endpoint para consultar el estado:

```text
http://IP_DE_LA_JETSON:5000/status
```

Ejemplo:

```text
http://192.168.1.45:5000/status
```

Devuelve información como:

```json
{
  "status": "ok",
  "excel_path": "Anexo_1_datos_iot.xlsx",
  "sheet_name": "Datos extraidos",
  "serial_port": "/dev/ttyACM0",
  "baud_rate": 115200
}
```

---

## 13. Prueba sin Arduino

La aplicación permite probar una trama por HTTP.

Desde la Jetson:

```bash
curl -X POST http://localhost:5000/api/trama \
-H "Content-Type: application/json" \
-d '{"trama":"TRAMA: 33897,1,0.58,0.06,0.88,34.31,ATENCION,100.00,27.40,17.54,6118,7.20,1238,1999,1999;"}'
```

Si todo está correcto, la trama se guardará en el Excel.

---

## 14. Uso con OneDrive

Si se desea que el Excel quede en una carpeta sincronizada con OneDrive, se recomienda montar OneDrive con `rclone`.

### 14.1. Instalar rclone

```bash
sudo apt update
sudo apt install -y rclone
```

### 14.2. Configurar OneDrive

```bash
rclone config
```

Durante la configuración, crear un remoto llamado, por ejemplo:

```text
onedrive
```

### 14.3. Crear carpeta de montaje

```bash
mkdir -p ~/OneDriveIoT
```

### 14.4. Montar OneDrive

```bash
rclone mount onedrive:IoT ~/OneDriveIoT --daemon
```

### 14.5. Cambiar ruta del Excel en app.py

Dentro de `app.py`:

```python
EXCEL_PATH = "/home/jetson/OneDriveIoT/Anexo_1_datos_iot.xlsx"
```

Ajustar `/home/jetson/` según el usuario real de la Jetson.

Para conocer el usuario actual:

```bash
whoami
```

---

## 15. Ejecución automática al iniciar la Jetson

Para que la aplicación se ejecute automáticamente al encender la Jetson, se puede crear un servicio con `systemd`.

### 15.1. Crear archivo del servicio

```bash
sudo nano /etc/systemd/system/jetson-iot-logger.service
```

Pegar el siguiente contenido, ajustando el usuario y la ruta del proyecto:

```ini
[Unit]
Description=Jetson IoT Logger Flask Service
After=network.target

[Service]
User=jetson
WorkingDirectory=/home/jetson/jetson_iot_logger
ExecStart=/home/jetson/jetson_iot_logger/.venv/bin/python /home/jetson/jetson_iot_logger/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Guardar con:

```text
CTRL + O
ENTER
CTRL + X
```

### 15.2. Recargar systemd

```bash
sudo systemctl daemon-reload
```

### 15.3. Habilitar el servicio

```bash
sudo systemctl enable jetson-iot-logger.service
```

### 15.4. Iniciar el servicio

```bash
sudo systemctl start jetson-iot-logger.service
```

### 15.5. Verificar estado

```bash
sudo systemctl status jetson-iot-logger.service
```

### 15.6. Ver logs en tiempo real

```bash
journalctl -u jetson-iot-logger.service -f
```

### 15.7. Detener el servicio

```bash
sudo systemctl stop jetson-iot-logger.service
```

---

## 16. Solución de problemas frecuentes

### 16.1. Error: Permission denied en `/dev/ttyACM0`

Causa probable: el usuario no pertenece al grupo `dialout`.

Solución:

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

Luego:

```bash
cd ~/jetson_iot_logger
source .venv/bin/activate
python app.py
```

### 16.2. Error: No such file or directory `/dev/ttyACM0`

Causa probable: el Arduino no está conectado o cambió de puerto.

Solución:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Actualizar `SERIAL_PORT` en `app.py` con el puerto correcto.

### 16.3. Error: No module named flask

Causa probable: el entorno virtual no está activo o faltan dependencias.

Solución:

```bash
cd ~/jetson_iot_logger
source .venv/bin/activate
python -m pip install flask pyserial openpyxl
```

### 16.4. Error: No module named markupsafe

Solución general:

```bash
source .venv/bin/activate
python -m pip install MarkupSafe
```

En Python antiguo:

```bash
python -m pip install "MarkupSafe==2.0.1"
python -m pip install "Jinja2==3.0.3" "Flask==2.0.3" "Werkzeug==2.0.3" "click==8.0.4" "itsdangerous==2.0.1"
```

### 16.5. El Excel no se actualiza

Verificar:

```bash
ls -l
```

Confirmar que existe:

```text
Anexo_1_datos_iot.xlsx
```

Revisar que la aplicación esté recibiendo tramas:

```text
[RX] TRAMA: ...
```

Si no aparecen tramas, revisar:

- Cable USB.
- Puerto serial.
- Velocidad `BAUD_RATE`.
- Que el Arduino esté enviando datos.
- Que el monitor serial del Arduino IDE no esté abierto en otro equipo.

### 16.6. La página web no abre desde otro computador

Verificar IP:

```bash
hostname -I
```

Confirmar que Flask está escuchando en todas las interfaces:

```python
app.run(host="0.0.0.0", port=5000, debug=False)
```

Probar desde la Jetson:

```bash
curl http://localhost:5000/status
```

Si funciona localmente pero no desde otro equipo, revisar que ambos estén en la misma red.

---

## 17. Recomendaciones de operación

1. Encender la Jetson y conectar el Arduino.
2. Entrar a la carpeta del proyecto:

```bash
cd ~/jetson_iot_logger
```

3. Activar el entorno virtual:

```bash
source .venv/bin/activate
```

4. Ejecutar la aplicación:

```bash
python app.py
```

5. Abrir la interfaz web:

```text
http://IP_DE_LA_JETSON:5000
```

6. Confirmar que las tramas estén llegando.
7. Descargar el Excel desde:

```text
http://IP_DE_LA_JETSON:5000/download
```

---

## 18. Comandos rápidos

Entrar al proyecto:

```bash
cd ~/jetson_iot_logger
```

Activar entorno:

```bash
source .venv/bin/activate
```

Instalar dependencias:

```bash
python -m pip install flask pyserial openpyxl
```

Detectar puerto:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Dar permisos permanentes:

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

Ejecutar aplicación:

```bash
python app.py
```

Ver IP de la Jetson:

```bash
hostname -I
```

Abrir en navegador:

```text
http://IP_DE_LA_JETSON:5000
```

Descargar Excel:

```text
http://IP_DE_LA_JETSON:5000/download
```

---

## 19. Consideraciones finales

El sistema está diseñado para trabajar como un logger IoT continuo. Cada vez que recibe una trama válida, la procesa y la almacena en el Excel. La Jetson actúa como gateway local, permitiendo adquirir datos por serial y consultarlos mediante una interfaz web sencilla.

Para un uso estable en campo, se recomienda:

- Usar una fuente de alimentación confiable para la Jetson.
- Evitar desconectar el Arduino durante la ejecución.
- Verificar periódicamente el tamaño del archivo Excel.
- Usar respaldo CSV o sincronización con OneDrive.
- Configurar el servicio `systemd` para que el sistema inicie automáticamente.
- Mantener identificado el puerto correcto del Arduino.
