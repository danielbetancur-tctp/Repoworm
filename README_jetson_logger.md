# Logger IoT en Jetson Nano para Anexo 1

Este logger recibe una trama cada segundo, la procesa y la agrega a la hoja `Datos extraidos` con las columnas del archivo **Anexo 1**.

## 1. Instalar dependencias en Jetson Nano

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements_jetson_logger.txt
```

## 2. Identificar el puerto serial

```bash
ls /dev/ttyUSB* /dev/ttyACM* /dev/ttyTHS* 2>/dev/null
```

Puertos comunes:

- USB serial Arduino/ESP32: `/dev/ttyUSB0` o `/dev/ttyACM0`
- UART GPIO Jetson Nano: `/dev/ttyTHS1`

Si hay problema de permisos:

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

## 3. Probar sin sensor

```bash
python jetson_logger_anexo1.py --demo --excel ./Anexo_1_datos_iot.xlsx --lombrices 50 --peso-5cm 1222 --peso-10cm 1610 --peso-lombrices 50
```

## 4. Ejecutar con sensor real

```bash
python jetson_logger_anexo1.py \
  --port /dev/ttyUSB0 \
  --baud 115200 \
  --excel ./Anexo_1_datos_iot.xlsx \
  --csv ./backup_datos_iot.csv \
  --lombrices 50 \
  --peso-5cm 1222 \
  --peso-10cm 1610 \
  --peso-lombrices 50
```

El parámetro `--replica auto` está activo por defecto. Cada nueva lectura del mismo bloque experimental aumenta la réplica.

## 5. Guardar directamente en OneDrive

En Jetson Nano normalmente no existe carpeta OneDrive nativa. Una forma práctica es montar OneDrive con `rclone`:

```bash
sudo apt install -y rclone
rclone config
mkdir -p ~/OneDriveIoT
rclone mount onedrive:IoT ~/OneDriveIoT --daemon
```

Luego ejecuta el logger apuntando el Excel a esa carpeta:

```bash
python jetson_logger_anexo1.py \
  --port /dev/ttyUSB0 \
  --baud 115200 \
  --excel ~/OneDriveIoT/Anexo_1_datos_iot.xlsx \
  --csv ~/OneDriveIoT/backup_datos_iot.csv \
  --lombrices 50 \
  --peso-5cm 1222 \
  --peso-10cm 1610 \
  --peso-lombrices 50
```

## Estructura interpretada de la TRAMA

```text
TRAMA: trama_id,lluvia_binario,salud,acel_x_g,acel_y_g,acel_z_g,estado,humedad,temperatura,uv_raw,conductividad,pH,N,P,K;
```

El anexo original usa la columna `uv_intensity` desde el bloque detallado, por ejemplo `UV_intensity: 207`. Si tu dispositivo solo manda la línea `TRAMA` y no manda el bloque detallado, puedes abrir el script y cambiar:

```python
USE_TRAMA_UV_AS_UV_INTENSITY = True
```

