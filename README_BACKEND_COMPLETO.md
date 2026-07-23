# Backend local IoT con Excel, PostgreSQL y API Flask

## 1. Descripción general

Este backend recibe por puerto serial las mediciones generadas por el sistema Arduino/ESP32 del proyecto de monitoreo de camas de vermicultura. La aplicación procesa una línea estructurada denominada `TRAMA`, puede complementar sus valores con el bloque detallado que llega después y conserva cada lectura en dos destinos locales:

```text
Arduino / ESP32
       ↓  Serial USB
Backend Python
       ├── Excel local: Anexo_1_datos_iot.xlsx
       ├── PostgreSQL local: iot_lombrices.sensor_lecturas
       └── API y vista web Flask: puerto 5000
```

La solución fue diseñada con un enfoque **local-first**: no depende de Internet para adquirir, almacenar ni consultar los datos. Puede ejecutarse en Windows o trasladarse a una NVIDIA Jetson Nano con Ubuntu.

## 2. Funcionalidades

- Lectura continua del puerto serial mediante `pyserial`.
- Reconexión automática cada cinco segundos cuando el dispositivo serial no está disponible.
- Procesamiento de tramas de 15 campos y de la versión extendida de 16 campos con `peso_cama_g`.
- Complemento de datos a partir del bloque detallado de lectura.
- Creación y actualización automática del archivo Excel.
- Creación automática de la tabla PostgreSQL y su índice temporal.
- Registro de la trama original para auditoría.
- Vista web con las últimas 20 lecturas del Excel.
- Descarga del archivo Excel desde el navegador.
- Endpoint JSON para consultar PostgreSQL.
- Endpoint HTTP para probar tramas sin conectar el hardware.
- Configuración mediante archivo `.env`.
- Ejecución simplificada en Windows con archivos `.bat`.
- Posibilidad de operación permanente en Jetson mediante `systemd`.

## 3. Estructura del paquete

```text
backend_iot_postgresql_documentacion/
├── app_serial_excel_postgresql.py
├── CONFIGURAR_Y_EJECUTAR.bat
├── INICIAR_APLICACION.bat
├── configurar_windows.ps1
├── requirements.txt
├── .env.example
├── setup_postgresql.sql
├── README_BACKEND_COMPLETO.md
├── Informe_Tecnico_Backend_IoT_PostgreSQL.docx
└── jetson/
    ├── INICIAR_JETSON.sh
    └── iot-backend.service
```

## 4. Arquitectura funcional

### 4.1 Capa de adquisición

El Arduino o ESP32 entrega información a `115200` baudios. En Windows el puerto suele ser `COM3`, `COM4` u otro puerto COM. En Jetson normalmente se utiliza `/dev/ttyACM0` o `/dev/ttyUSB0`.

### 4.2 Capa de procesamiento

La aplicación identifica dos tipos de entrada:

1. Una línea que comienza por `TRAMA:`.
2. Las líneas detalladas que siguen a la trama y terminan con `Salud:`.

Cuando `ESPERAR_BLOQUE_DETALLADO=true`, la fila se guarda cuando llega la línea `Salud:`. Si una nueva trama aparece antes, la lectura anterior se conserva con la información disponible. Cuando la opción es `false`, la trama se almacena inmediatamente.

### 4.3 Capa de persistencia

El procedimiento actual guarda primero el Excel y luego intenta insertar la misma lectura en PostgreSQL. Si PostgreSQL falla, el Excel ya queda guardado y la consola muestra `PostgreSQL=False`. Si el Excel falla antes de completar la escritura, PostgreSQL no se intenta en esa ejecución; esta dependencia debe tenerse en cuenta en una futura refactorización.

### 4.4 Capa de consulta

Flask publica una vista HTML, la descarga del Excel, un estado JSON y una API de consulta sobre PostgreSQL.

## 5. Formato de la trama

### 5.1 Versión extendida

```text
TRAMA: trama_id,lluvia,salud,x,y,z,estado,humedad,temperatura,uv,ec,ph,n,p,k,peso_cama_g;
```

Ejemplo:

```text
TRAMA: 32566,1,0.62,342.25,-4.13,6.19,ACEPTABLE,19.40,25.90,19.03,74,6.60,0,0,0,0.00;
```

### 5.2 Compatibilidad

La versión anterior de 15 campos continúa siendo válida. Cuando no llega el campo 16, `peso_cama_g` se almacena como `NULL` en PostgreSQL y como celda vacía en Excel.

### 5.3 Aclaraciones semánticas

