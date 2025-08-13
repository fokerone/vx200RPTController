#!/bin/bash
# test-vertex-ftl2011.sh - Probar configuraciones para Vertex FTL2011

echo "📻 Configuraciones de prueba para Vertex FTL2011"
echo "================================================"

# Configuraciones comunes para radios Vertex/Motorola comerciales
configs=(
    "19200 cs8 -cstopb -parenb"     # 19200 8N1 - Común en radios modernos
    "9600 cs8 -cstopb parenb -parodd"   # 9600 8E1 - Paridad par
    "9600 cs8 -cstopb parenb parodd"    # 9600 8O1 - Paridad impar  
    "4800 cs8 -cstopb -parenb"      # 4800 8N1 - Radios antiguos
    "2400 cs8 -cstopb -parenb"      # 2400 8N1 - Muy antiguos
    "38400 cs8 -cstopb -parenb"     # 38400 8N1 - Algunos CPS modernos
)

config_names=(
    "19200 8N1 (moderno)"
    "9600 8E1 (paridad par)"
    "9600 8O1 (paridad impar)"
    "4800 8N1 (antiguo)"
    "2400 8N1 (muy antiguo)"
    "38400 8N1 (CPS moderno)"
)

if [ ! -e /dev/ttyUSB1 ]; then
    echo "❌ /dev/ttyUSB1 no encontrado"
    echo "🔌 Conecta el cable RIB/programador primero"
    exit 1
fi

echo "🔧 Probando configuraciones para Vertex FTL2011..."
echo ""

for i in "${!configs[@]}"; do
    config="${configs[$i]}"
    name="${config_names[$i]}"
    
    echo "⚙️  Probando: $name"
    echo "   Comando: stty -F /dev/ttyUSB1 $config raw -echo"
    
    # Aplicar configuración
    sudo stty -F /dev/ttyUSB1 $config raw -echo
    
    # Mostrar configuración aplicada
    echo "   Resultado:"
    stty -F /dev/ttyUSB1 | sed 's/^/     /'
    
    echo "   ⏱️  Espera 3 segundos para probar en DOSBox..."
    sleep 3
    echo ""
done

echo "🎯 Para usar con DOSBox:"
echo "1. Ejecuta este script"
echo "2. Cuando veas la configuración que quieres probar, cambia a DOSBox"
echo "3. Intenta conectar con el software CPS"
echo "4. Si no funciona, vuelve aquí para la siguiente configuración"
echo ""
echo "💡 Configuración más probable para Vertex FTL2011: 19200 8N1"
echo ""
echo "🔧 Para aplicar configuración específica manualmente:"
echo "   sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo"