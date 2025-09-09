# VX200 Controller

## 📡 Sistema de Control para Repetidora Headless v2.9.1

Sistema completo de control inteligente para repetidora simplex desarrollado en Node.js. **Versión Headless** con interfaz APRS liviana, decodificación DTMF profesional con anti-falsos positivos, múltiples servicios automatizados, monitoreo sísmico INPRES en tiempo real y **sistema TTS híbrido con Google TTS**.

**🚀 Versión 2.9.1 - Mejoras Críticas en Alertas Meteorológicas TTS**

### 📅 **Novedades v2.9.1** (Septiembre 2025)
- **🎙️ Mejora Flujo TTS Multiple Alertas**: Corregido flujo de mensaje para múltiples alertas meteorológicas
- **⏸️ Pausas Mejoradas**: Implementadas pausas adecuadas entre alertas usando puntos en lugar de comas
- **🔄 Estructura Mensaje Optimizada**: Eliminados saltos abruptos de timing a fuente SMN
- **🕐 Formato 24h Perfeccionado**: Sin palabra "horas" para pronunciación TTS más natural
- **📅 Días Específicos**: Reemplazado "mañana" por nombres de días específicos (ej: "miércoles 10")
- **📡 Fuente SMN Consistente**: Agregada fuente SMN al final de todos los anuncios
- **🗺️ Áreas Geográficas Precisas**: Identificación específica de zonas dentro de Mendoza

### 📅 **Novedades v2.9.0** (Septiembre 2025)
- **⚙️ Sistema Configuración Híbrido**: Nuevo ConfigurationService con herencia y compatibilidad total con sistema anterior
- **🔊 Baliza BBC Pips**: Implementación de secuencia BBC estándar (5 tonos cortos + 1 largo) sincronizada con horas de reloj
- **🕐 Sincronización Horaria**: Baliza transmite exactamente en horas de reloj para máxima precisión
- **🔄 ConfigCompat**: Capa de compatibilidad que permite migración gradual sin interrupciones
- **🎯 Config Híbrido**: Sistema que usa ConfigurationService como prioritario con fallback al ConfigManager anterior
- **🧹 Limpieza Archivos**: Eliminación automática de archivos temporales de audio para mantener espacio limpio

### 📅 **Novedades v2.8.0** (Agosto 2025)
- **🎙️ Sistema TTS Híbrido**: Google TTS como motor principal con fallback automático a espeak
- **🔀 Lógica Simplex Completa**: Sistema simplex real que pausa recepción durante transmisión
- **❌ Sin Falsos Positivos DTMF**: Eliminados completamente los falsos positivos durante transmisiones TTS
- **⏱️ Timeout Extendido**: Alertas meteorológicas con timeout de 2 minutos para contenido largo
- **🗺️ Marcadores Optimizados**: Eliminadas animaciones pulsantes y emojis internos en marcadores APRS
- **🐛 Fix Duplicación**: Solucionado problema de duplicación infinita del marcador de repetidora
- **📡 DuckDNS Integrado**: Sistema DNS dinámico completamente funcional con actualización automática

### 📅 **Novedades v2.7.0** (Agosto 2025)
- **🖥️ Sistema Completamente Headless**: Eliminado dashboard web completo, ahora funciona solo por consola
- **🗺️ Mapa APRS Liviano**: Nueva interfaz web minimalista con Bootstrap 5 y Leaflet.js
- **📊 Datos Enriquecidos Completos**: Integración total de datos Direwolf (speed, course, altitude, audioLevel, errorRate)
- **📱 Diseño Responsive Avanzado**: Optimizado para dispositivos móviles con iconografía moderna
- **🎯 Marcadores Grandes**: Marcadores de 32px con indicadores visuales mejorados para mejor usabilidad
- **📈 Panel de Información Detallada**: 6 secciones organizadas que aparecen al clickear marcadores
- **⚡ Puerto Optimizado**: Servidor APRS en puerto 3000 para evitar conflictos
- **🔄 Actualización Automática**: Datos actualizados cada 30 segundos
- **📡 APIs REST**: Endpoints `/api/positions` y `/api/repeater` para integración externa

