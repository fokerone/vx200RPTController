# VX200 Controller

## 📡 Sistema de Control para Repetidora Simplex

Sistema completo de control inteligente para repetidora simplex desarrollado en Node.js. Incluye decodificación DTMF avanzada, múltiples servicios automatizados, panel web de control en tiempo real y transmisión inteligente con detección de canal ocupado.

**🎉 Sistema completamente refactorizado con las mejores prácticas de desarrollo**

---

## ✨ Características Principales

### 🎵 **AudioManager Avanzado**
- Grabación de audio en tiempo real con soporte para ALSA/PulseAudio
- Decodificación DTMF usando FFT personalizada
- Detección inteligente de actividad de canal
- Roger Beep estilo Kenwood configurable
- Cola de audio con prioridades

### 🔊 **Sistema de Baliza Inteligente**
- **Automática**: Transmisión programable cada X minutos
- **Manual**: Activación instantánea por comando DTMF `*9`
- Mensajes personalizables con TTS
- Espera canal libre para transmitir

### 📅 **Módulo DateTime**
- Anuncio de fecha y hora actual en español
- Activación por comando DTMF `*1`
- Formato natural con moment.js

### 🤖 **Módulo IA Chat**
- Sistema de consultas por DTMF `*2`
- Integración con OpenAI GPT (configurable)
- Respuestas por voz con TTS

### 📱 **Módulo SMS**
- Sistema completo de mensajería por DTMF `*3`
- Integración con Twilio (configurable)
- Flujo interactivo de envío de mensajes

### 🌐 **Panel Web de Control Moderno**
- Interfaz terminal-style responsive
- Monitor en tiempo real de actividad DTMF
- Control remoto de todos los módulos
- Logs del sistema en vivo con Socket.IO
- Configuración de Roger Beep
- Indicadores visuales de estado del sistema

### 🧠 **Transmisión Inteligente**
- Detección automática de canal ocupado
- Cola de transmisiones con prioridades
- Espera inteligente para evitar interferencias
- Manejo robusto de errores

---

## 🚀 Instalación y Configuración

### Prerrequisitos
- **Node.js** 16.x o superior
- **NPM** o Yarn
- **Sistema Linux** recomendado (probado en Arch Linux)
- **Hardware de audio** compatible con ALSA

### Instalación Rápida

```bash
# Clonar el repositorio
git clone <url-repositorio>
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

El sistema está configurado para funcionar con hardware de audio real. Para **ThinkPad T400** con Arch Linux:

```bash
# Verificar dispositivos de audio disponibles
aplay -l
arecord -l

# Configurar en .env
AUDIO_DEVICE=default  # o hw:0,0 según tu hardware
```

El sistema estará disponible en: **http://localhost:3000**

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# Sistema
CALLSIGN=TU_INDICATIVO
NODE_ENV=production
WEB_PORT=3000

# Audio (configurado para hardware real)
AUDIO_DEVICE=default
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNEL_THRESHOLD=0.02

# TTS
TTS_VOICE=es
TTS_SPEED=150

# Roger Beep
ROGER_BEEP_ENABLED=true
ROGER_BEEP_TYPE=kenwood
ROGER_BEEP_VOLUME=0.7

# Baliza
BALIZA_ENABLED=true
BALIZA_INTERVAL=15
BALIZA_MESSAGE=TU_INDICATIVO Repetidora Simplex

# APIs Opcionales
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

### Archivo config/config.json

```json
{
  "callsign": "LU5MCD",
  "version": "2.0",
  "rogerBeep": {
    "enabled": true,
    "type": "kenwood",
    "volume": 0.7,
    "duration": 250,
    "delay": 100
  },
  "baliza": {
    "enabled": true,
    "interval": 15,
    "tone": {
      "frequency": 1000,
      "duration": 500,
      "volume": 0.7
    },
    "message": "LU5MCD Repetidora Simplex",
    "autoStart": true,
    "waitForFreeChannel": true
  }
}
```

---

## 🎛️ Comandos DTMF

| Comando | Función | Descripción |
|---------|---------|-------------|
| `*1` | DateTime | Anuncia fecha y hora actual |
| `*2` | IA Chat | Sistema de consultas con GPT |
| `*3` | SMS | Sistema de mensajes Twilio |
| `*9` | Baliza | Activa baliza manual |

---

## 📁 Estructura del Proyecto (Refactorizada)

```
vx200RPTController/
├── src/
│   ├── index.js                 # VX200Controller principal
│   ├── constants.js             # Constantes del sistema
│   ├── utils.js                 # Utilidades compartidas
│   ├── start-with-web.js        # Script de inicio con banner
│   ├── audio/
│   │   ├── audioManager.js      # Gestor de audio completo
│   │   ├── dtmfDecoder.js       # Decodificador DTMF con FFT
│   │   └── rogerBeep.js         # Roger Beep Kenwood
│   ├── modules/
│   │   ├── baliza.js            # Módulo de baliza
│   │   ├── datetime.js          # Módulo fecha/hora
│   │   ├── aiChat.js            # Módulo IA con OpenAI
│   │   └── sms.js               # Módulo SMS con Twilio
│   └── web/
│       └── server.js            # Servidor web con Socket.IO
├── views/
│   └── index.ejs                # Panel web terminal-style
├── public/
│   ├── css/style.css            # Estilos modernos
│   └── js/main.js               # JavaScript frontend
├── config/
│   └── config.json              # Configuración del sistema
├── .env.example                 # Template de variables
├── CONFIGURATION.md             # Guía completa de configuración
├── package.json
└── README.md
```

---

## 🖥️ Panel Web

Accede al panel de control en **http://localhost:3000**

### Funcionalidades del Panel:
- 📊 **Dashboard Terminal**: Estilo retro de terminal
- 📡 **Monitor de Módulos**: Estado en tiempo real
- 📞 **Monitor DTMF**: Visualización de comandos
- 🔴 **Indicador de Canal**: Estado ocupado/libre con niveles
- 🔊 **Control Roger Beep**: Toggle y test desde web
- 📝 **Logs en Vivo**: Socket.IO en tiempo real
- 🎛️ **Controles de Sistema**: Activar/desactivar servicios
- ⚙️ **Configuración Baliza**: Desde el panel web

---

## 🔧 Scripts Disponibles

```bash
# Iniciar sistema con banner
npm start

