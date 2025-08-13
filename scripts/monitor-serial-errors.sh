#!/bin/bash
# monitor-serial-errors.sh - Monitorear errores de puerto serie en tiempo real

echo "🔍 Monitor de errores serie para Vertex FTL2011"
echo "==============================================="

# Verificar si ttyUSB1 existe
if [ ! -e /dev/ttyUSB1 ]; then
    echo "❌ /dev/ttyUSB1 no encontrado"
    exit 1
fi

echo "📊 Estado inicial del puerto:"
stty -F /dev/ttyUSB1

echo ""
echo "🔍 Monitoreando errores en tiempo real..."
echo "Presiona Ctrl+C para detener"
echo ""

# Monitor inicial de estadísticas USB
if [ -d /sys/class/tty/ttyUSB1/device ]; then
    echo "📈 Estadísticas USB del dispositivo:"
    ls -la /sys/class/tty/ttyUSB1/device/ | grep -E "(baud|latency|error)"
    echo ""
fi

# Función para mostrar estadísticas
show_stats() {
    local timestamp=$(date '+%H:%M:%S')
    echo "[$timestamp] 📊 Estado del puerto:"
    
    # Verificar configuración actual
    local config=$(stty -F /dev/ttyUSB1 speed 2>/dev/null)
    echo "  Velocidad: $config"
    
    # Verificar errores en dmesg (últimos 10)
    local usb_errors=$(dmesg | grep -i "ttyUSB1\|overrun\|framing\|parity" | tail -5)
    if [ ! -z "$usb_errors" ]; then
        echo "  ⚠️  Errores recientes:"
        echo "$usb_errors" | sed 's/^/    /'
    else
        echo "  ✅ Sin errores en kernel"
    fi
    
    # Verificar procesos usando el puerto
    local processes=$(lsof /dev/ttyUSB1 2>/dev/null)
    if [ ! -z "$processes" ]; then
        echo "  🔧 Procesos usando el puerto:"
        echo "$processes" | sed 's/^/    /'
    else
        echo "  💤 Puerto libre"
    fi
    
    echo ""
}

# Monitoreo continuo
trap 'echo "🛑 Monitoreo detenido"; exit 0' INT

while true; do
    show_stats
    sleep 5
done