### 🗺️ **Nuevo Mapa APRS Interactivo**
- **Marcadores Visuales**: Indicadores de velocidad, curso, altitud y calidad de señal
- **Información Completa**: Speed (km/h), Course (grados), Altitude (metros), Audio Level, Error Rate
- **Panel Detallado**: Información organizada en secciones al hacer clic en marcadores
- **Charts de Altitud**: Visualización gráfica con Canvas HTML5
- **Cobertura Dinámica**: Círculo de alcance basado en estación más lejana
- **Responsive Design**: Interfaz optimizada para móviles y tablets

### 📅 **Novedades v2.6.2** (Agosto 2025)
- **📍 Fix APRS Posiciones Reales**: Corregido parser para mostrar coordenadas reales transmitidas en lugar de coordenadas fallback del repetidor
- **🗺️ Visualización Completa**: Ahora muestra todas las posiciones únicas transmitidas (11 ubicaciones vs 1-2 anteriormente)
- **📊 Contador Preciso**: Contador de posiciones ahora refleja packets reales recibidos (71) vs posiciones únicas mostradas
- **📡 Parser Mejorado**: Mejorado parser de logs Direwolf para obtener coordenadas exactas por callsign y timestamp
- **🌦️ Fix Audio Alertas Completo**: Solucionado problema de audio cortado en repeticiones de alertas meteorológicas
- **🔊 Playlist Secuencial**: Sistema de fallback que reproduce todos los fragmentos cuando falla combinación ffmpeg
- **⚡ Anti-Truncamiento**: Eliminado fallback que solo reproducía primer fragmento, ahora reproduce mensaje completo siempre

---

## ✨ Características Principales

### 🖥️ **Sistema Headless**
- **Funcionamiento solo por consola** - Sin interfaz web pesada
- **Mapa APRS liviano** como única interfaz web
- **Optimizado para servidores** y dispositivos embebidos
- **Menor consumo de recursos** sin dashboard completo
- **Ideal para implementaciones 24/7** en producción

### 🎵 **Sistema de Audio Avanzado**
- Grabación en tiempo real con soporte ALSA/PulseAudio
- **Decodificador DTMF Profesional** con `dtmf-detection-stream`
- **Anti-falsos positivos** con detección de voz integrada
- **Lógica Simplex Completa** - pausa recepción durante transmisión
- Configuración de sensibilidad (Low/Medium/High)
- Modo debug para desarrollo y pruebas
- Roger Beep estilo Kenwood configurable

### 🎙️ **Sistema TTS Híbrido Avanzado**
- **Google TTS como motor principal** con calidad de voz natural
- **Fallback automático a espeak** para máxima confiabilidad
- **Fragmentación inteligente** para textos largos con ffmpeg
- **Integración con lógica simplex** para evitar falsos positivos DTMF
- **Timeout extendido** (2 minutos) para alertas meteorológicas largas
- **Estadísticas de uso** con tasa de éxito de cada motor TTS
- **Limpieza automática** de archivos temporales

### 📡 **Sistema APRS Completo con Análisis de Cobertura**
- **TNC Software** integrado con Direwolf
- **Historial completo de posiciones** por estación con persistencia
- **Datos enriquecidos completos**: Speed, Course, Altitude, Audio Level, Error Rate
- **180+ símbolos APRS oficiales** con emojis descriptivos
- **Cálculo de distancias** precisas desde repetidora (fórmula Haversine)
- **Círculo de cobertura dinámico** en mapa web
- **Widget en tiempo real** de estación más lejana recibida
- **Detección automática** de nuevas ubicaciones (>100m)
- **Mapa APRS interactivo** con marcadores informativos grandes
- Transmisión de beacons automáticos y manuales
- Estadísticas detalladas de tráfico APRS

### 🗺️ **Mapa APRS Interactivo Moderno**
- **Bootstrap 5** con diseño responsive avanzado
- **Leaflet.js** para mapas interactivos suaves
- **Marcadores grandes** (32px) optimizados para móviles
- **Indicadores visuales** para velocidad, curso, altitud y señal
- **Panel de información detallada** con 6 secciones organizadas
- **Charts de altitud** con Canvas HTML5
- **Actualización automática** cada 30 segundos
- **APIs REST** para integración externa

