#!/bin/bash
set -e

# ============================================================================
# VX200 Controller - Docker Entry Point
# Configura el entorno y ejecuta la aplicación
# ============================================================================

echo "🚀 Iniciando VX200 Controller en contenedor Docker..."

# Función para logging con timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Verificar que el usuario tiene permisos de audio
log "Verificando permisos de audio..."
if groups | grep -q audio; then
    log "✅ Usuario en grupo audio: OK"
else
    log "⚠️  Usuario no está en grupo audio, verificando acceso a dispositivos..."
fi

# Verificar dispositivos de audio disponibles
log "Verificando dispositivos de audio..."
if [ -e /dev/snd ]; then
    log "✅ Dispositivos /dev/snd disponibles:"
    ls -la /dev/snd/ | head -5
else
    log "⚠️  No se encontraron dispositivos /dev/snd"
fi

# Esperar a que PulseAudio esté disponible
log "Esperando servidor PulseAudio..."
PULSE_TIMEOUT=30
PULSE_COUNTER=0

while [ $PULSE_COUNTER -lt $PULSE_TIMEOUT ]; do
    if [ -S /tmp/pulse-socket ]; then
        log "✅ Servidor PulseAudio disponible"
        break
    fi
    sleep 1
    PULSE_COUNTER=$((PULSE_COUNTER + 1))
done

if [ $PULSE_COUNTER -eq $PULSE_TIMEOUT ]; then
    log "⚠️  Timeout esperando PulseAudio, continuando..."
fi

# Verificar configuración de audio
log "Configuración de audio:"
log "  PULSE_SERVER: ${PULSE_SERVER:-"no configurado"}"
log "  AUDIO_DEVICE: ${AUDIO_DEVICE:-"no configurado"}"

# Crear directorios necesarios si no existen
log "Verificando estructura de directorios..."
mkdir -p /app/logs /app/temp /app/data /app/sounds

# Verificar archivo .env
if [ ! -f /app/.env ]; then
    log "⚠️  Archivo .env no encontrado, copiando desde .env.example..."
    cp /app/.env.example /app/.env
fi

# Verificar dependencias de Node.js
log "Verificando dependencias de Node.js..."
if [ ! -d /app/node_modules ]; then
    log "📦 Instalando dependencias de Node.js..."
    npm ci --only=production
fi

# Verificar que los puertos están disponibles
log "Verificando disponibilidad de puertos..."
if netstat -ln | grep -q ":3000 "; then
    log "⚠️  Puerto 3000 ya está en uso"
else
    log "✅ Puerto 3000 disponible"
fi

# Configurar límites del sistema para audio (si es posible)
if [ -w /proc/sys/kernel ]; then
    echo 2048 > /proc/sys/kernel/msgmax 2>/dev/null || true
    echo 16384 > /proc/sys/kernel/msgmnb 2>/dev/null || true
fi

# Test rápido de audio (si está disponible)
log "Realizando test de audio..."
if command -v aplay >/dev/null 2>&1; then
    # Crear un tono de test muy corto
    if command -v sox >/dev/null 2>&1; then
        sox -n -r 8000 -c 1 /tmp/test-tone.wav synth 0.1 sine 440 vol 0.1 2>/dev/null || true
        if [ -f /tmp/test-tone.wav ]; then
            timeout 2s aplay /tmp/test-tone.wav >/dev/null 2>&1 && log "✅ Test de audio: OK" || log "⚠️  Test de audio: Falló"
            rm -f /tmp/test-tone.wav
        fi
    fi
else
    log "⚠️  aplay no disponible, omitiendo test de audio"
fi

# Mostrar información del sistema
log "Información del sistema:"
log "  Hostname: $(hostname)"
log "  Usuario: $(whoami)"
log "  Directorio: $(pwd)"
log "  Node.js: $(node --version)"
log "  NPM: $(npm --version)"

# Verificar si Direwolf está disponible
if command -v direwolf >/dev/null 2>&1; then
    log "✅ Direwolf disponible: $(direwolf -t 0 2>&1 | head -1 | cut -d' ' -f1-3)"
else
    log "⚠️  Direwolf no encontrado"
fi

# Limpiar archivos temporales antiguos
log "Limpiando archivos temporales antiguos..."
find /app/temp -type f -mtime +1 -delete 2>/dev/null || true

# Configurar manejo de señales para shutdown graceful
trap 'log "🔻 Recibida señal de terminación, cerrando aplicación..."; exit 0' SIGTERM SIGINT

# Mostrar configuración final
log "📋 Configuración final:"
log "  CALLSIGN: $(grep CALLSIGN /app/.env | cut -d= -f2)"
log "  NODE_ENV: ${NODE_ENV:-development}"
log "  AUDIO_DEVICE: ${AUDIO_DEVICE:-default}"

log "🎯 Iniciando VX200 Controller..."
log "🗺️  Mapa APRS estará disponible en: http://localhost:3000"
log "📊 Monitoreo disponible en: http://localhost:3000/api/repeater"

# Ejecutar el comando proporcionado o npm start por defecto
if [ "$#" -eq 0 ]; then
    exec npm start
else
    exec "$@"
fi