- Las columnas `acel_x_g`, `acel_y_g` y `acel_z_g` se conservaron por compatibilidad histórica, pero las lecturas actuales corresponden a orientación del BNO055 en grados.
- N, P y K se guardan exactamente como los reporta el sensor 7 en 1. Deben interpretarse como valores estimados o de tendencia, no como análisis químico de laboratorio.
- `peso_cama_g` queda en `0.00` o vacío mientras no se conecte la celda de carga. El campo ya está reservado para la integración futura.

## 6. Diccionario de datos principal

| Campo | Origen | Unidad/tipo | Descripción |
|---|---|---|---|
| `id` | PostgreSQL | bigint | Identificador autoincremental de la fila. |
| `fecha_hora_registro` | Backend | timestamptz/texto | Fecha y hora local del almacenamiento. |
| `lombrices_agregadas_g` | `.env` | g | Masa acumulada configurada para el bloque experimental. |
| `replica` | Excel | entero | Consecutivo calculado para el valor actual de lombrices agregadas. |
| `peso_cama_5cm_g` | `.env` | g | Peso experimental manual a 5 cm. |
| `peso_cama_10cm_g` | `.env` | g | Peso experimental manual a 10 cm. |
| `peso_lombrices_inyectadas_g` | `.env` | g | Masa inyectada en la etapa experimental. |
| `trama_id` | Arduino | entero | Valor de `millis()` o identificador temporal enviado por el dispositivo. |
| `estado` | Arduino | texto | Estado calculado: OPTIMO, ACEPTABLE, ATENCION o ALERTA. |
| `humedad_pct` | Sensor/bloque | % | Humedad final utilizada en la fila. |
| `temperatura_c` | Sensor/bloque | °C | Temperatura final utilizada en la fila. |
| `uv_intensity` | Sensor/bloque | valor de sensor | Intensidad UV reportada. |
| `conductividad_us_cm` | Sensor 7 en 1 | µS/cm | Conductividad eléctrica. |
| `ph` | Sensor 7 en 1 | pH | Acidez o alcalinidad. |
| `nitrogeno_mg_kg` | Sensor 7 en 1 | mg/kg estimado | Lectura estimada de nitrógeno. |
| `fosforo_mg_kg` | Sensor 7 en 1 | mg/kg estimado | Lectura estimada de fósforo. |
| `potasio_mg_kg` | Sensor 7 en 1 | mg/kg estimado | Lectura estimada de potasio. |
| `acel_x_g` | BNO055 | grados, nombre legado | Orientación en el eje X. |
| `acel_y_g` | BNO055 | grados, nombre legado | Orientación en el eje Y. |
| `acel_z_g` | BNO055 | grados, nombre legado | Orientación en el eje Z. |
| `lluvia_binario` | Sensor digital | 0/1 | Estado de lluvia. |
| `salud` | Arduino | 0–1 | Índice de salud calculado. |
| `trama_raw` | Backend | texto | Línea original completa para auditoría. |
| `*_trama_*` | Backend | numérico | Copia de variables tal como llegaron en `TRAMA`. |
| `peso_cama_g` | Trama/celda futura | g | Peso total de cama, actualmente opcional. |

## 7. Variables de configuración

Copiar `.env.example` como `.env` y ajustar:

```env
SERIAL_PORT=COM3
BAUD_RATE=115200
EXCEL_PATH=Anexo_1_datos_iot.xlsx
SHEET_NAME=Datos extraidos
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=iot_lombrices
PG_USER=iot_user
PG_PASSWORD=cambiar_esta_clave
PG_TABLE=sensor_lecturas
LOMBRICES_AGREGADAS_G=50
PESO_CAMA_5CM_G=1222
PESO_CAMA_10CM_G=1610
PESO_LOMBRICES_INYECTADAS_G=50
ESPERAR_BLOQUE_DETALLADO=true
```

No compartir el archivo `.env`, porque contiene la contraseña local de PostgreSQL.

# 8. Instalación en Windows

## 8.1 Requisitos

- Python 3.11 recomendado.
- PostgreSQL Server.
- Command Line Tools de PostgreSQL.
- pgAdmin 4, opcional para administración gráfica.
- Arduino/ESP32 conectado por USB.

## 8.2 Primera ejecución automática

1. Cerrar el Monitor Serial y el Serial Plotter de Arduino IDE.
2. Descomprimir el paquete.
3. Ejecutar con doble clic:

```text
CONFIGURAR_Y_EJECUTAR.bat
```