### 🔊 **Sistema de Módulos**
- **🔊 Baliza BBC Pips**: Secuencia estándar 5 tonos cortos + 1 largo sincronizada con horas de reloj (`*9`)
- **DateTime**: Anuncio de fecha y hora (`*1`)
- **Weather**: Información meteorológica (`*4` actual, `*5` voz)
- **🌦️ Weather Alerts**: Sistema de alertas SMN Argentina (`*7` consultar, `*0` forzar verificación)
- **🌋 INPRES Sísmico**: Monitoreo de sismos INPRES (`*3` consultar sismos del día)

### 🌋 **Sistema de Monitoreo Sísmico INPRES**
- **Monitoreo automático** cada 20 minutos del Instituto Nacional de Prevención Sísmica
- **Filtrado inteligente** sismos >4.0 magnitud en región Mendoza
- **Estados sísmicos diferenciados**: Azul (preliminar), Negro (revisado), Rojo (sentido)
- **Anuncios selectivos** solo sismos revisados/sentidos para evitar falsos positivos
- **Zonificación Mendoza** automática (Capital, Valle de Uco, San Rafael, etc.)
- **Comando DTMF *3** para consulta manual de sismos del día
- **Web scraping robusto** con parsing HTML avanzado

### 🌦️ **Sistema de Alertas Meteorológicas SMN**
- **Monitoreo automático** cada 90 minutos de alertas SMN Argentina
- **Cobertura completa** de la provincia de Mendoza
- **Filtrado geográfico inteligente** por coordenadas y polígonos CAP
- **Anuncios automáticos** con Google TTS + fragmentación para textos largos
- **Integración APRS** con comentarios dinámicos incluyendo clima actual
- **Repetición automática** cada 105 minutos para alertas vigentes

---

## 🚀 Instalación y Configuración

### Prerrequisitos
- **Node.js** 18.x o superior
- **NPM** o Yarn
- **Sistema Linux** (probado en Arch Linux)
- **Hardware de audio** compatible con ALSA
- **Direwolf** (para funcionalidad APRS)

### Instalación Rápida

```bash
# Clonar el repositorio
git clone https://github.com/fokerone/vx200RPTController.git
cd vx200RPTController

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
nano .env  # Editar configuración

# Ejecutar el sistema
npm start
```

### Configuración de Audio

```bash
# Verificar dispositivos disponibles
aplay -l
arecord -l

# Configurar en .env
AUDIO_DEVICE=default  # o hw:0,0 según tu hardware
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNEL_THRESHOLD=0.02
```

### Configuración APRS (Opcional)

```bash
# Instalar Direwolf
sudo pacman -S direwolf  # Arch Linux
sudo apt install direwolf  # Ubuntu/Debian

# Configurar TNC en .env
APRS_ENABLED=true
APRS_CALLSIGN=TU_INDICATIVO
APRS_LOCATION=lat,lon
```

**🗺️ Mapa APRS disponible en: http://localhost:3000**

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# Sistema
CALLSIGN=TU_INDICATIVO
NODE_ENV=production
APRS_MAP_PORT=3000

# Audio
AUDIO_DEVICE=default
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNEL_THRESHOLD=0.02

# TTS
TTS_VOICE=es+f3
TTS_SPEED=160

# Roger Beep
ROGER_BEEP_ENABLED=true
ROGER_BEEP_TYPE=kenwood
ROGER_BEEP_VOLUME=0.7

# Baliza
BALIZA_ENABLED=true
BALIZA_INTERVAL=60
BALIZA_MESSAGE=TU_INDICATIVO Repetidora Simplex

# APRS (Opcional)
APRS_ENABLED=true
APRS_CALLSIGN=YOSHUA
APRS_COMMENT=VX200 RPT
APRS_BEACON_INTERVAL=15

