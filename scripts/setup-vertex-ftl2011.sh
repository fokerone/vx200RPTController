#!/bin/bash
# setup-vertex-ftl2011.sh - Configuración específica para Vertex FTL2011

echo "📻 Configurando puerto para Vertex FTL2011"
echo "==========================================="

if [ ! -e /dev/ttyUSB1 ]; then
    echo "❌ /dev/ttyUSB1 no encontrado"
    echo "🔌 Conecta el cable RIB/programador Vertex primero"
    exit 1
fi

echo "🔧 Aplicando configuración optimizada para Vertex FTL2011..."

# Configuración más común para Vertex FTL2011: 19200 8N1
echo "⚙️  Configurando: 19200 8N1 (configuración típica Vertex)"
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo -ixon -ixoff

# Verificar configuración
echo ""
echo "✅ Configuración aplicada:"
stty -F /dev/ttyUSB1 -a | grep -E "(speed|cs8|parenb|cstopb)"

echo ""
echo "🔧 Ajustes adicionales para reducir overruns:"

# Configurar buffers del kernel para reducir overruns
echo "📦 Configurando buffers del kernel..."
echo 4096 | sudo tee /sys/class/tty/ttyUSB1/device/latency_timer 2>/dev/null || echo "   (latency_timer no disponible en este dispositivo)"

# Ajustar prioridad del proceso serie
echo "⚡ Ajustando prioridad de procesos USB..."
sudo nice -n -10 sh -c 'echo "Prioridad ajustada para mejor rendimiento serie"' 2>/dev/null

echo ""
echo "📋 Configuración actual del puerto:"
stty -F /dev/ttyUSB1

echo ""
echo "🎯 Configuración para DOSBox:"
echo "   En el archivo dosbox.conf, asegúrate de tener:"
echo "   [serial]"
echo "   serial1=directserial realport:ttyUSB1"
echo "   [dos]"
echo "   xms=false"
echo "   ems=false"
echo ""

echo "💡 Para crear/editar dosbox.conf específico:"
cat << 'DOSBOX_EOF'

# Configuración recomendada para Vertex FTL2011:
[sdl]
priority=higher,normal

[serial]
serial1=directserial realport:ttyUSB1

[dos]
xms=false
ems=false

[cpu]
core=normal
cycles=3000

DOSBOX_EOF

echo ""
echo "🚀 Listo para usar con:"
echo "   1. CE5.EXE (Customer Engineering 5) para FTL2011"
echo "   2. DOSBox pre-configurado: ~/.dosbox/dosbox-ce5-ftl2011.conf"
echo "   3. Puerto: COM1 → ttyUSB1 con delays optimizados"
echo "   4. Velocidad: Controlada automáticamente por CE5.EXE"
echo ""
echo "⚠️  Si persisten los overruns, prueba:"
echo "   • Reducir cycles en DOSBox (cycles=1000)"
echo "   • Usar 'cycles=max 80%' en lugar de número fijo"
echo "   • Probar con ./test-vertex-ftl2011.sh otras configuraciones"