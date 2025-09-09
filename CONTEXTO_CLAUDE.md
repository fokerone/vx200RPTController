# Contexto VX200 Controller - Claude Sessions

## 📡 Información del Proyecto

**Proyecto:** VX200 Controller - Sistema de control para repetidora simplex  
**Versión Actual:** v2.9.0 (Septiembre 2025)  
**Autor:** LU5MCD (fokerone@gmail.com)  
**Estado:** Producción activa 24/7  

## 🏗️ Arquitectura del Sistema

### **Sistema Headless v2.7+**
- **Sin dashboard web**: Eliminado en v2.7.0, solo interfaz consola
- **Mapa APRS liviano**: Única interfaz web en puerto 3000
- **Servidor HTTP nativo**: Sin Express.js, optimizado para recursos limitados
- **APIs REST**: `/api/positions` y `/api/repeater` para integración externa

### **Componentes Principales**

#### **Core (src/)**
- `index.js`: VX200Controller principal con inicialización ordenada en fases
- `constants.js`: Constantes del sistema (DTMF, AUDIO, MODULE_STATES, etc.)
- `config/`: Sistema de configuración híbrido implementado en v2.9.0

#### **Sistema de Configuración Híbrido (v2.9.0)**
- `ConfigurationService.js`: Nuevo sistema con herencia y notación de punto
- `ConfigManager.js`: Sistema anterior mantenido como fallback
- `ConfigCompat.js`: Capa de compatibilidad para migración gradual
- `index.js`: Wrapper híbrido que prioriza nuevo sistema con fallback automático

#### **Audio (src/audio/)**
- `audioManager.js`: Gestor de audio con lógica simplex completa
- `dtmfDecoder.js`: Decodificador DTMF profesional con anti-falsos positivos
- `HybridVoiceManager.js`: Sistema TTS híbrido Google+espeak (v2.8.0)
- `rogerBeep.js`: Roger Beep estilo Kenwood configurable

#### **Módulos Funcionales (src/modules/)**
- `baliza.js`: Baliza con secuencia BBC pips sincronizada (v2.9.0)
- `datetime.js`: Anuncios de fecha y hora (*1)
- `weather.js`: Información meteorológica (*4)
- `weather-voice.js`: Clima con voz natural (*5)
- `weatherAlerts.js`: Alertas SMN Argentina con monitoreo automático (*7, *0)
- `inpres.js`: Monitoreo sísmico INPRES en tiempo real (*3)
- `aprs.js`: Sistema APRS con Direwolf TNC
- `ddns.js`: DNS dinámico DuckDNS (v2.8.0)

#### **Utilidades (src/utils/)**
- `direwolfManager.js`: Gestor TNC Software
- `mendozaCityMatcher.js`: Filtrado geográfico Mendoza
- `claudeSpeechToText.js`: Integración Claude (experimental)

#### **APRS Map (src/aprs-map/)**
- `server.js`: Servidor HTTP nativo minimalista
- `map.html`: Interfaz Bootstrap 5 + Leaflet.js responsive

## 🎛️ Comandos DTMF Activos

| Comando | Módulo | Función |
|---------|--------|---------|
| `*1` | DateTime | Fecha y hora actual |
| `*3` | INPRES | Sismos >4.0 del día en Mendoza |
| `*4` | Weather | Clima actual (datos) |
| `*5` | Weather Voice | Clima con voz natural |
| `*7` | Weather Alerts | Alertas meteorológicas activas |
| `*0` | Weather Alerts | Forzar verificación manual SMN |
| `*9` | Baliza | Baliza manual + BBC pips |

## 🔄 Últimos Commits Relevantes

### v2.9.0 (Sep 2, 2025)
- **c4e1229**: docs: Actualizar README para v2.9.0 con sistema híbrido y BBC pips
- **c85a7f4**: feat: Sistema de configuración híbrido y baliza BBC pips

### v2.8.0 (Ago 23, 2025)
- **eebadd4**: feat: Release v2.8.0 - Sistema TTS Híbrido con Lógica Simplex Avanzada

### v2.7.0 (Ago 22, 2025)
- **27ba47c**: Release v2.7.0: Sistema Headless con Mapa APRS Completo

## 🚀 Características Técnicas Clave