# APIs Opcionales
OPENWEATHER_API_KEY=tu_api_key
```

---

## 🎛️ Comandos DTMF

| Comando | Función | Descripción |
|---------|---------|-------------|
| `*1` | DateTime | Anuncia fecha y hora actual |
| `*3` | **🌋 INPRES Sísmico** | **Consultar sismos >4.0 del día en Mendoza** |
| `*4` | Weather | Clima actual |
| `*5` | Weather Voice | Clima con voz natural |
| `*7` | **🌦️ Weather Alerts** | **Consultar alertas meteorológicas activas** |
| `*0` | **🔄 Force Check** | **Forzar verificación manual de alertas SMN** |
| `*9` | Baliza | Activa baliza manual |

---

## 📁 Estructura del Proyecto

```
vx200RPTController/
├── src/
│   ├── index.js                 # VX200Controller principal
│   ├── constants.js             # Constantes del sistema
│   ├── config/                  # Sistema de configuración
│   ├── logging/                 # Sistema de logging
│   ├── audio/
│   │   ├── audioManager.js      # Gestor de audio completo
│   │   ├── dtmfDecoder.js       # Decodificador DTMF profesional
│   │   ├── HybridVoiceManager.js # Sistema TTS híbrido Google+espeak
│   │   └── rogerBeep.js         # Roger Beep Kenwood
│   ├── modules/
│   │   ├── baliza.js            # Módulo de baliza
│   │   ├── datetime.js          # Módulo fecha/hora
│   │   ├── weather.js           # Módulo meteorológico
│   │   ├── weather-voice.js     # Módulo clima con voz
│   │   ├── weatherAlerts.js     # Módulo alertas meteorológicas
│   │   ├── inpres.js            # Módulo monitoreo sísmico INPRES
│   │   └── aprs.js              # Módulo APRS con Direwolf
│   └── aprs-map/
│       ├── server.js            # Servidor mapa APRS liviano
│       └── map.html             # Interfaz mapa interactivo
├── config/
│   └── default.json             # Configuración por defecto
├── .env.example                 # Template de variables
└── README.md
```

---

## 🗺️ Mapa APRS v2.7.0

### **Características del Mapa**
- **🎯 URL**: `http://localhost:3000`
- **📱 Responsive**: Optimizado para móviles y tablets
- **🔄 Auto-actualización**: Datos frescos cada 30 segundos
- **📊 APIs REST**: `/api/positions` y `/api/repeater`

### **Funcionalidades Destacadas**
- **Marcadores grandes** (32px) fáciles de tocar
- **Indicadores visuales** para velocidad, curso y altitud
- **Panel de información completo** con 6 secciones
- **Charts de altitud** dinámicos con Canvas
- **Círculo de cobertura** basado en estación más lejana
- **Estadísticas en tiempo real** de tráfico APRS

### **Datos Enriquecidos**
- **Speed**: Velocidad en km/h
- **Course**: Rumbo en grados (0-359°)
- **Altitude**: Altitud sobre el nivel del mar
- **Audio Level**: Nivel de señal y estadísticas
- **Error Rate**: Tasa de errores de recepción

---

## 🔧 Scripts Disponibles

```bash
# Iniciar sistema headless completo
npm start

# Modo desarrollo
npm run dev

# Test de salud del sistema
npm run health
```

---

## 🛠️ Características Técnicas v2.7.0

### **Sistema Headless**
- **Servidor liviano**: Solo mapa APRS en puerto 3000
- **Sin dashboard pesado**: Eliminado para mejor rendimiento
- **Optimizado para producción**: Ideal para servidores 24/7
- **APIs REST**: Integración externa simplificada

### **DTMF Profesional**
- **dtmf-detection-stream**: Librería especializada
- **Anti-falsos positivos**: Detección de voz integrada
- **Configuración avanzada**: 3 niveles de sensibilidad
- **Modo debug**: Para desarrollo y troubleshooting
- **Validación temporal**: Evita detecciones erróneas

### **APRS Integration**
- **Direwolf TNC**: Software TNC completo
- **Datos enriquecidos**: Speed, course, altitude, audioLevel, errorRate
- **Beacon automático**: Transmisión programable
- **Position tracking**: Seguimiento de estaciones
- **Mapa en tiempo real**: Visualización web interactiva

### **Web Architecture**
- **HTTP Server nativo**: Sin frameworks pesados
- **Bootstrap 5**: CSS framework moderno
- **Leaflet.js**: Mapas interactivos suaves
- **Canvas Charts**: Gráficos de altitud dinámicos

---

## 🐛 Troubleshooting

### Audio No Funciona
```bash
# Verificar dispositivos
aplay -l && arecord -l

# Permisos de audio
sudo usermod -a -G audio $USER

# Configurar device en .env
AUDIO_DEVICE=default
```

### DTMF No Detecta
```bash
# Activar debug en logs
# Verificar niveles de audio con:
# 1. Cambiar DTMF_SENSITIVITY=high en .env
# 2. Monitorear logs en tiempo real
# 3. Verificar AUDIO_CHANNEL_THRESHOLD
```