El asistente solicita el puerto COM, el usuario administrador `postgres`, su contraseña y una contraseña nueva para `iot_user`. Después crea el entorno virtual, instala las dependencias, crea la base, genera `.env` e inicia la aplicación.

## 8.3 Ejecuciones posteriores

```text
INICIAR_APLICACION.bat
```

## 8.4 Verificación

Abrir:

```text
http://localhost:5000
http://localhost:5000/status
http://localhost:5000/api/lecturas?limit=100
http://localhost:5000/download
```

## 8.5 Acceso desde otro equipo de la red

Consultar la IPv4 mediante `ipconfig` y abrir:

```text
http://IP_DEL_PC:5000
```

Si Windows Defender bloquea el acceso, crear una regla de entrada para TCP 5000. No es necesario publicar el puerto 5432 porque PostgreSQL se utiliza localmente.

# 9. Uso en NVIDIA Jetson Nano

La misma aplicación puede ejecutarse en una Jetson Nano. El cambio principal es el nombre del puerto serial y la forma de instalar los servicios.

## 9.1 Instalar dependencias del sistema

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv \
  postgresql postgresql-contrib libpq-dev
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## 9.2 Permisos del puerto serial

```bash
sudo usermod -aG dialout $USER
sudo reboot
```

Después del reinicio:

```bash
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

Configurar, según corresponda:

```env
SERIAL_PORT=/dev/ttyACM0
```

o:

```env
SERIAL_PORT=/dev/ttyUSB0
```

## 9.3 Crear PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE iot_user WITH LOGIN PASSWORD 'cambiar_esta_clave';
CREATE DATABASE iot_lombrices OWNER iot_user;
\c iot_lombrices
GRANT ALL ON SCHEMA public TO iot_user;
ALTER SCHEMA public OWNER TO iot_user;
\q
```

## 9.4 Crear entorno y ejecutar

```bash
cd ~/iot_backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
nano .env
python3 app_serial_excel_postgresql.py
```

Abrir desde otro equipo:

```bash
hostname -I
```

```text
http://IP_DE_LA_JETSON:5000
```

## 9.5 Inicio automático con systemd

El paquete incluye `jetson/iot-backend.service`. Antes de usarlo, cambiar `User`, `WorkingDirectory`, `EnvironmentFile` y `ExecStart` según el usuario y ruta reales.

```bash
sudo cp jetson/iot-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable iot-backend
sudo systemctl start iot-backend
sudo systemctl status iot-backend
```

Consultar logs:

```bash
journalctl -u iot-backend -f
```

La aplicación actual inicia el hilo serial dentro de `if __name__ == "__main__"`; por esta razón se recomienda ejecutarla directamente con Python y `systemd`. No debe migrarse a Gunicorn sin separar previamente el proceso de adquisición serial del servidor web.

# 10. API HTTP

## `GET /`

Muestra las últimas 20 filas del Excel y el estado de la última lectura.

## `GET /download`

Descarga `Anexo_1_datos_iot.xlsx`.

## `GET /status`

Devuelve configuración y último dato en JSON.

## `GET /api/lecturas?limit=100`

Consulta hasta 500 registros recientes desde PostgreSQL.

## `POST /api/trama`

Permite probar el backend sin puerto serial.

Ejemplo con PowerShell:

```powershell
$body = @{
  trama = "TRAMA: 32566,1,0.62,342.25,-4.13,6.19,ACEPTABLE,19.40,25.90,19.03,74,6.60,0,0,0,0.00;"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5000/api/trama" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Ejemplo con `curl`:

```bash
curl -X POST http://localhost:5000/api/trama \
  -H "Content-Type: application/json" \
  -d '{"trama":"TRAMA: 32566,1,0.62,342.25,-4.13,6.19,ACEPTABLE,19.40,25.90,19.03,74,6.60,0,0,0,0.00;"}'
```

# 11. Consultas PostgreSQL útiles

Conexión:

```bash
psql -h localhost -U iot_user -d iot_lombrices
```

Últimas lecturas:

```sql
SELECT *
FROM sensor_lecturas
ORDER BY fecha_hora_registro DESC
LIMIT 20;
```

Variables ambientales:

```sql
SELECT
  fecha_hora_registro,
  humedad_pct,
  temperatura_c,
  ph,
  conductividad_us_cm,
  peso_cama_g
FROM sensor_lecturas
ORDER BY fecha_hora_registro DESC;
```

Conteo por estado:

```sql
SELECT estado, COUNT(*)
FROM sensor_lecturas
GROUP BY estado
ORDER BY COUNT(*) DESC;
```

Promedios por día:

```sql
SELECT
  DATE(fecha_hora_registro) AS fecha,
  AVG(humedad_pct) AS humedad_promedio,
  AVG(temperatura_c) AS temperatura_promedio,
  AVG(ph) AS ph_promedio,
  AVG(conductividad_us_cm) AS ec_promedio
FROM sensor_lecturas
GROUP BY DATE(fecha_hora_registro)
ORDER BY fecha;
```

# 12. Respaldo y recuperación

Respaldo de PostgreSQL:

```bash
pg_dump -h localhost -U iot_user -d iot_lombrices > respaldo_iot.sql
```

Restauración:

```bash
psql -h localhost -U iot_user -d iot_lombrices < respaldo_iot.sql
```

También se recomienda copiar periódicamente el archivo Excel en otra unidad. PostgreSQL debe considerarse el repositorio estructurado para consulta y análisis, mientras que el Excel funciona como respaldo operativo y mecanismo de intercambio.

# 13. Seguridad

- Mantener PostgreSQL escuchando únicamente en `localhost` salvo necesidad justificada.
- No publicar directamente el puerto 5432 en Internet.
- Restringir el acceso al puerto 5000 a la red local de confianza.
- Cambiar la contraseña de ejemplo.
- Proteger `.env` y las copias de respaldo.
- El backend actual no implementa autenticación HTTP. Si se expone fuera de una LAN controlada, debe agregarse autenticación y HTTPS.
- El endpoint `/api/trama` acepta inserciones; no debe quedar accesible públicamente sin control de acceso.

# 14. Solución de problemas

## El puerto COM está ocupado

Cerrar Arduino IDE, Serial Plotter, PuTTY u otra instancia de Python.

## `Permission denied` en Jetson

```bash
sudo usermod -aG dialout $USER
sudo reboot
```

## `password authentication failed`

Verificar `PG_USER` y `PG_PASSWORD` en `.env` o cambiar la contraseña:

```sql
ALTER ROLE iot_user WITH PASSWORD 'nueva_clave';
```

## PostgreSQL no inicia

Windows: revisar `services.msc`.

Jetson:

```bash
sudo systemctl status postgresql
sudo systemctl restart postgresql
```

## `PostgreSQL=False`

La lectura quedó en Excel, pero la inserción en PostgreSQL falló. Revisar contraseña, servicio, base, permisos y consola.

## NPK aparece en cero

El backend almacena lo recibido; no reemplaza ni inventa datos. Debe revisarse la comunicación Modbus, la respuesta del sensor y las condiciones de medición.

## El peso aparece en cero

Es el comportamiento esperado mientras `peso_cama_g` sea un campo reservado y no exista una celda de carga conectada.

## No abre desde otro dispositivo

Verificar la IP, que Flask muestre `0.0.0.0:5000`, la regla de firewall y que ambos equipos estén en la misma red.

# 15. Limitaciones actuales y mejoras recomendadas

1. La escritura se realiza secuencialmente: Excel y después PostgreSQL. Se recomienda desacoplar ambos destinos con una cola local.
2. La réplica se calcula a partir del Excel; una futura versión debe administrarla desde PostgreSQL.
3. No existe restricción de unicidad para evitar tramas duplicadas.
4. La vista principal lee el Excel completo para mostrar las últimas 20 filas; con archivos grandes debe consultar PostgreSQL.
5. Las columnas `acel_*_g` deben migrarse a `orientacion_*_deg` en una versión con compatibilidad controlada.
6. NPK debe renombrarse como `*_estimado_mg_kg` para reflejar su naturaleza.
7. Flask usa su servidor integrado. Es adecuado para operación local, pero el componente serial debe separarse antes de utilizar un servidor WSGI multiproceso.
8. Deben incorporarse autenticación, auditoría, rotación de logs y respaldos programados si el sistema pasa a producción.
9. La futura celda de carga debe incluir calibración, tara, filtrado y detección de valores atípicos.

# 16. Estado operativo esperado

Una lectura exitosa produce una salida similar a:

```text
[RX] TRAMA: 32566,1,0.62,342.25,-4.13,6.19,ACEPTABLE,19.40,25.90,19.03,74,6.60,0,0,0,0.00;
[RX] Salud: 0.62_
[GUARDADO] Replica 11 | Trama 32566 | Estado ACEPTABLE | PostgreSQL=True
```

Esto confirma que la trama fue interpretada, el Excel fue actualizado y PostgreSQL recibió la fila.
