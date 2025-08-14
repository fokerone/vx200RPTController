# VX200 Controller

## 📡 Sistema de Control para Repetidora Simplex v2.4.2

Sistema completo de control inteligente para repetidora simplex desarrollado en Node.js. Incluye decodificación DTMF profesional con anti-falsos positivos, múltiples servicios automatizados, panel web moderno con navegación por pestañas e integración APRS completa con historial de posiciones y análisis de cobertura avanzado.

**🚀 Versión 2.4.2 - Zona Horaria Corregida y Coordinación de Timers Optimizada**

### 📅 **Novedades v2.4.2** (Agosto 2025)
- **🕐 Zona Horaria Corregida**: Cambio de Buenos Aires a Mendoza (GMT-3) 
- **⚙️ Coordinación de Timers Optimizada**: Eliminadas colisiones entre APRS, Baliza y Alertas
- **📊 Logs con Timestamp Correcto**: Uso de `moment-timezone` para hora local exacta
- **🎯 Timers como Reloj Suizo**: APRS (15min+7.5min), Baliza (60min+2.5min+5min inicial), Alertas (87min/101min/17min)
- **🔧 Refactor de Imports**: Logger centralizado para mejor organización del código

---

## ✨ Características Principales

### 🎵 **Sistema de Audio Avanzado**
- Grabación en tiempo real con soporte ALSA/PulseAudio
- **Decodificador DTMF Profesional** con `dtmf-detection-stream`
- **Anti-falsos positivos** con detección de voz integrada
- Configuración de sensibilidad (Low/Medium/High)
- Modo debug para desarrollo y pruebas
- Roger Beep estilo Kenwood configurable

### 📡 **Sistema APRS Completo con Análisis de Cobertura**
- **TNC Software** integrado con Direwolf
- **Historial completo de posiciones** por estación con persistencia
- **180+ símbolos APRS oficiales** con emojis descriptivos
- **Cálculo de distancias** precisas desde repetidora (fórmula Haversine)
- **Círculo de cobertura dinámico** en mapa web
- **Widget en tiempo real** de estación más lejana recibida
- **Detección automática** de nuevas ubicaciones (>100m)
- **Mapa APRS interactivo** con marcadores informativos
- Transmisión de beacons automáticos y manuales
- Configuración dinámica desde panel web
- Estadísticas detalladas de tráfico APRS

### 🌐 **Panel Web Moderno v2.1**
- **Navegación por pestañas** (Estado, DTMF, APRS, Configuración)
- **Monitor DTMF en tiempo real** con historial
- **Dashboard APRS** con mapa y estadísticas
- Controles de sensibilidad y debug DTMF
- Interfaz completamente **responsive**
- **Socket.IO** para actualizaciones en tiempo real

### 🔊 **Sistema de Módulos**
- **Baliza Inteligente**: Transmisión automática/manual (`*9`)
- **DateTime**: Anuncio de fecha y hora (`*1`)
- **Weather**: Información meteorológica (`*4` actual, `*5` voz)
- **🌦️ Weather Alerts**: Sistema de alertas SMN Argentina (`*7` consultar, `*0` forzar verificación)

### 🌦️ **Sistema de Alertas Meteorológicas SMN**
- **Monitoreo automático** cada 90 minutos de alertas SMN Argentina
- **Cobertura completa** de la provincia de Mendoza
- **Filtrado geográfico inteligente** por coordenadas y polígonos CAP
- **Anuncios automáticos** con Google TTS + fragmentación para textos largos
- **Integración APRS** con comentarios dinámicos incluyendo clima actual
- **Panel web actualizado** con estado en tiempo real de alertas activas
- **Repetición automática** cada 105 minutos para alertas vigentes

### 🗺️ **Nuevo v2.3.0: Análisis de Cobertura APRS Avanzado**