### APRS No Conecta
```bash
# Verificar Direwolf
direwolf -t 0

# Verificar configuración TNC
ps aux | grep direwolf
```

### Mapa APRS No Carga
```bash
# Verificar puerto disponible
curl http://localhost:3000

# Verificar logs del servidor
npm start  # Ver logs en consola
```

---

## 📋 Changelog

### v2.9.1 - Mejoras Críticas en Alertas Meteorológicas TTS 🎙️

#### 🎙️ **Sistema de Alertas Meteorológicas Mejorado**
- [x] **Flujo de mensaje optimizado para múltiples alertas**
  - [x] Corregida estructura de mensaje para eliminar saltos abruptos
  - [x] Implementadas pausas adecuadas entre alertas usando puntos (.) en lugar de comas (,)
  - [x] Cada alerta ahora tiene pausas naturales después de su información de timing
  - [x] Transición suave hacia la información de fuente SMN al final
- [x] **Mejoras de pronunciación TTS**
  - [x] Formato 24h sin palabra "horas" para pronunciación más natural
  - [x] Nombres de días específicos en lugar de "mañana" (ej: "miércoles 10")
  - [x] Fuente SMN agregada consistentemente al final de todos los anuncios
  - [x] Identificación específica de áreas geográficas dentro de Mendoza
- [x] **Estructura de mensaje mejorada**
  - [x] Separación clara entre información de alerta y timing
  - [x] Pausas apropiadas para permitir comprensión completa
  - [x] Eliminados problemas de flujo de mensaje reportados por usuarios
  - [x] Optimización para diferentes cantidades de alertas simultáneas

### v2.9.0 - Sistema Configuración Híbrido y Baliza BBC Pips ⚙️🔊

#### ⚙️ **Sistema de Configuración Híbrido Implementado**
- [x] **ConfigurationService completo**
  - [x] Nuevo sistema de configuración con soporte de herencia
  - [x] Método get() con notación de punto y valores por defecto
  - [x] Extensión automática de configuración padre con override de propiedades
  - [x] Validación de esquemas y manejo de errores robusto
- [x] **ConfigCompat capa de compatibilidad**
  - [x] Interfaz de compatibilidad para migración gradual del sistema anterior
  - [x] Mapeo automático entre ConfigManager y ConfigurationService
  - [x] Permite mantener código existente sin cambios durante migración
  - [x] Logging de migraciones para seguimiento del proceso
- [x] **Integración híbrida en src/config/index.js**
  - [x] Sistema híbrido que usa ConfigurationService como prioritario
  - [x] Fallback automático al ConfigManager anterior en caso de error
  - [x] Compatibilidad total con código existente
  - [x] Documentación clara del proceso de migración

#### 🔊 **Baliza BBC Pips Estándar Implementada**
- [x] **Secuencia BBC estándar**
  - [x] 5 tonos cortos de 100ms a 1000Hz
  - [x] 1 tono largo final de 500ms marca hora exacta
  - [x] Patrón temporal: corto-900ms-corto-900ms-corto-900ms-corto-900ms-corto-900ms-largo
  - [x] Frecuencia 1kHz estándar para señales horarias internacionales
- [x] **Sincronización horaria perfecta**
  - [x] Transmisión exacta en horas de reloj (00:00, 01:00, 02:00, etc.)
  - [x] Cálculo automático de tiempo hasta próxima hora
  - [x] Eliminado delay inicial fijo, ahora se sincroniza inmediatamente
  - [x] Logs informativos del próximo tiempo de transmisión
- [x] **Configuración avanzada**
  - [x] Duraciones separadas para tonos cortos y largos configurables
  - [x] Validación automática de rangos de duración (50-200ms cortos, 300-1000ms largos)
  - [x] Modo de sincronización 'clock-hour' documentado en eventos
  - [x] Patrón 'bbc-pips' identificado en configuración

#### 🧹 **Limpieza y Mantenimiento**
- [x] **Eliminación archivos temporales**
  - [x] Removidos 8 archivos temporales MP3 de sistema TTS
  - [x] Limpieza automática de directorio temp/ implementada
  - [x] Gestión de espacio en disco mejorada
  - [x] Tracking de archivos temporales en git ignore