### **Sistema TTS Híbrido (v2.8.0)**
- **Google TTS**: Motor principal con voz natural
- **Fallback automático**: espeak para máxima confiabilidad
- **Fragmentación inteligente**: ffmpeg para textos largos
- **Lógica simplex**: Pausa recepción durante transmisión
- **Anti-falsos positivos**: Eliminados completamente los falsos DTMF

### **Baliza BBC Pips (v2.9.0)**
- **Secuencia estándar**: 5 tonos cortos (100ms) + 1 largo (500ms)
- **Frecuencia**: 1000Hz estándar internacional
- **Sincronización**: Transmite exactamente en horas de reloj
- **Patrón temporal**: corto-900ms-corto-900ms-corto-900ms-corto-900ms-corto-900ms-largo

### **Monitoreo Automático**
- **SMN Alertas**: Cada 90 minutos con cobertura completa Mendoza
- **INPRES Sísmico**: Cada 20 minutos, sismos >4.0 magnitud
- **DuckDNS**: Actualización DNS cada 5 minutos
- **APRS Beacons**: Transmisión programable con datos enriquecidos

### **Mapa APRS Interactivo**
- **Datos enriquecidos**: Speed, Course, Altitude, Audio Level, Error Rate
- **Marcadores grandes**: 32px optimizados para móviles
- **Actualización**: Automática cada 30 segundos
- **Responsive**: Bootstrap 5 con diseño moderno
- **Charts**: Canvas HTML5 para altitud dinámica

## 📁 Estructura de Archivos Importante

```
vx200RPTController/
├── src/index.js                    # Controlador principal
├── src/config/
│   ├── index.js                    # Config híbrido wrapper
│   ├── ConfigurationService.js     # Nuevo sistema v2.9.0
│   ├── ConfigManager.js           # Sistema anterior (fallback)
│   └── ConfigCompat.js            # Compatibilidad migración
├── src/audio/
│   ├── audioManager.js            # Lógica simplex completa
│   ├── HybridVoiceManager.js      # TTS Google+espeak
│   └── dtmfDecoder.js             # Anti-falsos positivos
├── src/modules/
│   ├── baliza.js                  # BBC pips v2.9.0
│   ├── weatherAlerts.js           # SMN automatizado
│   └── inpres.js                  # Monitoreo sísmico
├── src/aprs-map/
│   ├── server.js                  # HTTP nativo liviano
│   └── map.html                   # Bootstrap 5 + Leaflet
├── config/config.json             # Configuración base
├── .env                           # Variables entorno
└── README.md                      # Documentación completa
```

## ⚙️ Variables de Entorno Críticas

```env
# Sistema
CALLSIGN=LU5MCD
NODE_ENV=production
APRS_MAP_PORT=3000

# Audio
AUDIO_DEVICE=default
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNEL_THRESHOLD=0.02

# TTS Híbrido
TTS_VOICE=es+f3
TTS_SPEED=160

# APRS
APRS_ENABLED=true
APRS_CALLSIGN=YOSHUA
APRS_BEACON_INTERVAL=15

# APIs Externas
OPENWEATHER_API_KEY=tu_api_key
```

## 🐛 Problemas Conocidos Resueltos

### v2.8.0 Fixes
- ✅ **Falsos positivos DTMF**: Eliminados con lógica simplex
- ✅ **Audio cortado alertas**: Sistema fallback secuencial
- ✅ **Duplicación marcadores**: Fix en mapa APRS
- ✅ **DuckDNS no funcional**: Implementación completa

### v2.9.0 Mejoras
- ✅ **Sistema configuración**: Híbrido con compatibilidad total
- ✅ **Baliza BBC**: Sincronización horaria perfecta
- ✅ **Limpieza archivos**: Eliminación automática temp/

## 🎯 Estado Actual del Sistema

**✅ PRODUCCIÓN ESTABLE 24/7**
- Sistema headless optimizado para servidores
- Monitoreo automático múltiples fuentes
- Lógica simplex sin falsos positivos
- TTS híbrido con fallback robusto
- Configuración híbrida con migración gradual
- Baliza BBC pips sincronizada perfectamente

## 🔧 Comandos de Mantenimiento

```bash
# Iniciar sistema
npm start

# Verificar salud
npm run health

# Lint y formato
npm run code-quality
npm run code-fix

# Monitoreo logs
tail -f logs/*.log

# Estado git
git status
git log --oneline -5

# APRS Map
curl http://localhost:3000/api/positions
```

---
**Generado:** 2025-09-09  
**Claude Sessions:** Contexto completo para futuras sesiones de desarrollo