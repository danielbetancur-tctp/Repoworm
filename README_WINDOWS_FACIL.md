# Configuración fácil en Windows

Esta versión permite configurar el sistema con doble clic.

## Requisito previo

PostgreSQL debe estar instalado en Windows con estos componentes:

- PostgreSQL Server
- Command Line Tools
- pgAdmin

También debe estar instalado Python y disponible desde el comando `python`.

## Primera ejecución

1. Descomprimir la carpeta.
2. Cerrar el Monitor Serial de Arduino IDE.
3. Hacer doble clic en:

```text
CONFIGURAR_Y_EJECUTAR.bat
```

El asistente solicitará:

- Puerto COM, por ejemplo `COM3`.
- Usuario administrador de PostgreSQL, normalmente `postgres`.
- Contraseña del administrador de PostgreSQL.
- Contraseña que se asignará al usuario local `iot_user`.

Después realizará automáticamente:

1. Creación del entorno virtual.
2. Instalación de dependencias.
3. Creación del usuario `iot_user`.
4. Creación de la base `iot_lombrices`.
5. Creación del archivo `.env`.
6. Inicio de la aplicación Flask.
7. Creación automática de la tabla PostgreSQL.

## Ejecuciones posteriores

Hacer doble clic en:

```text
INICIAR_APLICACION.bat
```

No es necesario volver a configurar PostgreSQL ni instalar las librerías.

## Interfaz

Abrir en el mismo computador:

```text
http://localhost:5000
```

Descargar Excel:

```text
http://localhost:5000/download
```

Consultar registros PostgreSQL:

```text
http://localhost:5000/api/lecturas?limit=100
```

## Cambiar el puerto COM

Abrir el archivo `.env` y modificar:

```text
SERIAL_PORT=COM3
```

También se puede volver a ejecutar:

```text
CONFIGURAR_Y_EJECUTAR.bat
```

## Error de acceso al puerto COM

Cerrar:

- Monitor Serial de Arduino IDE.
- Serial Plotter.
- Otra aplicación Python.
- PuTTY u otra terminal serial.

Solo una aplicación puede usar el puerto COM al mismo tiempo.

## Archivos generados automáticamente

```text
.venv/
.env
Anexo_1_datos_iot.xlsx
```

No compartir públicamente el archivo `.env`, porque contiene la contraseña local de PostgreSQL.