- [x] **Compatibilidad durante migración**
  - [x] SystemOutput.js con comandos DTMF hardcoded temporalmente
  - [x] Prevención de errores durante migración gradual de configuración  
  - [x] Fallbacks robustos en todas las transiciones críticas
  - [x] Documentación clara de estado de migración en comentarios

### v2.8.0 - Sistema TTS Híbrido y Mejoras de Estabilidad 🎙️

#### 🎙️ **Sistema TTS Híbrido Avanzado**
- [x] **Google TTS como motor principal**
  - [x] Implementado HybridVoiceManager con Google TTS prioritario
  - [x] Calidad de voz natural superior para anuncios
  - [x] Fragmentación inteligente para textos largos con ffmpeg
  - [x] Limpieza automática de archivos temporales
- [x] **Fallback automático a espeak**
  - [x] Sistema de fallback robusto en caso de fallo Google TTS
  - [x] Mantiene operatividad 24/7 sin interrupciones
  - [x] Estadísticas de uso con tasa de éxito por motor
  - [x] Configuración de timeout y parámetros de voz

#### 🔀 **Lógica Simplex Completa Implementada**
- [x] **Fix crítico falsos positivos DTMF**
  - [x] Implementada lógica simplex real que pausa recepción durante transmisión
  - [x] Eliminados completamente falsos positivos DTMF durante TTS
  - [x] Integración completa con todos los módulos (weather, datetime, inpres)
  - [x] Múltiples capas de protección anti-falsos positivos
- [x] **Integración AudioManager**
  - [x] Método playWeatherAlertWithPaplay() con lógica simplex
  - [x] Pausar/reanudar grabación automática durante transmisiones
  - [x] Eventos de transmisión para monitoreo del estado
  - [x] Timeout extendido (2 minutos) para alertas meteorológicas largas

#### 🗺️ **Mejoras Mapa APRS**
- [x] **Marcadores optimizados**
  - [x] Eliminadas animaciones pulsantes para mejor rendimiento
  - [x] Removidos emojis internos de marcadores de estación
  - [x] Marcadores estáticos más limpios y profesionales
  - [x] Fix duplicación infinita del marcador de repetidora
- [x] **Limpieza de código**
  - [x] clearMarkers() mejorado elimina todos los elementos
  - [x] Gestión correcta de coverageCircle y repeaterMarker
  - [x] Sin elementos duplicados en el mapa

#### 📡 **DuckDNS Completamente Funcional**
- [x] **DNS dinámico integrado**
  - [x] Actualización automática cada 5 minutos
  - [x] Dominio vx200-yoshua.duckdns.org operativo
  - [x] Resolución DNS correcta verificada
  - [x] Integración con sistema de logs

### v2.7.0 - Sistema Headless con Mapa APRS Completo 🖥️

#### 🚀 **Transformación Headless**
- [x] **Dashboard web eliminado completamente**
  - [x] Removido sistema Express.js pesado con Socket.IO
  - [x] Eliminadas 500+ líneas de código frontend innecesario
  - [x] Removidos archivos CSS, JavaScript y HTML del dashboard
  - [x] Sistema ahora funciona completamente por consola
- [x] **Mapa APRS liviano implementado**
  - [x] Servidor HTTP nativo minimalista en src/aprs-map/server.js
  - [x] Interfaz Bootstrap 5 + Leaflet.js en map.html
  - [x] Solo 200 líneas de código servidor vs 1500+ anteriores
  - [x] Puerto 3000 optimizado sin conflictos

#### 🗺️ **Mapa APRS Interactivo Avanzado**
- [x] **Datos enriquecidos completos de Direwolf**
  - [x] Speed (velocidad en km/h)
  - [x] Course (rumbo en grados 0-359°)
  - [x] Altitude (altitud sobre nivel del mar)
  - [x] Audio Level (nivel de señal con estadísticas)
  - [x] Error Rate (tasa de errores de recepción)
- [x] **Interfaz visual mejorada**
  - [x] Marcadores grandes de 32px vs 22px anteriores
  - [x] Indicadores visuales para velocidad, curso y altitud
  - [x] Panel de información detallada con 6 secciones organizadas
  - [x] Charts de altitud dinámicos con Canvas HTML5
- [x] **Responsive design avanzado**
  - [x] Optimizado para dispositivos móviles
  - [x] Touch-friendly con marcadores grandes
  - [x] Iconografía moderna con emojis descriptivos
  - [x] Bootstrap 5 con diseño limpio y profesional

