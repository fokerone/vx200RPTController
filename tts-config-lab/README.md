# 🎙️ TTS Configuration Lab

Laboratorio interactivo para experimentar con configuraciones de Text-to-Speech usando espeak.

## 🚀 Inicio Rápido

```bash
cd tts-config-lab
npm install
npm start
```

Abre tu navegador en: **http://localhost:3001**

## ✨ Características

### 🎛️ Controles Interactivos
- **Voz**: 10 tipos diferentes (masculino, femenino, susurro, etc.)
- **Velocidad**: 80-300 palabras por minuto
- **Tono**: 0-99 (grave a agudo)
- **Volumen**: 0-200 amplitud
- **Pausas**: 0-10 gaps entre palabras
- **Énfasis**: 0-20 capitalización

### 🎯 Presets Incluidos
- **Natural**: Voz suave y natural
- **Clara**: Máxima claridad para comunicaciones
- **Robótica**: Estilo clásico espeak
- **Radio**: Estilo comunicaciones de radio

### 🔧 Funcionalidades
- ✅ Preview en tiempo real
- ✅ Generación de audio WAV
- ✅ Reproducción automática
- ✅ Post-procesamiento con sox (opcional)
- ✅ Exportación de configuración JSON
- ✅ Limpieza automática de archivos

## 🎯 Cómo Usar

1. **Selecciona un preset** o ajusta manualmente los parámetros
2. **Escribe tu texto** de prueba
3. **Genera el audio** con el botón "Generar Audio"
4. **Reproduce** para escuchar el resultado
5. **Ajusta** los parámetros hasta que te guste
6. **Exporta** la configuración final

## 📁 Estructura

```
tts-config-lab/
├── index.html          # Interfaz web
├── server.js           # Servidor Express
├── package.json        # Dependencias
├── temp/               # Archivos de audio temporales
└── README.md          # Esta documentación
```

## 🛠️ Dependencias del Sistema

### Requeridas
- **espeak**: Motor de text-to-speech
- **Node.js**: Runtime de JavaScript

### Opcionales
- **sox**: Post-procesamiento de audio (mejor calidad)
- **paplay/aplay**: Reproducción de audio

### Instalación en Arch Linux
```bash
sudo pacman -S espeak sox pulseaudio-utils alsa-utils
```

## ⚙️ API Endpoints

### POST /generate-speech
Genera archivo de audio desde texto y configuración.

**Request:**
```json
{
  "text": "Texto a convertir",
  "config": {
    "voice": "es+f4",
    "speed": 160,
    "pitch": 50,
    "amplitude": 85,
    "gaps": 4,
    "emphasis": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "filename": "tts_1234567890.wav",
  "path": "/temp/tts_1234567890.wav",
  "command": "espeak -v es+f4 -s 160 -a 85 -p 50 -g 4 -k 10 -w output.wav texto"
}
```

### POST /play-audio/:filename
Reproduce un archivo de audio generado.

### GET /system-info
Información sobre herramientas disponibles en el sistema.

## 🎛️ Configuración Detallada

### Tipos de Voz
- `es`: Español estándar
- `es+f1-f4`: Voces femeninas (suave a muy alto)
- `es+m1-m3`: Voces masculinas (bajo a alto)
- `es+whisper`: Susurro
- `es+croak`: Ronco

### Parámetros Espeak
- `-v`: Voz (voice)
- `-s`: Velocidad en wpm (speed)
- `-a`: Amplitud/volumen (amplitude)
- `-p`: Tono/pitch
- `-g`: Gaps entre palabras
- `-k`: Énfasis en capitalización

### Post-procesamiento Sox
- Normalización de ganancia
- Equalización sutil
- Mejora de sample rate
- Limpieza de ruido

## 📤 Exportación

La configuración se exporta como JSON:

```json
{
  "voice": "es+f4",
  "speed": 140,
  "pitch": 45,
  "amplitude": 85,
  "gaps": 4,
  "emphasis": 10
}
```

Puedes usar esta configuración directamente en tu sistema VX200.

## 🧹 Mantenimiento

- Los archivos de audio se eliminan automáticamente después de 10 minutos
- La limpieza se ejecuta cada 5 minutos
- Los archivos se almacenan en `./temp/`

## 🎯 Próximos Pasos

1. Experimenta con diferentes configuraciones
2. Prueba con textos reales de tu sistema
3. Exporta tu configuración favorita
4. Implementa la configuración en VX200 Controller

---

**¡Disfruta configurando la voz perfecta para tu sistema VX200! 🎉**