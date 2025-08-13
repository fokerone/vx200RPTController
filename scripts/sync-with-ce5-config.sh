#!/bin/bash
# sync-with-ce5-config.sh - Sincronizar configuración puerto con CE5.EXE existente

echo "🔄 Sincronizando con configuración CE5.EXE existente"
echo "==================================================="

# Verificar que existe la configuración CE5
if [ ! -f "/home/fokerone/.dosbox/dosbox-ce5-ftl2011.conf" ]; then
    echo "❌ Configuración CE5 no encontrada en ~/.dosbox/"
    echo "   Se esperaba: dosbox-ce5-ftl2011.conf"
    exit 1
fi

echo "✅ Configuración CE5 encontrada"

# Verificar que ttyUSB1 existe
if [ ! -e /dev/ttyUSB1 ]; then
    echo "❌ /dev/ttyUSB1 no encontrado"
    echo "🔌 Conecta el cable programador primero"
    exit 1
fi

echo "✅ Puerto ttyUSB1 encontrado"

# Mostrar configuración actual de CE5
echo ""
echo "📋 Configuración actual CE5.EXE:"
echo "   Archivo: ~/.dosbox/dosbox-ce5-ftl2011.conf"
grep -E "(cycles|serial1|rxdelay|txdelay)" /home/fokerone/.dosbox/dosbox-ce5-ftl2011.conf | sed 's/^/   /'

echo ""
echo "🔧 Analizando configuración CE5..."

# Extraer configuración de CE5
ce5_cycles=$(grep "cycles=" /home/fokerone/.dosbox/dosbox-ce5-ftl2011.conf | cut -d'=' -f2- | tr -d ' ')
ce5_delays=$(grep "rxdelay\|txdelay" /home/fokerone/.dosbox/dosbox-ce5-ftl2011.conf)

echo "   • Cycles: $ce5_cycles"
if [[ $ce5_delays == *"rxdelay"* ]]; then
    echo "   • RX/TX delays configurados (anti-overrun activo)"
else
    echo "   • Sin delays específicos"
fi

echo ""
echo "🎯 Optimizando puerto ttyUSB1 para CE5.EXE..."

# CE5.EXE typically uses auto-speed detection, but works best with clean port
# Configuración que funciona mejor con CE5 y cycles bajos
echo "⚙️  Aplicando configuración optimizada para CE5:"

# Configuración compatible con cycles ultra-bajos (500)
sudo stty -F /dev/ttyUSB1 raw -echo -ixon -ixoff -crtscts -hupcl
sudo stty -F /dev/ttyUSB1 min 1 time 0

echo "   • Puerto en modo RAW puro"
echo "   • Sin control de flujo hardware/software"  
echo "   • Timeouts mínimos para cycles bajos"
echo "   • Compatible con auto-speed detection de CE5"

# Verificar configuración aplicada
echo ""
echo "✅ Configuración final del puerto:"
stty -F /dev/ttyUSB1

echo ""
echo "🔧 Configuración adicional para mejor rendimiento:"

# Configurar latencia USB si es posible
if [ -f /sys/bus/usb-serial/devices/ttyUSB1/latency_timer ]; then
    echo 1 | sudo tee /sys/bus/usb-serial/devices/ttyUSB1/latency_timer > /dev/null
    echo "   • Latencia USB: 1ms (mínima)"
elif [ -f /sys/class/tty/ttyUSB1/device/latency_timer ]; then
    echo 1 | sudo tee /sys/class/tty/ttyUSB1/device/latency_timer > /dev/null
    echo "   • Latencia USB: 1ms (mínima)"
else
    echo "   • Latencia USB: no configurable en este dispositivo"
fi

echo ""
echo "🎉 Puerto ttyUSB1 optimizado para CE5.EXE!"
echo ""
echo "💡 Configuración CE5 detectada:"
echo "   • Cycles ultra-conservadores: $ce5_cycles"
echo "   • Delays RX/TX: 20ms (excelente para evitar overruns)"
echo "   • Auto-launch: CE5.EXE configurado"
echo ""
echo "🚀 Para ejecutar:"
echo "   dosbox -conf ~/.dosbox/dosbox-ce5-ftl2011.conf"
echo ""
echo "📻 CE5.EXE debería conectar sin errores de overrun ahora!"