#### 📊 **APIs REST y Actualización Automática**
- [x] **Endpoints optimizados**
  - [x] `/api/positions` - Posiciones con datos enriquecidos
  - [x] `/api/repeater` - Estado del repetidor y estadísticas
  - [x] Datos JSON limpios para integración externa
- [x] **Sistema de actualización**
  - [x] Actualización automática cada 30 segundos
  - [x] Enriquecimiento dinámico desde logs de Direwolf
  - [x] Persistencia de datos entre reinicios

#### 🎯 **Optimizaciones de Rendimiento**
- [x] **Menor consumo de recursos**
  - [x] Eliminado Express.js y dependencias pesadas
  - [x] Servidor HTTP nativo más eficiente
  - [x] Sin WebSocket ni Socket.IO innecesarios
  - [x] Ideal para dispositivos embebidos y servidores 24/7
- [x] **Código más limpio**
  - [x] Arquitectura simplificada y modular
  - [x] Separación clara entre backend y frontend
  - [x] Mantenimiento más sencillo

### v2.6.2 - Fix APRS Posiciones y Alertas Meteorológicas Completas 📍

#### 🔧 **Correcciones Críticas**
- [x] **Fix APRS Posiciones Reales**
  - [x] Corregido parser para mostrar coordenadas reales transmitidas
  - [x] Eliminado uso de coordenadas fallback del repetidor
  - [x] Parser mejorado de logs Direwolf para obtener coordenadas exactas
  - [x] Ahora muestra 11 ubicaciones reales vs 1-2 anteriormente
- [x] **Contador de posiciones preciso**
  - [x] Refleja packets reales recibidos (71) vs posiciones únicas
  - [x] Diferenciación entre packets totales y ubicaciones únicas
- [x] **Fix audio alertas meteorológicas**
  - [x] Solucionado problema de audio cortado en repeticiones
  - [x] Sistema de fallback secuencial mejorado
  - [x] Eliminado truncamiento que solo reproducía primer fragmento

### v2.6.1 - Fix DTMF Anti-Falsos Positivos y Estabilidad 24/7 🔇

#### 🔧 **Correcciones Críticas**
- [x] **Eliminación de falsos positivos DTMF**
  - [x] Removido `playTone(400, 200, 0.5)` de `handleUnknownCommand()` que causaba feedback
  - [x] Fix crítico: El tono de "comando desconocido" generaba loops de retroalimentación
  - [x] Eliminado completamente el problema de detecciones DTMF durante conversaciones
  - [x] Sistema ahora diferencia correctamente entre DTMF real y artefactos de voz
- [x] **Pruebas de estabilidad 24/7**
  - [x] Sistema operativo durante 27+ horas continuas sin interrupciones
  - [x] Zero errores no controlados durante test de estabilidad extendido
  - [x] Confirmada capacidad de operación 24/7 en producción
  - [x] Monitoreo continuo cada hora durante testing nocturno

---

## 🎯 Próximas Versiones

### v2.9 - Planificado
- [ ] **Contenedorización Docker** para despliegue fácil
- [ ] **Métricas Prometheus** para monitoreo avanzado
- [ ] **API GraphQL** para consultas flexibles
- [ ] **Multi-repetidora** con sincronización

### v3.0 - Futuro
- [ ] **App móvil nativa** con React Native
- [ ] **Integración LoRa** para enlaces remotos
- [ ] **Machine Learning** para predicción de tráfico
- [ ] **Clustering** para alta disponibilidad

---

## 📞 Soporte y Contacto

**Desarrollado por: LU5MCD**

- 📧 **Email**: fokerone@gmail.com  
- 🌐 **GitHub**: https://github.com/fokerone/vx200RPTController
- 📻 **QRZ**: https://www.qrz.com/db/LU5MCD

---

## 🏆 Reconocimientos

- **dtmf-detection-stream**: Excelente librería para detección DTMF
- **Direwolf**: Software TNC indispensable para APRS
- **Bootstrap 5**: Framework CSS moderno y responsive
- **Leaflet.js**: Biblioteca de mapas interactivos ligera y potente

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

**✨ VX200 Controller v2.9.1 - Mejoras Críticas en Alertas Meteorológicas TTS 📡🎙️**