#### **📍 Sistema de Historial de Posiciones**
- **Múltiples ubicaciones por callsign** - Detecta automáticamente movimiento >100 metros
- **Persistencia completa** - Guarda y carga historial entre reinicios del sistema
- **Base de datos robusta** - Map<callsign, Array<posiciones>> para máximo rendimiento
- **API optimizada** - Soporte completo para aplicaciones web y móviles

#### **🎯 Mapeo de Símbolos APRS Oficial**
- **180+ símbolos** de tablas primaria (/) y alternativa (\) completas
- **Emojis descriptivos** - Mapeo visual intuitivo (🚗 Auto, 📡 Repetidor, ✈️ Avión)
- **Basado en especificación oficial** - Compatible con http://www.aprs.org/symbols/
- **Soporte completo MIC-E** - Kenwood, Yaesu y otros fabricantes

#### **📏 Análisis de Distancias y Cobertura**
- **Cálculo geodésico preciso** - Fórmula Haversine para distancias exactas
- **Círculo de cobertura dinámico** - Visualización automática del rango real
- **Widget en tiempo real** - Estación más lejana actualizada automáticamente
- **Marcadores informativos** - Distancia, símbolo y comentario en cada posición

#### **🎮 Casos de Uso Prácticos**
```bash
# Análisis de cobertura típico
1. Emitir desde ubicación A → Primera posición (0.5km)
2. Moverse >100m a ubicación B → Nueva ubicación detectada automáticamente  
3. Emitir desde ubicación B → Historial expandido (1.2km)
4. Círculo de cobertura se ajusta → Widget muestra "1.2 km"
5. Repetir proceso → Mapa completo de cobertura real
```

**Ideal para:**
- 🔬 **Pruebas de cobertura de repetidoras**
- 📊 **Análisis de propagación VHF/UHF** 
- 🚨 **Monitoreo de emergencias**
- 🏃 **Seguimiento de eventos deportivos**
- 📈 **Estadísticas de red APRS**

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

**Panel web disponible en: http://localhost:3000**

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# Sistema
CALLSIGN=TU_INDICATIVO
NODE_ENV=production
WEB_PORT=3000

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
│   │   └── rogerBeep.js         # Roger Beep Kenwood
│   ├── modules/
│   │   ├── baliza.js            # Módulo de baliza
│   │   ├── datetime.js          # Módulo fecha/hora
│   │   ├── weather.js           # Módulo meteorológico
│   │   ├── weather-voice.js     # Módulo clima con voz
│   │   ├── weatherAlerts.js     # Módulo alertas meteorológicas
│   │   └── aprs.js              # Módulo APRS con Direwolf
│   └── web/
│       └── server.js            # Servidor web con Socket.IO
├── public/
│   ├── index.html               # Panel web principal
│   ├── aprs-map.html            # Mapa APRS interactivo
│   ├── css/style.css            # Estilos modernos
│   └── js/app.js                # JavaScript frontend
├── config/
│   └── default.json             # Configuración por defecto
├── .env.example                 # Template de variables
└── README.md
```

---

## 🖥️ Panel Web v2.1

### **Navegación por Pestañas**
- **🏠 Estado del Sistema**: Overview general y control de módulos
- **📞 Monitor DTMF**: Seguimiento en tiempo real con estadísticas
- **📡 APRS**: Dashboard completo con mapa y beacons
- **⚙️ Configuración**: Settings dinámicos del sistema

### **Funcionalidades Destacadas**
- **Monitor DTMF en Tiempo Real**: Historial, validaciones y debug
- **Dashboard APRS**: Mapa interactivo con estaciones activas
- **Estadísticas Avanzadas**: Métricas de DTMF y APRS
- **Controles Dinámicos**: Sensibilidad DTMF, beacons APRS
- **Responsive Design**: Optimizado para móviles y tablets

---

## 🔧 Scripts Disponibles

```bash
# Iniciar sistema completo
npm start

# Modo desarrollo con hot-reload
npm run dev

# Solo servidor web (testing)
npm run web-only

