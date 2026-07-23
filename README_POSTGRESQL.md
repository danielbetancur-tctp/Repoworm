# Logger serial con Excel y PostgreSQL local

Esta versión conserva el Excel y guarda cada nueva lectura en una tabla PostgreSQL local. También acepta el campo opcional `peso_cama_g` como campo 16 de la trama.

## 1. Entrar a la carpeta

```bash
cd ~/jetson_excel_postgresql
```

## 2. Instalar PostgreSQL en Jetson/Ubuntu

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib libpq-dev
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## 3. Crear base de datos

```bash
sudo -u postgres psql
```

Dentro de PostgreSQL:

```sql
CREATE DATABASE iot_lombrices;
CREATE USER iot_user WITH PASSWORD 'cambiar_esta_clave';
GRANT ALL PRIVILEGES ON DATABASE iot_lombrices TO iot_user;
\c iot_lombrices
GRANT ALL ON SCHEMA public TO iot_user;
ALTER SCHEMA public OWNER TO iot_user;
\q
```

## 4. Crear y activar venv

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## 5. Configurar contraseña y puerto serial

Jetson:

```bash
export SERIAL_PORT=/dev/ttyACM0
export PG_PASSWORD='cambiar_esta_clave'
```

Windows PowerShell:

```powershell
$env:SERIAL_PORT='COM3'
$env:PG_PASSWORD='cambiar_esta_clave'
```

## 6. Ejecutar

```bash
python app_serial_excel_postgresql.py
```

El programa crea automáticamente la tabla `sensor_lecturas` y almacena cada lectura en Excel y PostgreSQL.

## 7. Consultar datos

Interfaz web:

```text
http://IP_DE_LA_JETSON:5000
```

Excel:

```text
http://IP_DE_LA_JETSON:5000/download
```

JSON desde PostgreSQL:

```text
http://IP_DE_LA_JETSON:5000/api/lecturas?limit=100
```

Consulta directa:

```bash
psql -h localhost -U iot_user -d iot_lombrices
```

```sql
SELECT * FROM sensor_lecturas
ORDER BY fecha_hora_registro DESC
LIMIT 20;
```

## 8. Nueva trama con peso

```text
TRAMA: id,lluvia,salud,x,y,z,estado,humedad,temperatura,uv,ec,ph,n,p,k,peso_cama_g;
```

La trama anterior de 15 campos continúa funcionando. En ese caso, `peso_cama_g` queda como `NULL` en PostgreSQL.

## 9. Nota sobre orientación

Las columnas `acel_x_g`, `acel_y_g` y `acel_z_g` se conservaron por compatibilidad con el Excel actual, aunque los valores enviados actualmente corresponden a orientación en grados.
