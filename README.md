# VX200 Controller

## 📡 Sistema de Control para Repetidora Simplex v2.1.1

Sistema completo de control inteligente para repetidora simplex desarrollado en Node.js. Incluye decodificación DTMF profesional con anti-falsos positivos, múltiples servicios automatizados, panel web moderno con navegación por pestañas e integración APRS completa.

**🎉 Versión 2.1.1 - Panel Web Moderno y Optimizado**

---

## ✨ Características Principales

### 🎵 **Sistema de Audio Avanzado**
- Grabación en tiempo real con soporte ALSA/PulseAudio
- **Decodificador DTMF Profesional** con `dtmf-detection-stream`
- **Anti-falsos positivos** con detección de voz integrada
- Configuración de sensibilidad (Low/Medium/High)
- Modo debug para desarrollo y pruebas
- Roger Beep estilo Kenwood configurable

### 📡 **Integración APRS Completa**
- **TNC Software** integrado con Direwolf
- Transmisión de beacons automáticos y manuales
- Recepción y tracking de estaciones
- **Mapa APRS interactivo** en tiempo real
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
- **AI Chat**: Consultas con OpenAI GPT (`*2`)
- **SMS**: Mensajería con Twilio (`*3`)
- **Weather**: Información meteorológica (`*4` actual, `*5` voz)

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
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

---

## 🎛️ Comandos DTMF

| Comando | Función | Descripción |
|---------|---------|-------------|
| `*1` | DateTime | Anuncia fecha y hora actual |
| `*2` | AI Chat | Sistema de consultas con OpenAI |
| `*3` | SMS | Sistema de mensajes Twilio |
| `*4` | Weather | Clima actual |
| `*5` | Weather Voice | Clima con voz natural |
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
│   │   ├── aiChat.js            # Módulo IA con OpenAI
│   │   ├── sms.js               # Módulo SMS con Twilio
│   │   ├── weather.js           # Módulo meteorológico
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

## 📋 Changelog v2.1.1

### ✅ Nuevas Características
- [x] **Panel web rediseñado** con navegación por pestañas
- [x] **Monitor DTMF profesional** con estadísticas en tiempo real
- [x] **Dashboard APRS completo** con mapa interactivo
- [x] **Sistema de configuración dinámico**
- [x] **Controles de sensibilidad DTMF**

### 🐛 Correcciones
- [x] **Mapeo DTMF** corregido para comandos *4 y *5
- [x] **Optimización de rendimiento** del panel web
- [x] **Limpieza de código** - eliminadas 181 líneas innecesarias
- [x] **Interfaz simplificada** - removido indicador de canal

### ⚡ Mejoras Técnicas
- [x] **Cache de elementos DOM** para mejor performance
- [x] **Socket.IO optimizado** para tiempo real
- [x] **CSS responsive** completamente reescrito
- [x] **Timeouts inteligentes** para actualizaciones

---

## 🎯 Próximas Versiones

### v2.2 - Planificado
- [ ] **Métricas avanzadas** del sistema
- [ ] **API REST completa** para integraciones
- [ ] **Backup automático** de configuración
- [ ] **Sistema de alertas** por email/SMS

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