# Limpiar archivos temporales
npm run clean
```

---

## 🛠️ Características Técnicas v2.1

### **DTMF Profesional**
- **dtmf-detection-stream**: Librería especializada
- **Anti-falsos positivos**: Detección de voz integrada
- **Configuración avanzada**: 3 niveles de sensibilidad
- **Modo debug**: Para desarrollo y troubleshooting
- **Validación temporal**: Evita detecciones erróneas

### **APRS Integration**
- **Direwolf TNC**: Software TNC completo
- **Beacon automático**: Transmisión programable
- **Position tracking**: Seguimiento de estaciones
- **Mapa en tiempo real**: Visualización web interactiva

### **Web Architecture**
- **Socket.IO**: Comunicación bidireccional
- **Navegación SPA**: Single Page Application
- **Cache DOM**: Optimización de rendimiento
- **Responsive CSS**: Grid y Flexbox moderno

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
# Verificar desde panel web:
# 1. Ir a pestaña "Monitor DTMF"
# 2. Activar "Modo Debug"
# 3. Cambiar sensibilidad a "Alta"
# 4. Verificar estadísticas en tiempo real
```

### APRS No Conecta
```bash
# Verificar Direwolf
direwolf -t 0

# Verificar configuración TNC
ps aux | grep direwolf
```

---

## 📋 Changelog

### v2.4.0 - Optimización y Limpieza del Sistema 🧹

#### 🔧 **Optimizaciones y Mejoras**
- [x] **Limpieza completa de dependencias**
  - [x] Eliminadas 13 dependencias no utilizadas (fs-extra, ejs, fft-js, multer, etc.)
  - [x] Reducción significativa del tamaño de node_modules (184 packages removidos)
  - [x] Sistema más ligero y eficiente
- [x] **Eliminación de módulos obsoletos**
  - [x] Removido completamente módulo AI Chat (*2) - Sin uso activo
  - [x] Removido completamente módulo SMS (*3) - Sin uso activo  
  - [x] Removido completamente módulo Mumble Bridge - Sin uso activo
  - [x] Limpieza de configuración y variables de entorno asociadas
- [x] **Mejoras en panel web**
  - [x] Interfaz más limpia sin módulos no utilizados
  - [x] Banner de inicio mejorado con localhost + IP local
  - [x] Eliminadas secciones de configuración innecesarias (OpenAI, Twilio)
- [x] **Correcciones y estabilidad**
  - [x] Corregida visualización de alertas meteorológicas en panel web
  - [x] Implementado sistema de cleanup automático 24/7
  - [x] Mejorado mapa APRS con datos reales y mejor UX
  - [x] Sistema más estable y enfocado en funcionalidades principales

#### 📡 **Comandos DTMF Actuales**
- [x] `*1` → DateTime (Fecha y hora)
- [x] `*4` → Weather (Clima actual)
- [x] `*5` → Weather Voice (Clima con voz)
- [x] `*7` → Weather Alerts (Alertas meteorológicas)
- [x] `*0` → Force Check (Verificación manual alertas)
- [x] `*9` → Baliza (Baliza manual)

#### 🎯 **Enfoque del Sistema**
El sistema ahora está **completamente enfocado** en las funcionalidades principales:
- **Radio Amateur**: DTMF, Baliza, APRS
- **Meteorología**: Clima actual, pronósticos, alertas SMN
- **Panel Web**: Monitoreo en tiempo real, configuración, estadísticas

### v2.3.0 - Sistema APRS Completo con Historial de Posiciones 🚀

#### 📡 **Nuevas Características APRS**
- [x] **Sistema de historial completo de posiciones**
  - [x] Múltiples ubicaciones por callsign con detección automática >100m
  - [x] Persistencia completa entre reinicios del sistema
  - [x] Estructura Map<callsign, Array<posiciones>> optimizada
  - [x] API mejorada para soporte de aplicaciones web
- [x] **Mapeo completo de símbolos APRS**
  - [x] 180+ símbolos oficiales de tablas primaria (/) y alternativa (\)
  - [x] Emojis descriptivos para cada símbolo (🚗 📡 ✈️ 🏠)
  - [x] Basado en especificación oficial http://www.aprs.org/symbols/
  - [x] Soporte completo MIC-E para radios Kenwood/Yaesu
