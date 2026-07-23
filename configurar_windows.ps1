$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Configuracion IoT PostgreSQL"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " CONFIGURACION AUTOMATICA IOT + POSTGRESQL" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

function Pause-OnError {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
    Read-Host "Presiona ENTER para cerrar"
    exit 1
}

function Get-PlainText {
    param([Security.SecureString]$SecureString)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function Escape-SqlLiteral {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

try {
    $pythonCmd = Get-Command python -ErrorAction Stop
}
catch {
    Pause-OnError "Python no esta instalado o no esta agregado al PATH."
}

Write-Host "[1/7] Python encontrado: $($pythonCmd.Source)" -ForegroundColor Green

$psqlCandidates = @(
    "$env:ProgramFiles\PostgreSQL\*\bin\psql.exe",
    "${env:ProgramFiles(x86)}\PostgreSQL\*\bin\psql.exe"
)

$psql = Get-ChildItem $psqlCandidates -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $psql) {
    Pause-OnError @"
No se encontro PostgreSQL.

Instala PostgreSQL para Windows incluyendo:
- PostgreSQL Server
- Command Line Tools
- pgAdmin

Luego vuelve a ejecutar CONFIGURAR_Y_EJECUTAR.bat.
"@
}

$psqlPath = $psql.FullName
Write-Host "[2/7] PostgreSQL encontrado: $psqlPath" -ForegroundColor Green

$defaultPort = "COM3"
$serialPort = Read-Host "Puerto del Arduino/ESP32 [$defaultPort]"
if ([string]::IsNullOrWhiteSpace($serialPort)) {
    $serialPort = $defaultPort
}
$serialPort = $serialPort.Trim().ToUpper()

$adminUser = Read-Host "Usuario administrador PostgreSQL [postgres]"
if ([string]::IsNullOrWhiteSpace($adminUser)) {
    $adminUser = "postgres"
}

$adminSecure = Read-Host "Clave del usuario $adminUser" -AsSecureString
$adminPassword = Get-PlainText $adminSecure

$appUser = "iot_user"
$appDatabase = "iot_lombrices"

$appSecure = Read-Host "Clave nueva para iot_user [cambiar_esta_clave]" -AsSecureString
$appPassword = Get-PlainText $appSecure
if ([string]::IsNullOrWhiteSpace($appPassword)) {
    $appPassword = "cambiar_esta_clave"
}

Write-Host "[3/7] Creando entorno virtual..." -ForegroundColor Yellow

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    & python -m venv .venv
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Pause-OnError "No se pudo crear el entorno virtual."
}

Write-Host "[4/7] Instalando dependencias..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt

Write-Host "[5/7] Configurando PostgreSQL..." -ForegroundColor Yellow

$env:PGPASSWORD = $adminPassword
$escapedPassword = Escape-SqlLiteral $appPassword

$roleExists = & $psqlPath `
    -h localhost `
    -p 5432 `
    -U $adminUser `
    -d postgres `
    -tAc "SELECT 1 FROM pg_roles WHERE rolname='$appUser';"

if ($LASTEXITCODE -ne 0) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pause-OnError "No fue posible conectarse a PostgreSQL. Revisa la clave de $adminUser."
}

if (($roleExists | Out-String).Trim() -eq "1") {
    & $psqlPath `
        -h localhost `
        -p 5432 `
        -U $adminUser `
        -d postgres `
        -v ON_ERROR_STOP=1 `
        -c "ALTER ROLE $appUser WITH LOGIN PASSWORD '$escapedPassword';"
}
else {
    & $psqlPath `
        -h localhost `
        -p 5432 `
        -U $adminUser `
        -d postgres `
        -v ON_ERROR_STOP=1 `
        -c "CREATE ROLE $appUser WITH LOGIN PASSWORD '$escapedPassword';"
}

$dbExists = & $psqlPath `
    -h localhost `
    -p 5432 `
    -U $adminUser `
    -d postgres `
    -tAc "SELECT 1 FROM pg_database WHERE datname='$appDatabase';"

if (($dbExists | Out-String).Trim() -ne "1") {
    & $psqlPath `
        -h localhost `
        -p 5432 `
        -U $adminUser `
        -d postgres `
        -v ON_ERROR_STOP=1 `
        -c "CREATE DATABASE $appDatabase OWNER $appUser;"
}

& $psqlPath `
    -h localhost `
    -p 5432 `
    -U $adminUser `
    -d $appDatabase `
    -v ON_ERROR_STOP=1 `
    -c "GRANT ALL ON SCHEMA public TO $appUser;"

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "[6/7] Generando archivo .env..." -ForegroundColor Yellow

$envContent = @"
SERIAL_PORT=$serialPort
BAUD_RATE=115200

EXCEL_PATH=Anexo_1_datos_iot.xlsx
SHEET_NAME=Datos extraidos

PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=$appDatabase
PG_USER=$appUser
PG_PASSWORD=$appPassword
PG_TABLE=sensor_lecturas

LOMBRICES_AGREGADAS_G=50
PESO_CAMA_5CM_G=1222
PESO_CAMA_10CM_G=1610
PESO_LOMBRICES_INYECTADAS_G=50

ESPERAR_BLOQUE_DETALLADO=true
"@

Set-Content -Path ".env" -Value $envContent -Encoding UTF8

Write-Host "[7/7] Configuracion terminada." -ForegroundColor Green
Write-Host ""
Write-Host "Puerto serial: $serialPort"
Write-Host "Base de datos: $appDatabase"
Write-Host "Usuario: $appUser"
Write-Host ""
Write-Host "IMPORTANTE: cierra el Monitor Serial de Arduino IDE." -ForegroundColor Yellow
Write-Host ""
Read-Host "Presiona ENTER para iniciar la aplicacion"

& $venvPython "app_serial_excel_postgresql.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "La aplicacion termino con un error." -ForegroundColor Red
    Read-Host "Presiona ENTER para cerrar"
}
