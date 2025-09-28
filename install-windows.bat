@echo off
setlocal EnableDelayedExpansion

:: ============================================================================
:: VX200 Controller - Script de Instalación para Windows
:: Instala y configura Docker con privilegios de audio para ejecutar VX200
:: ============================================================================

echo.
echo ========================================
echo  VX200 Controller - Instalador Windows
echo ========================================
echo.
echo Este script instalara y configurara:
echo - Docker Desktop
echo - WSL2 (si es necesario)
echo - Contenedor Linux con privilegios de audio
echo - VX200 Controller completo
echo.

:: Verificar si se ejecuta como administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script debe ejecutarse como Administrador
    echo Clic derecho en el archivo y selecciona "Ejecutar como administrador"
    pause
    exit /b 1
)

echo [INFO] Ejecutandose como Administrador... OK
echo.

:: Verificar version de Windows
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo [INFO] Version de Windows: %VERSION%

if "%VERSION%" lss "10.0" (
    echo [ERROR] Windows 10 version 2004 o superior requerido
    pause
    exit /b 1
)

echo [INFO] Version de Windows compatible... OK
echo.

:: ============================================================================
:: FASE 1: Verificar e instalar dependencias
:: ============================================================================

echo ============================================
echo FASE 1: Verificando dependencias
echo ============================================
echo.

:: Verificar si Docker Desktop esta instalado
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Docker Desktop no encontrado, descargando...

    :: Crear directorio temporal
    if not exist "%TEMP%\vx200-setup" mkdir "%TEMP%\vx200-setup"
    cd /d "%TEMP%\vx200-setup"

    :: Descargar Docker Desktop
    echo [INFO] Descargando Docker Desktop...
    powershell -Command "& {Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe' -OutFile 'DockerDesktopInstaller.exe'}"

    if exist "DockerDesktopInstaller.exe" (
        echo [INFO] Instalando Docker Desktop...
        start /wait DockerDesktopInstaller.exe install --quiet
        echo [INFO] Docker Desktop instalado. Reinicia el sistema y ejecuta este script nuevamente.
        pause
        exit /b 0
    ) else (
        echo [ERROR] No se pudo descargar Docker Desktop
        echo Descarga manualmente desde: https://docs.docker.com/desktop/install/windows-install/
        pause
        exit /b 1
    )
) else (
    echo [INFO] Docker Desktop encontrado... OK
)

:: Verificar si Docker esta corriendo
docker ps >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Iniciando Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

    echo [INFO] Esperando que Docker Desktop inicie...
    :wait_docker
    timeout /t 5 /nobreak >nul
    docker ps >nul 2>&1
    if %errorLevel% neq 0 (
        echo [INFO] Esperando Docker... (puede tomar varios minutos en el primer inicio)
        goto wait_docker
    )
)

echo [INFO] Docker corriendo... OK
echo.

:: Verificar WSL2
wsl --list --verbose >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Habilitando WSL2...
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

    echo [INFO] WSL2 habilitado. Reinicia el sistema y ejecuta este script nuevamente.
    pause
    exit /b 0
) else (
    echo [INFO] WSL2 disponible... OK
)

:: ============================================================================
:: FASE 2: Crear archivos de configuracion Docker
:: ============================================================================

echo ============================================
echo FASE 2: Configurando Docker
echo ============================================
echo.

:: Volver al directorio del proyecto
cd /d "%~dp0"

