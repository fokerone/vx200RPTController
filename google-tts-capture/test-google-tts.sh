#!/bin/bash

echo "🧪 === TEST GOOGLE TTS METHODS ==="
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para test con timestamp
test_method() {
    local method=$1
    local description=$2
    
    echo -e "${BLUE}🔧 Probando: $description${NC}"
    echo "Comando: $method"
    echo "Timestamp: $(date)"
    echo ""
    
    eval $method
    local result=$?
    
    if [ $result -eq 0 ]; then
        echo -e "${GREEN}✅ $description - ÉXITO${NC}"
    else
        echo -e "${RED}❌ $description - FALLÓ${NC}"
    fi
    
    echo "----------------------------------------"
    return $result
}

# Test 1: Verificar dependencias del sistema
echo -e "${YELLOW}📋 Verificando dependencias del sistema...${NC}"

check_dependency() {
    if command -v $1 &> /dev/null; then
        echo -e "✅ $1 disponible"
        return 0
    else
        echo -e "❌ $1 NO disponible"
        return 1
    fi
}

check_dependency "python3"
check_dependency "pip3"
check_dependency "curl"
check_dependency "paplay"
check_dependency "node"

echo ""

# Test 2: Instalar gTTS si no está
echo -e "${YELLOW}📦 Verificando/Instalando gTTS...${NC}"
if ! python3 -c "import gtts" 2>/dev/null; then
    echo "📦 Instalando gTTS..."
    pip3 install gTTS --user
else
    echo "✅ gTTS ya está instalado"
fi

echo ""

# Test 3: Método Simple gTTS
test_method "node simple-google-tts.js 'Esta es una prueba con gTTS de Python. El clima actual es soleado.'" "Simple Google TTS (gTTS)"

# Test 4: Método directo con curl
echo -e "${BLUE}🔧 Probando: Descarga directa con curl${NC}"
TEST_TEXT="Hola, esta es una prueba directa de Google TTS"
ENCODED_TEXT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_TEXT'))")
CURL_URL="https://translate.google.com/translate_tts?ie=UTF-8&tl=es&client=tw-ob&q=$ENCODED_TEXT"

echo "URL: $CURL_URL"

curl -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
     -s \
     -o "temp/curl_test.mp3" \
     "$CURL_URL"

if [ -f "temp/curl_test.mp3" ] && [ -s "temp/curl_test.mp3" ]; then
    echo -e "${GREEN}✅ Descarga directa - ÉXITO${NC}"
    echo "🔊 Reproduciendo..."
    paplay temp/curl_test.mp3 2>/dev/null || echo "ℹ️ Reproducción no disponible"
else
    echo -e "${RED}❌ Descarga directa - FALLÓ${NC}"
fi

echo "----------------------------------------"

# Test 5: Test de calidad de audio
echo -e "${BLUE}🎵 Análisis de calidad de audio...${NC}"

for file in temp/*.mp3; do
    if [ -f "$file" ]; then
        filesize=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        echo "📄 $(basename $file): $filesize bytes"
        
        # Analizar con soxi si está disponible
        if command -v soxi &> /dev/null; then
            echo "🔍 Información técnica:"
            soxi "$file" 2>/dev/null || echo "   Información no disponible"
        fi
    fi
done

echo ""

# Test 6: Test de reproducción masiva
echo -e "${YELLOW}🎯 Test de diferentes textos...${NC}"

TEXTS=(
    "El clima actual en Buenos Aires es soleado con veinte grados centígrados"
    "Bienvenido al sistema VX200 Controller, la hora actual son las catorce horas treinta minutos"
    "Roger, cambio y fuera"
    "Estación base a todas las móviles, prueba de radio check"
)

for i in "${!TEXTS[@]}"; do
    echo "Test $((i+1)): ${TEXTS[i]:0:50}..."
    
    node -e "
        const SimpleGoogleTTS = require('./simple-google-tts.js');
        const tts = new SimpleGoogleTTS();
        
        (async () => {
            const success = await tts.generateSpeech('${TEXTS[i]}', 'temp/test_$((i+1)).mp3');
            console.log(success ? '✅ Generado' : '❌ Error');
        })();
    "
done

echo ""

# Test 7: Benchmark de velocidad
echo -e "${YELLOW}⏱️ Benchmark de velocidad...${NC}"

echo "Midiendo tiempo de generación..."
time node simple-google-tts.js "Esta es una prueba de velocidad para medir el tiempo de generación de audio con Google TTS" > /dev/null 2>&1

echo ""

# Resumen final
echo -e "${BLUE}📊 === RESUMEN FINAL ===${NC}"
echo "Archivos generados en temp/:"
ls -la temp/ 2>/dev/null || echo "Directorio temp no existe"

echo ""
echo -e "${GREEN}🎉 Test completado$(NC)"
echo "Revisa los archivos de audio en el directorio temp/"
echo "Usa 'paplay temp/[archivo].mp3' para reproducir manualmente"