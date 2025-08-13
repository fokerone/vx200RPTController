#!/bin/bash
# vertex-ftl2011-fix.sh - Solución completa para errores Overrun RX

echo "📻 VERTEX FTL2011 - Solucionador de Errores Serie"
echo "================================================="
echo ""

cd /home/fokerone/vx200RPTController

# Menú principal
while true; do
    echo "🎯 Selecciona una opción:"
    echo ""
    echo "1) 🔧 Aplicar configuración optimizada (19200 8N1)"
    echo "2) ⚡ Sincronizar con configuración CE5.EXE existente"
    echo "3) 🧪 Probar múltiples configuraciones"
    echo "4) 🔍 Monitorear errores en tiempo real"
    echo "5) 🚀 Ejecutar CE5.EXE para FTL2011"
    echo "6) 📋 Ver estado actual del puerto"
    echo "7) 📖 Ver guía completa de troubleshooting"
    echo "8) ❌ Salir"
    echo ""
    read -p "Opción (1-8): " choice

    case $choice in
        1)
            echo ""
            echo "🔧 Aplicando configuración optimizada para Vertex FTL2011..."
            ./scripts/setup-vertex-ftl2011.sh
            echo ""
            echo "✅ Configuración aplicada. Ahora prueba CE5.EXE con opción 5"
            echo ""
            ;;
        2)
            echo ""
            echo "⚡ Sincronizando con configuración CE5.EXE existente..."
            ./scripts/sync-with-ce5-config.sh
            echo ""
            echo "✅ Puerto sincronizado con CE5. Usa opción 5 para ejecutar"
            echo ""
            ;;
        3)
            echo ""
            echo "🧪 Probando múltiples configuraciones..."
            echo "   Cambia a DOSBox cuando veas la configuración que quieres probar"
            ./scripts/test-vertex-ftl2011.sh
            echo ""
            ;;
        4)
            echo ""
            echo "🔍 Iniciando monitor de errores..."
            echo "   Presiona Ctrl+C en el monitor para volver al menú"
            ./scripts/monitor-serial-errors.sh
            echo ""
            ;;
        5)
            echo ""
            echo "🚀 Ejecutando DOSBox con CE5.EXE para FTL2011..."
            if [ -f "/home/fokerone/.dosbox/dosbox-ce5-ftl2011.conf" ]; then
                echo "✅ Usando configuración existente CE5 optimizada:"
                echo "   • CE5.EXE montado automáticamente"
                echo "   • Cycles: 500 (ultra-conservadores para evitar overruns)"
                echo "   • RX/TX delays: 20ms cada uno"
                echo "   • COM1 → ttyUSB1 pre-configurado"
                echo "   • Software: Vertex Collection ya montado"
                echo ""
                echo "📻 Iniciando CE5.EXE para FTL2011..."
                dosbox -conf ~/.dosbox/dosbox-ce5-ftl2011.conf
            else
                echo "❌ Configuración CE5 no encontrada en ~/.dosbox/"
                echo "🔄 Intentando configuración alternativa..."
                if [ -f "configs/dosbox-vertex-ftl2011.conf" ]; then
                    echo "   Usando configuración genérica..."
                    dosbox -conf configs/dosbox-vertex-ftl2011.conf
                else
                    echo "❌ No hay configuraciones disponibles"
                    echo "   Ejecuta primero la opción 1 para configuración básica"
                fi
            fi
            echo ""
            ;;
        6)
            echo ""
            echo "📋 Estado actual del puerto ttyUSB1:"
            if [ -e /dev/ttyUSB1 ]; then
                echo "✅ Puerto existe"
                echo "⚙️  Configuración:"
                stty -F /dev/ttyUSB1
                echo ""
                echo "🔧 Permisos:"
                ls -la /dev/ttyUSB1
                echo ""
                echo "📊 Configuración detallada:"
                stty -F /dev/ttyUSB1 -a | grep -E "(speed|cs8|parenb|cstopb)"
            else
                echo "❌ Puerto /dev/ttyUSB1 no encontrado"
                echo "🔌 ¿Está conectado el cable programador?"
            fi
            echo ""
            ;;
        7)
            echo ""
            echo "📖 Abriendo guía de troubleshooting..."
            if command -v less >/dev/null 2>&1; then
                less docs/VERTEX_FTL2011_TROUBLESHOOTING.md
            elif command -v more >/dev/null 2>&1; then
                more docs/VERTEX_FTL2011_TROUBLESHOOTING.md
            else
                cat docs/VERTEX_FTL2011_TROUBLESHOOTING.md
            fi
            echo ""
            ;;
        8)
            echo ""
            echo "👋 ¡Que tengas éxito programando tu Vertex FTL2011!"
            echo ""
            exit 0
            ;;
        *)
            echo ""
            echo "❌ Opción inválida. Selecciona 1-8"
            echo ""
            ;;
    esac
done