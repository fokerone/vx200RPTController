# 🎤 Comando Weather por Voz (*43) - VX200 Controller

## 🎯 Funcionalidad Implementada

El comando `*43` permite al usuario especificar cualquier ciudad argentina mediante reconocimiento de voz y obtener su clima actual.

### 🔄 Flujo de Uso

1. **Usuario marca**: `*43`
2. **Sistema responde**: 🎵 Tono + *"Diga el nombre de la ciudad después del tono"*
3. **Usuario habla**: *"Buenos Aires"* (o cualquier ciudad argentina)
4. **Sistema procesa**: 
   - Captura 8 segundos de audio
   - Transcribe con OpenAI Whisper
   - Busca ciudad con matching inteligente
   - Obtiene clima de Open-Meteo API
5. **Sistema responde**: *"Clima actual en Buenos Aires. Temperatura 22 grados..."*

## 🏗️ Arquitectura Técnica

### 📁 Archivos Creados

- **`src/utils/speechToText.js`** - Cliente OpenAI Whisper para transcripción
- **`src/utils/cityMatcher.js`** - Matcher de 32 ciudades argentinas con fuzzy matching
- **`src/modules/weather-voice.js`** - Módulo Weather extendido con comando *43

### 🔧 Componentes

#### 1. SpeechToText (Whisper)
```javascript
const speechToText = getSpeechToText();
const text = await speechToText.transcribeBuffer(audioBuffer, 'wav');
```

#### 2. CityMatcher (32 ciudades)
```javascript
const cityMatcher = getCityMatcher();
const city = cityMatcher.findCity('buenos aires'); // → Buenos Aires data
```

#### 3. WeatherVoice (Integración completa)
```javascript
// Comando *43 maneja todo el flujo:
// Prompt → Captura → STT → Match → Weather → TTS
```

## 🌍 Ciudades Soportadas

### 🏙️ Principales (32 ciudades)
- **Buenos Aires** (Capital Federal)
- **Córdoba** - Aliases: "cordoba capital"
- **Rosario** (Santa Fe)
- **Mendoza** - Aliases: "mendoza capital"
- **La Plata** - Aliases: "plata"
- **Mar del Plata** - Aliases: "mardel", "mardelplata"
- **Salta** - Aliases: "salta capital"
- **Bariloche** - Aliases: "san carlos de bariloche"
- **Tucumán** - Aliases: "san miguel de tucuman"
- **Y 23 ciudades más...** (todas las capitales provinciales + importantes)

### 🧠 Matching Inteligente
- **Exacto**: "mendoza" → Mendoza
- **Aliases**: "baires" → Buenos Aires
- **Parcial**: "mar de plata" → Mar del Plata  
- **Fuzzy**: "cordobaa" → Córdoba (tolerancia a errores)

## 🎛️ Panel Web Actualizado

**Módulo Clima** ahora tiene 3 botones:
- **Actual** - Clima actual Mendoza (*4)
- **24h** - Pronóstico 24h Mendoza (*42)
- **🎤 Voz** - Clima por ciudad hablada (*43)

## ⚙️ Configuración

### Variables de Entorno
```bash
# OpenAI API para Whisper (speech-to-text)
OPENAI_API_KEY=tu-api-key-openai

# OpenWeatherMap API (opcional, usa Open-Meteo por defecto)  
OPENWEATHER_API_KEY=tu-api-key-weather
```

### Comandos DTMF Disponibles
- `*4` o `*41` → Clima actual Mendoza
- `*42` → Pronóstico 24h Mendoza  
- `*43` → **Clima por voz** (cualquier ciudad argentina)

## 🔊 Ejemplos de Uso Real

### Ejemplo 1: Buenos Aires
```
Usuario: [Marca *43]
Sistema: 🎵 "Diga el nombre de la ciudad después del tono" 🎵
Usuario: [Habla] "Buenos Aires"
Sistema: "Clima actual en Buenos Aires. Temperatura 18 grados. 
         Sensación térmica 16 grados. Nublado. Humedad 75 por ciento. 
         Viento a 25 kilómetros por hora."
```

### Ejemplo 2: Variaciones de entrada
```
Usuario dice: "baires" → Sistema encuentra: Buenos Aires
Usuario dice: "mardel" → Sistema encuentra: Mar del Plata  
Usuario dice: "bariloche" → Sistema encuentra: San Carlos de Bariloche
Usuario dice: "ciudad inventada" → Sistema: "No se encontró la ciudad..."
```

## 🛠️ Especificaciones Técnicas

### Audio
- **Formato**: WAV, 16kHz (optimizado para Whisper)
- **Duración captura**: 8 segundos
- **Timeout total**: 15 segundos

### APIs
- **Speech-to-Text**: OpenAI Whisper (modelo whisper-1)
- **Weather**: Open-Meteo (gratuito, sin API key)
- **Backup Weather**: OpenWeatherMap (con API key)

### Cache
- **Duración**: 10 minutos por ciudad
- **Ciudades únicas**: Cache independiente por coordenadas

### Manejo de Errores
- ✅ Sin API key OpenAI → Error claro
- ✅ Audio no capturado → Reintentar
- ✅ Ciudad no reconocida → Lista de sugerencias  
- ✅ Error de red → Mensaje de error

## 🚀 Para Usar en Producción

1. **Obtener API key OpenAI**: https://platform.openai.com/api-keys
2. **Configurar `.env`**: Agregar `OPENAI_API_KEY=...`
3. **Probar con radio**: Marcar `*43` y hablar ciudad
4. **Ajustar si necesario**: Timeout, ciudades, etc.

## 💡 Próximas Mejoras Posibles

- 🌎 **Más países**: Agregar ciudades de otros países sudamericanos
- 🎯 **Mejor fuzzy matching**: Algoritmos más sofisticados
- ⚡ **Cache inteligente**: Predicción de ciudades populares
- 🔊 **Mejor captura**: Filtros de ruido y mejora de audio
- 📊 **Métricas**: Log de ciudades más consultadas

---

🎉 **¡El comando `*43` está listo para usar con equipos VHF reales!**