# Modo desarrollo
npm run dev

# Solo servidor web
npm run web-only

# Ejecutar tests completos
npm test
```

---

## 🛠️ Características Técnicas

### Arquitectura
- **Patrón MVC**: Separación clara de responsabilidades
- **Event-Driven**: EventEmitter para comunicación entre módulos
- **Logging Estructurado**: Logger personalizado con niveles
- **Error Handling**: Manejo robusto de errores en todos los módulos
- **State Management**: Estados consistentes usando constantes

### Audio Processing
- **FFT Custom**: Transformada rápida de Fourier para DTMF
- **Detección de Canal**: Análisis RMS para actividad
- **Queue System**: Cola de audio con prioridades
- **TTS Integration**: espeak para síntesis de voz

### Web Interface
- **Socket.IO**: Comunicación bidireccional en tiempo real
- **Express.js**: API REST robusta
- **EJS Templates**: Renderizado del lado del servidor
- **CORS Security**: Configuración segura de orígenes

---

## 🐛 Troubleshooting

### Audio No Funciona
```bash
# Verificar dispositivos
aplay -l
arecord -l

# Permisos de audio (si es necesario)
sudo usermod -a -G audio $USER

# Configurar device correcto en .env
AUDIO_DEVICE=default  # o hw:0,0
```

### Panel Web No Conecta
```bash
# Verificar puerto disponible
ss -tlnp | grep :3000

# Cambiar puerto si está ocupado
WEB_PORT=3001
```

### Errores de Grabación
- Verificar que no haya otros procesos usando audio
- Matar procesos sox residuales: `killall sox`
- Reiniciar PulseAudio: `pulseaudio -k && pulseaudio --start`

---

## 📋 Estado del Proyecto

### ✅ Completado
- [x] **Refactorización completa** con mejores prácticas
- [x] **AudioManager** funcionando con hardware real
- [x] **WebServer** operativo con Socket.IO
- [x] **Todos los módulos** refactorizados y funcionales
- [x] **Panel web** moderno y responsive
- [x] **Sistema de logging** estructurado
- [x] **Configuración** flexible con .env
- [x] **Documentación** completa

### 🔄 En Progreso
- [ ] Resolución de problemas encontrados en testing
- [ ] Optimizaciones de rendimiento
- [ ] Mejoras de UX en panel web

### 📋 Próximas Características
- [ ] **Métricas avanzadas** del sistema
- [ ] **Backup automático** de configuración
- [ ] **API REST** extendida
- [ ] **App móvil** complementaria

---

## 📞 Soporte y Contacto

**Desarrollado por: LU5MCD**

- 📧 **Email**: fokerone@gmail.com
- 🌐 **QRZ**: https://www.qrz.com/db/LU5MCD

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

**¡Sistema de repetidora totalmente funcional y moderno! 📡🎉**