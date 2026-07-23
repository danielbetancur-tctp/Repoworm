@echo off
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo El sistema no esta configurado.
    echo Ejecuta primero CONFIGURAR_Y_EJECUTAR.bat
    pause
    exit /b 1
)

if not exist ".env" (
    echo No existe el archivo .env.
    echo Ejecuta primero CONFIGURAR_Y_EJECUTAR.bat
    pause
    exit /b 1
)

".venv\Scripts\python.exe" "app_serial_excel_postgresql.py"
pause