- [x] **Análisis avanzado de cobertura**
  - [x] Cálculo geodésico preciso con fórmula Haversine
  - [x] Círculo de cobertura dinámico en mapa web
  - [x] Widget flotante con estación más lejana en tiempo real
  - [x] Marcadores con distancia, símbolo y comentario detallado
- [x] **Mejoras en frontend**
  - [x] Lista de estaciones con distancias calculadas
  - [x] Información completa en popups de marcadores  
  - [x] Widget de estación más lejana (esquina inferior izquierda)
  - [x] Círculo visual de rango de recepción actualizado automáticamente

#### 🔧 **Mejoras Técnicas**
- [x] **Backend robusto**
  - [x] Detección inteligente de nuevas ubicaciones
  - [x] Sistema de logs diferenciados (nueva estación/ubicación/actualización)
  - [x] API `getAllPositions()` optimizada para historial múltiple
  - [x] Limpieza avanzada de comentarios APRS
- [x] **Casos de uso prácticos**
  - [x] Análisis profesional de cobertura de repetidoras
  - [x] Monitoreo de eventos y emergencias
  - [x] Seguimiento de estaciones móviles
  - [x] Estadísticas de propagación VHF/UHF

### v2.2.0 - Sistema de Alertas Meteorológicas ✨

#### 🌦️ **Nuevas Características**
- [x] **Sistema de Alertas Meteorológicas SMN** completo
  - [x] Monitoreo automático cada 90 minutos
  - [x] Cobertura completa provincia de Mendoza  
  - [x] Filtrado geográfico por coordenadas y polígonos CAP
  - [x] Anuncios automáticos con Google TTS + fragmentación
  - [x] Comandos DTMF `*7` (consultar) y `*0` (forzar verificación)
- [x] **Integración APRS mejorada**
  - [x] Comentarios dinámicos con clima actual (temp, humedad, viento)
  - [x] Indicadores de alertas activas en beacon
  - [x] Actualización automática cada 15 minutos
- [x] **Panel web actualizado**
  - [x] Sección dedicada de alertas meteorológicas
  - [x] Estado del sistema en tiempo real 
  - [x] Contador de alertas activas
  - [x] Información de próximas verificaciones

#### 🐛 **Correcciones**
- [x] **Panel web**: Estado del sistema mostraba "--" 
- [x] **Panel web**: Próxima verificación mostraba "--"
- [x] **Panel web**: Contador de alertas siempre mostraba "0"
- [x] **Audio**: Reproductores timeout mejorados para alertas largas (45s)
- [x] **TTS**: Fragmentación automática para textos >200 caracteres
- [x] **Audio**: ffmpeg reemplazó sox para mejor compatibilidad MP3

### v2.1.1 - Panel Web Moderno

#### ✅ Características Anteriores
- [x] **Panel web rediseñado** con navegación por pestañas
- [x] **Monitor DTMF profesional** con estadísticas en tiempo real
- [x] **Dashboard APRS completo** con mapa interactivo
- [x] **Sistema de configuración dinámico**
- [x] **Controles de sensibilidad DTMF**

---

## 🎯 Próximas Versiones

### v2.3 - Planificado
- [ ] **Métricas avanzadas** del sistema
- [ ] **API REST completa** para integraciones
- [ ] **Backup automático** de configuración
- [ ] **Alertas por múltiples provincias**

### v2.3 - Futuro
- [ ] **App móvil nativa** con React Native
- [ ] **Integración LoRa** para enlaces remotos
- [ ] **Machine Learning** para predicción de tráfico
- [ ] **Multi-repetidora** con sincronización

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
- **OpenAI**: Integración de IA conversacional
- **Socket.IO**: Comunicación en tiempo real

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

**✨ VX200 Controller v2.1.1 - Sistema de Repetidora Moderno y Profesional 📡🚀**