echo [INFO] Creando Dockerfile...
(
echo FROM ubuntu:22.04
echo.
echo # Evitar prompts interactivos
echo ENV DEBIAN_FRONTEND=noninteractive
echo ENV TZ=America/Argentina/Mendoza
echo.
echo # Instalar dependencias del sistema
echo RUN apt-get update ^&^& apt-get install -y \
echo     curl \
echo     wget \
echo     gnupg2 \
echo     software-properties-common \
echo     alsa-utils \
echo     pulseaudio \
echo     pulseaudio-utils \
echo     direwolf \
echo     ffmpeg \
echo     espeak \
echo     espeak-data \
echo     git \
echo     nano \
echo     htop \
echo     ^&^& rm -rf /var/lib/apt/lists/*
echo.
echo # Instalar Node.js 18.x
echo RUN curl -fsSL https://deb.nodesource.com/setup_18.x ^| bash -
echo RUN apt-get install -y nodejs
echo.
echo # Crear usuario para aplicacion
echo RUN useradd -m -s /bin/bash vx200user
echo RUN usermod -a -G audio vx200user
echo.
echo # Configurar PulseAudio para contenedor
echo RUN echo "default-server = unix:/tmp/pulse-socket" ^> /etc/pulse/client.conf
echo.
echo # Directorio de trabajo
echo WORKDIR /app
echo.
echo # Copiar package.json e instalar dependencias
echo COPY package*.json ./
echo RUN npm install --production
echo.
echo # Copiar codigo fuente
echo COPY . .
echo.
echo # Crear directorios necesarios
echo RUN mkdir -p temp sounds logs config
echo RUN chown -R vx200user:vx200user /app
echo.
echo # Exponer puerto del mapa APRS
echo EXPOSE 3000
echo.
echo # Cambiar a usuario no-root
echo USER vx200user
echo.
echo # Comando por defecto
echo CMD ["npm", "start"]
) > Dockerfile

echo [INFO] Creando docker-compose.yml...
(
echo version: '3.8'
echo.
echo services:
echo   vx200-controller:
echo     build: .
echo     container_name: vx200-controller
echo     restart: unless-stopped
echo     ports:
echo       - "3000:3000"
echo     volumes:
echo       - ./logs:/app/logs
echo       - ./config:/app/config
echo       - ./.env:/app/.env
echo       - pulse-socket:/tmp/pulse-socket
echo     devices:
echo       - /dev/snd:/dev/snd
echo     environment:
echo       - PULSE_SERVER=unix:/tmp/pulse-socket
echo       - NODE_ENV=production
echo     networks:
echo       - vx200-network
echo.
echo   pulseaudio:
echo     image: alpine:latest
echo     container_name: vx200-pulseaudio
echo     restart: unless-stopped
echo     volumes:
echo       - pulse-socket:/tmp/pulse-socket
echo     devices:
echo       - /dev/snd:/dev/snd
echo     command: >
echo       sh -c "
echo       apk add --no-cache pulseaudio ^&^&
echo       pulseaudio --system --disallow-exit --disallow-module-loading
echo       --no-cpu-limit --realtime --log-level=2
echo       "
echo     networks:
echo       - vx200-network
echo.
echo volumes:
echo   pulse-socket:
echo.
echo networks:
echo   vx200-network:
echo     driver: bridge
) > docker-compose.yml

echo [INFO] Archivos Docker creados... OK
echo.

:: ============================================================================
:: FASE 3: Configurar archivo .env si no existe
:: ============================================================================

echo ============================================
echo FASE 3: Configuracion del proyecto
echo ============================================
echo.

if not exist ".env" (
    echo [INFO] Creando archivo .env...
    copy ".env.example" ".env" >nul 2>&1
    if not exist ".env" (
        echo [INFO] Creando .env basico...
        (
        echo # VX200 Controller - Configuracion Windows Docker
        echo CALLSIGN=CAMBIAR-INDICATIVO
        echo NODE_ENV=production
        echo.
        echo # Audio Configuration
        echo AUDIO_DEVICE=default
        echo AUDIO_SAMPLE_RATE=48000
        echo AUDIO_CHANNEL_THRESHOLD=0.02
        echo.
        echo # APRS Configuration
        echo APRS_ENABLED=true
        echo APRS_CALLSIGN=CAMBIAR-INDICATIVO
        echo APRS_COMMENT=VX200 RPT Windows Docker
        echo APRS_MAP_PORT=3000
        echo.
        echo # TTS Configuration
        echo TTS_VOICE=es+f3
        echo TTS_SPEED=160
        echo.
        echo # Roger Beep
        echo ROGER_BEEP_ENABLED=true
        echo ROGER_BEEP_TYPE=kenwood
        ) > .env
    )
    echo [INFO] Archivo .env creado. EDITA el archivo para configurar tu indicativo.
) else (
    echo [INFO] Archivo .env ya existe... OK
)

:: ============================================================================
:: FASE 4: Construir y ejecutar contenedor
:: ============================================================================

echo ============================================
echo FASE 4: Construyendo contenedor
echo ============================================
echo.

echo [INFO] Construyendo imagen Docker VX200...
docker-compose build

if %errorLevel% neq 0 (
    echo [ERROR] Error construyendo imagen Docker
    pause
    exit /b 1
)

echo [INFO] Imagen construida exitosamente... OK
echo.

:: ============================================================================
:: FASE 5: Mostrar instrucciones finales
:: ============================================================================

echo ============================================
echo INSTALACION COMPLETADA
echo ============================================
echo.
echo [INFO] VX200 Controller esta listo para ejecutar en Windows!
echo.
echo COMANDOS DISPONIBLES:
echo.
echo   Iniciar VX200:
echo   docker-compose up -d
echo.
echo   Ver logs en tiempo real:
echo   docker-compose logs -f vx200-controller
echo.
echo   Detener VX200:
echo   docker-compose down
echo.
echo   Reiniciar VX200:
echo   docker-compose restart
echo.
echo   Acceder al contenedor:
echo   docker-compose exec vx200-controller bash
echo.
echo CONFIGURACION IMPORTANTE:
echo.
echo 1. EDITA el archivo .env y cambia CAMBIAR-INDICATIVO por tu indicativo real
echo 2. El mapa APRS estara disponible en: http://localhost:3000
echo 3. Los logs se guardan en la carpeta ./logs/
echo.
echo ¿Quieres iniciar VX200 Controller ahora? (S/N)
set /p choice="> "

if /i "%choice%"=="S" (
    echo.
    echo [INFO] Iniciando VX200 Controller...
    docker-compose up -d
    echo.
    echo [INFO] VX200 Controller iniciado!
    echo [INFO] Mapa APRS: http://localhost:3000
    echo [INFO] Ver logs: docker-compose logs -f vx200-controller
) else (
    echo.
    echo [INFO] VX200 Controller instalado pero no iniciado.
    echo [INFO] Para iniciarlo ejecuta: docker-compose up -d
)

echo.
echo [INFO] Instalacion completada exitosamente!
echo [INFO] Documentacion: README.md
pause